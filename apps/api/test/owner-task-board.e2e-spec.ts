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
 * Owner 2026-10-15: the tasks of a case in work — both sides add them (the
 * client their own or a joint one), either side ticks a joint one — and the
 * Mine › Tasks board lists them with the case and the viewer's side.
 */
jest.setTimeout(60_000);

describe('Case task board (e2e, owner 2026-10-15)', () => {
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

  const add = (
    auth: Record<string, string>,
    caseId: string,
    body: Record<string, unknown>,
  ) =>
    request(baseUrl).post(`/api/v1/cases/${caseId}/tasks`).set(auth).send(body);

  it('both sides add tasks; a joint one is ticked by either; the board lists them', async () => {
    const { cli, att, caseId, code } = await workCase();

    // The client: a joint task and their own to-do, but not the lawyer's.
    const joint = await add(cli.auth, caseId, {
      kind: 'joint',
      title: 'Sign the engagement letter',
    });
    expect(joint.status).toBe(201);
    expect(joint.body.data.joint).toHaveLength(1);
    expect(joint.body.data.joint[0].createdByRole).toBe('client');
    const own = await add(cli.auth, caseId, {
      kind: 'for_client',
      title: 'Find the bank statements',
    });
    expect(own.status).toBe(201);
    expect(
      (await add(cli.auth, caseId, { kind: 'shared', title: 'x' })).status,
    ).toBe(403);
    expect(
      (await add(cli.auth, caseId, { kind: 'private', title: 'x' })).status,
    ).toBe(403);

    // The attorney adds a shared one and ticks the client's joint task.
    expect(
      (
        await add(att.auth, caseId, {
          kind: 'shared',
          title: 'Draft the motion',
        })
      ).status,
    ).toBe(201);
    const jointId = joint.body.data.joint[0].id as string;
    const tick = await request(baseUrl)
      .post(`/api/v1/cases/${caseId}/tasks/${jointId}/done`)
      .set(att.auth)
      .send({ done: true });
    expect(tick.status).toBe(201);
    expect(tick.body.data.joint[0].status).toBe('done');
    // ...and the client may take it back.
    const back = await request(baseUrl)
      .post(`/api/v1/cases/${caseId}/tasks/${jointId}/done`)
      .set(cli.auth)
      .send({ done: false });
    expect(back.body.data.joint[0].status).toBe('open');

    // The board: the client sees their two + the lawyer's; the attorney all three.
    const cb = await request(baseUrl)
      .get('/api/v1/users/me/case-tasks')
      .set(cli.auth);
    expect(cb.status).toBe(200);
    const rows = cb.body.data as {
      title: string;
      kind: string;
      caseId: string;
      practiceCode: string;
      viewerRole: string;
      canTick: boolean;
    }[];
    const mine = rows.filter((r) => r.caseId === caseId);
    expect(mine.map((r) => r.kind).sort()).toEqual([
      'for_client',
      'joint',
      'shared',
    ]);
    expect(
      mine.every((r) => r.viewerRole === 'client' && r.practiceCode === code),
    ).toBe(true);
    // The client cannot tick the lawyer's shared task; the joint one yes.
    expect(mine.find((r) => r.kind === 'shared')?.canTick).toBe(false);
    expect(mine.find((r) => r.kind === 'joint')?.canTick).toBe(true);
    const ab = await request(baseUrl)
      .get('/api/v1/users/me/case-tasks')
      .set(att.auth);
    const theirs = (
      ab.body.data as {
        caseId: string;
        viewerRole: string;
        canTick: boolean;
        kind: string;
      }[]
    ).filter((r) => r.caseId === caseId);
    expect(theirs).toHaveLength(3);
    expect(theirs.every((r) => r.viewerRole === 'attorney')).toBe(true);
    expect(theirs.find((r) => r.kind === 'shared')?.canTick).toBe(true);
    // A stranger sees none of them.
    const stranger = await user('client');
    const sb = await request(baseUrl)
      .get('/api/v1/users/me/case-tasks')
      .set(stranger.auth);
    expect(
      (sb.body.data as { caseId: string }[]).filter((r) => r.caseId === caseId),
    ).toHaveLength(0);
  });
});
