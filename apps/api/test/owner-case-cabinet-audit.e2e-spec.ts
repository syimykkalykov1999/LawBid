import type { AddressInfo, Server } from 'node:net';
import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { TokenService } from '../src/modules/auth/services/token.service';
import { ensurePostPractices } from './support/post-practices';

/**
 * Audit 2026-10-19 (case cabinet): what one side adds reaches the other;
 * «Подробности» change after hiring; a closed case is read-only.
 */
jest.setTimeout(60_000);

describe('Case cabinet audit (e2e, 2026-10-19)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tokens: TokenService;
  let baseUrl = '';

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
    app.setGlobalPrefix('api/v1');
    await app.listen(0, '127.0.0.1');
    baseUrl = `http://127.0.0.1:${((app.getHttpServer() as Server).address() as AddressInfo).port}`;
    prisma = app.get(PrismaService);
    await ensurePostPractices(prisma);
    await prisma.state.upsert({
      where: { code: 'NY' },
      create: { code: 'NY', name: 'New York' },
      update: {},
    });
    tokens = app.get(TokenService);
  });

  afterAll(async () => {
    await app.close();
  });

  async function user(role: 'client' | 'attorney', verified = true) {
    const u = await prisma.user.create({
      data: { role, phone_verified_at: role === 'client' ? new Date() : null },
    });
    if (role === 'client') {
      const handle = `cl_${u.id.slice(0, 8)}`;
      await prisma.clientProfile.create({
        data: {
          user_id: u.id,
          state_code: 'NY',
          preferred_languages: ['en'],
          username: handle,
          username_lower: handle,
        },
      });
    }
    if (role === 'attorney') {
      const username = `att_${u.id.slice(0, 8)}`;
      await prisma.attorneyProfile.create({
        data: {
          user_id: u.id,
          username,
          username_lower: username,
          languages: ['en'],
          verification_status: verified ? 'verified' : 'unverified',
        },
      });
    }
    const token = tokens.signAccessToken({
      sub: u.id,
      role,
      sid: randomUUID(),
      verified: role === 'attorney' && verified,
      subscriptionStatus: 'none',
    });
    return { id: u.id, auth: { Authorization: `Bearer ${token}` } };
  }

  async function workCase() {
    const cli = await user('client');
    const att = await user('attorney');
    const a = await prisma.practiceArea.findFirstOrThrow({
      where: { parent_id: { not: null } },
    });
    const c = await prisma.case.create({
      data: {
        client_id: cli.id,
        title: 'Work case for the board',
        description: 'A description long enough for the case.',
        practice_area_id: a.id,
        primary_state_code: 'NY',
        budget_mode: 'clarify_later',
        status: 'in_progress',
      },
    });
    await prisma.caseState.create({
      data: { case_id: c.id, state_code: 'NY', is_primary: true },
    });
    const bid = await prisma.bid.create({
      data: {
        case_id: c.id,
        attorney_id: att.id,
        status: 'accepted',
        fee_type: 'fixed',
        amount_cents: 100000,
        message: 'My bid',
        start_availability: 'immediately',
        turn: 'client',
      },
    });
    await prisma.case.update({
      where: { id: c.id },
      data: { accepted_bid_id: bid.id },
    });
    return { cli, att, caseId: c.id, code: a.code };
  }

  const api = () => request(baseUrl);
  const notes = (userId: string, caseId: string) =>
    prisma.notification
      .findMany({
        where: { user_id: userId, type: 'case_workspace_activity' },
        orderBy: { created_at: 'asc' },
      })
      .then((rows) =>
        rows
          .filter((r) => (r.payload as { caseId?: string }).caseId === caseId)
          .map((r) => (r.payload as { kind: string }).kind),
      );

  it('updates, tasks, done marks and files tell the other side', async () => {
    const { cli, att, caseId } = await workCase();
    const upd = await api()
      .post(`/api/v1/cases/${caseId}/updates`)
      .set(att.auth)
      .send({ body: 'Filed the motion today.', files: [] });
    expect(upd.status).toBe(201);
    const task = await api()
      .post(`/api/v1/cases/${caseId}/tasks`)
      .set(att.auth)
      .send({ kind: 'joint', title: 'Sign the engagement letter' });
    expect(task.status).toBe(201);
    const id = task.body.data.joint[0].id as string;
    // a private task tells nobody
    await api()
      .post(`/api/v1/cases/${caseId}/tasks`)
      .set(att.auth)
      .send({ kind: 'private', title: 'Call the clerk' });
    expect(await notes(cli.id, caseId)).toEqual(['update', 'task_added']);

    await api()
      .post(`/api/v1/cases/${caseId}/tasks/${id}/done`)
      .set(cli.auth)
      .send({ done: true });
    await api()
      .post(`/api/v1/cases/${caseId}/tasks/${id}/done`)
      .set(cli.auth)
      .send({ done: false });
    expect(await notes(att.id, caseId)).toEqual(['task_done']);
    // nobody is told about their own action
    expect(await notes(att.id, caseId)).not.toContain('update');
  });

  it('«Подробности» change after hiring and the attorney is told', async () => {
    const { cli, att, caseId } = await workCase();
    const r = await api()
      .patch(`/api/v1/cases/${caseId}/private-details`)
      .set(cli.auth)
      .send({ privateDetails: 'Case no. 2026-CV-17, landlord J. Smith' });
    expect(r.status).toBe(200);
    expect(r.body.data.privateDetails).toBe(
      'Case no. 2026-CV-17, landlord J. Smith',
    );
    expect(await notes(att.id, caseId)).toEqual(['details']);
    // the attorney cannot change them
    const no = await api()
      .patch(`/api/v1/cases/${caseId}/private-details`)
      .set(att.auth)
      .send({ privateDetails: 'x' });
    expect(no.status).toBe(403);
    // the journal knows only that they changed
    const j = await prisma.caseJournal.findFirst({
      where: { case_id: caseId, event_type: 'updated' },
      orderBy: { created_at: 'desc' },
    });
    expect(JSON.stringify(j?.payload)).not.toContain('landlord');
  });

  it('a closed case is read-only', async () => {
    const { cli, att, caseId } = await workCase();
    await prisma.case.update({
      where: { id: caseId },
      data: { status: 'closed', closed_at: new Date() },
    });
    const ws = await api()
      .get(`/api/v1/cases/${caseId}/workspace`)
      .set(cli.auth);
    expect(ws.status).toBe(200);
    expect(ws.body.data.canWrite).toBe(false);
    const tasks = await api()
      .get(`/api/v1/cases/${caseId}/tasks`)
      .set(att.auth);
    expect(tasks.body.data.canEdit).toBe(false);
    const upd = await api()
      .post(`/api/v1/cases/${caseId}/updates`)
      .set(cli.auth)
      .send({ body: 'One more thing', files: [] });
    expect(upd.status).toBe(409);
    expect(upd.body.error?.code ?? upd.body.code).toBe('CASE_INVALID_STATE');
    const add = await api()
      .post(`/api/v1/cases/${caseId}/tasks`)
      .set(att.auth)
      .send({ kind: 'shared', title: 'x' });
    expect(add.status).toBe(409);
    const det = await api()
      .patch(`/api/v1/cases/${caseId}/private-details`)
      .set(cli.auth)
      .send({ privateDetails: 'late' });
    expect(det.status).toBe(409);
  });
});
