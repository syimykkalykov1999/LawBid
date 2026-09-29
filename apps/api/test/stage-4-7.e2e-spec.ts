import type { AddressInfo, Server } from 'node:net';
import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { TokenService } from '../src/modules/auth/services/token.service';
import { CaseHistoryExportRunner } from '../src/modules/case-history/case-history-export.runner';

/**
 * docs/04_CASES_BIDS.md §16 stage 4.7 acceptance, against real
 * CockroachDB/Redis/MinIO:
 *  - without reauthToken → REAUTH_REQUIRED;
 *  - deleting a case from the feed does not remove it from the history;
 *  - an attorney sees the client's name only after contacts were
 *    disclosed, and never another attorney's bid events;
 *  - every entry is logged as `history_viewed`;
 *  - the PDF is built in the background and served by a signed link valid
 *    10 minutes; each download needs a fresh reauth.
 */
jest.setTimeout(90_000);

describe('Case history (e2e, docs/04 §12, stage 4.7)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tokens: TokenService;
  let baseUrl = '';
  let practiceAreaId = '';

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    app.setGlobalPrefix('api/v1', {
      exclude: ['/health/live', '/health/ready', '/docs', '/docs-json'],
    });
    await app.listen(0, '127.0.0.1');
    const { port } = (app.getHttpServer() as Server).address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${port}`;
    prisma = app.get(PrismaService);
    tokens = app.get(TokenService);

    await prisma.state.upsert({
      where: { code: 'NJ' },
      create: { code: 'NJ', name: 'New Jersey', is_active: true },
      update: {},
    });
    const area = await prisma.practiceArea.upsert({
      where: { code: 'e2e_history_leaf' },
      create: {
        code: 'e2e_history_leaf',
        name_en: 'E2E history',
        i18n_key: 'practice.e2e_history_leaf',
        sort: 1,
      },
      update: {},
    });
    practiceAreaId = area.id;
  });

  afterAll(async () => {
    await app.close();
  });

  const api = () => request(baseUrl);

  async function user(
    role: 'client' | 'attorney',
    opts: { verified?: boolean; practiceAreaIds?: string[] } = {},
  ): Promise<{ id: string; sid: string; auth: Record<string, string> }> {
    const u = await prisma.user.create({ data: { role } });
    if (role === 'attorney') {
      const username = `att_${u.id.slice(0, 8)}`;
      await prisma.attorneyProfile.create({
        data: {
          user_id: u.id,
          username,
          username_lower: username,
          languages: ['en'],
          verification_status:
            opts.verified === false ? 'unverified' : 'verified',
        },
      });
      await prisma.attorneyLicense.create({
        data: {
          attorney_id: u.id,
          state_code: 'NJ',
          bar_number: `NJ-${randomUUID()}`,
          license_status: 'verified',
        },
      });
      for (const id of opts.practiceAreaIds ?? [practiceAreaId]) {
        await prisma.attorneyPracticeArea.create({
          data: { attorney_id: u.id, practice_area_id: id },
        });
      }
    }
    const sid = randomUUID();
    const token = tokens.signAccessToken({
      sub: u.id,
      role,
      sid,
      verified: role === 'attorney',
      subscriptionStatus: 'none',
    });
    return {
      id: u.id,
      sid,
      auth: { Authorization: `Bearer ${token}` },
    };
  }

  async function kase(
    clientId: string,
    opts: { areaId?: string } = {},
  ): Promise<string> {
    const c = await prisma.case.create({
      data: {
        client_id: clientId,
        title: 'Speeding ticket in Trenton',
        description: 'Got a ticket on the turnpike last week driving home.',
        practice_area_id: opts.areaId ?? practiceAreaId,
        primary_state_code: 'NJ',
        budget_mode: 'clarify_later',
        status: 'open',
      },
    });
    await prisma.caseState.create({
      data: { case_id: c.id, state_code: 'NJ', is_primary: true },
    });
    return c.id;
  }

  function bidBody(overrides: Record<string, unknown> = {}) {
    return {
      feeType: 'fixed',
      amountCents: 60_000,
      message: 'I handle NJ speeding tickets every week, happy to help.',
      startAvailability: 'immediately',
      ...overrides,
    };
  }

  function postBid(
    auth: Record<string, string>,
    caseId: string,
    body: Record<string, unknown>,
    key: string | null = randomUUID(),
  ) {
    const req = api().post(`/api/v1/cases/${caseId}/bids`).set(auth);
    if (key !== null) req.set('Idempotency-Key', key);
    return req.send(body);
  }

  const reauthFor = (u: { id: string; sid: string }) => ({
    'X-Reauth-Token': tokens.signReauthToken({ sub: u.id, sid: u.sid }),
  });

  const history = (
    u: { id: string; sid: string; auth: Record<string, string> },
    path = '',
    reauth: Record<string, string> | null = reauthFor(u),
  ) => {
    const req = api().get(`/api/v1/users/me/case-history${path}`).set(u.auth);
    return reauth ? req.set(reauth) : req;
  };

  it('needs reauth; keeps deleted cases; logs history_viewed', async () => {
    const client = await user('client');
    const caseId = await kase(client.id);

    const denied = await history(client, '', null);
    expect(denied.status).toBe(403);
    expect(denied.body.error.code).toBe('REAUTH_REQUIRED');

    const del = await api()
      .delete(`/api/v1/cases/${caseId}`)
      .set(client.auth)
      .send();
    expect(del.status).toBe(200);

    const list = await history(client);
    expect(list.status).toBe(200);
    const row = (list.body.data as { id: string; deleted: boolean }[]).find(
      (c) => c.id === caseId,
    );
    expect(row).toMatchObject({ id: caseId, deleted: true });

    // The same token keeps working for the timeline within its 5 minutes.
    const token = reauthFor(client);
    expect((await history(client, '', token)).status).toBe(200);
    const detail = await history(client, `/${caseId}`, token);
    expect(detail.status).toBe(200);
    const events = (detail.body.data.events as { eventType: string }[]).map(
      (e) => e.eventType,
    );
    expect(events).toContain('deleted');

    expect(
      await prisma.authEvent.count({
        where: { user_id: client.id, event_type: 'history_viewed' },
      }),
    ).toBeGreaterThanOrEqual(3);
  });

  it('attorney: client name only after disclosure; no other attorneys’ bids', async () => {
    const client = await user('client');
    await prisma.user.update({
      where: { id: client.id },
      data: {
        first_name: 'Dana',
        last_name: 'Client',
        phone_e164: `+1201${Math.floor(1_000_000 + Math.random() * 8_999_999)}`,
      },
    });
    const a1 = await user('attorney');
    const a2 = await user('attorney');
    const caseId = await kase(client.id);
    const b1 = await postBid(a1.auth, caseId, bidBody());
    await postBid(a2.auth, caseId, bidBody({ amountCents: 70_000 }));

    const before = await history(a1, `/${caseId}`);
    expect(before.status).toBe(200);
    expect(before.body.data.clientName).toBeNull();
    const amounts = (
      before.body.data.events as { amountCents: number | null }[]
    )
      .map((e) => e.amountCents)
      .filter((v) => v !== null);
    expect(amounts).not.toContain(70_000);

    const acc = await api()
      .post(`/api/v1/bids/${b1.body.data.id}/accept`)
      .set(client.auth)
      .send({});
    expect(acc.status).toBe(200);
    const after = await history(a1, `/${caseId}`);
    expect(after.body.data.clientName).toBe('Dana Client');
    expect(after.body.data.acceptedBid).toMatchObject({ amountCents: 60_000 });

    // The losing attorney: case listed, no name, no accepted bid shown.
    const loser = await history(a2, `/${caseId}`);
    expect(loser.body.data.clientName).toBeNull();
    expect(loser.body.data.acceptedBid).toBeNull();

    const stranger = await user('attorney');
    expect((await history(stranger, `/${caseId}`)).status).toBe(404);
  });

  it('PDF export: background job, 10-minute signed link, fresh reauth per download', async () => {
    const client = await user('client');
    await kase(client.id);
    const started = await api()
      .post('/api/v1/users/me/case-history/export')
      .set(client.auth)
      .set(reauthFor(client))
      .send();
    expect(started.status).toBe(202);
    const exportId = started.body.data.exportId as string;

    await app.get(CaseHistoryExportRunner).process({
      exportId,
      userId: client.id,
      role: 'client',
    });

    const token = reauthFor(client);
    const ready = await history(client, `/export/${exportId}`, token);
    expect(ready.status).toBe(200);
    expect(ready.body.data.status).toBe('ready');
    const url = ready.body.data.url as string;
    expect(url).toContain('X-Amz-Expires=600');
    const pdf = await fetch(url);
    expect(pdf.status).toBe(200);
    expect(
      Buffer.from(await pdf.arrayBuffer())
        .subarray(0, 4)
        .toString(),
    ).toBe('%PDF');

    // Downloading again with the same (consumed) token is refused.
    const again = await history(client, `/export/${exportId}`, token);
    expect(again.status).toBe(401);
    expect(again.body.error.code).toBe('REAUTH_INVALID');

    // Someone else's export id is not found.
    const other = await user('client');
    expect((await history(other, `/export/${exportId}`)).status).toBe(404);
  });
});
