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
 * OQ-048 (owner 2026-09-30): attorney assistants — seats from the plan,
 * joining (added phone / code to the attorney's phone), working inside
 * the attorney's account without bidding, labelled chat messages, the
 * hidden activity log, publications through approval, bid drafts and
 * tasks with results going back to the assistant.
 */
jest.setTimeout(120_000);

describe('Assistants (e2e, OQ-048)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tokens: TokenService;
  let base = '';

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
    const { port } = (app.getHttpServer() as Server).address() as AddressInfo;
    base = `http://127.0.0.1:${port}`;
    prisma = app.get(PrismaService);
    tokens = app.get(TokenService);
    await ensurePostPractices(prisma);
  });

  afterAll(async () => {
    await app.close();
  });

  const api = () => request(base);
  const bearer = (id: string, role: string | null) => ({
    Authorization: `Bearer ${tokens.signAccessToken({
      sub: id,
      role,
      sid: randomUUID(),
      verified: role === 'attorney',
      subscriptionStatus: 'none',
    })}`,
  });
  const phone = () =>
    `+1312${String(Math.floor(Math.random() * 1e7)).padStart(7, '0')}`;

  async function attorney(
    seats: number,
    plan: 'monthly' | 'yearly' = 'monthly',
  ) {
    const a = await prisma.user.create({
      data: {
        role: 'attorney',
        first_name: 'Ada',
        last_name: 'Counsel',
        phone_e164: phone(),
        phone_verified_at: new Date(),
      },
    });
    await prisma.attorneyProfile.create({
      data: {
        user_id: a.id,
        username: `asst_${a.id.slice(0, 8)}`,
        username_lower: `asst_${a.id.slice(0, 8)}`,
        languages: ['en'],
        verification_status: 'verified',
      },
    });
    await prisma.subscription.create({
      data: {
        user_id: a.id,
        status: 'active',
        price_cents: 39900,
        plan,
        assistant_seats: seats,
      },
    });
    return { id: a.id, phone: a.phone_e164!, auth: bearer(a.id, 'attorney') };
  }

  async function assistantUser() {
    const u = await prisma.user.create({
      data: {
        role: 'assistant',
        first_name: 'Sam',
        last_name: 'Helper',
        phone_e164: phone(),
        phone_verified_at: new Date(),
      },
    });
    return { id: u.id, phone: u.phone_e164!, auth: bearer(u.id, 'assistant') };
  }

  it('team seats: monthly bought seats; added phone joins without a code', async () => {
    const att = await attorney(1);
    const asst = await assistantUser();

    const none = await api()
      .get('/api/v1/assistants/me')
      .set(asst.auth)
      .expect(200);
    expect(none.body.data.state).toBe('none');

    const team = await api()
      .post('/api/v1/team')
      .set(att.auth)
      .send({ phone: asst.phone, name: 'Sam' })
      .expect(201);
    expect(team.body.data).toMatchObject({
      seats: 1,
      used: 1,
      plan: 'monthly',
    });

    // No second seat.
    const full = await api()
      .post('/api/v1/team')
      .set(att.auth)
      .send({ phone: phone() })
      .expect(409);
    expect(full.body.error.code).toBe('ASSISTANT_NO_FREE_SEAT');

    const invited = await api()
      .get('/api/v1/assistants/me')
      .set(asst.auth)
      .expect(200);
    expect(invited.body.data.state).toBe('invited');
    const joined = await api()
      .post('/api/v1/assistants/join/accept')
      .set(asst.auth)
      .expect(201);
    expect(joined.body.data).toMatchObject({
      state: 'active',
      attorneyName: 'Ada Counsel',
    });

    // The assistant now works inside the attorney's account — but never
    // the attorney-only parts: team, billing, bids.
    const t = await api().get('/api/v1/team').set(asst.auth).expect(403);
    expect(t.body.error.code).toBe('ASSISTANT_NOT_ALLOWED');
    await api().get('/api/v1/subscriptions/me').set(asst.auth).expect(403);
    const bid = await api()
      .post(`/api/v1/cases/${randomUUID()}/bids`)
      .set(asst.auth)
      .set('Idempotency-Key', randomUUID())
      .send({
        feeType: 'fixed',
        amountCents: 10000,
        message: 'I can help with this case quickly and well.',
        startAvailability: 'immediately',
      })
      .expect(403);
    expect(bid.body.error.code).toBe('ASSISTANT_NOT_ALLOWED');

    // Own account stays the assistant's.
    const me = await api().get('/api/v1/users/me').set(asst.auth).expect(200);
    expect(me.body.data.role).toBe('assistant');
  });

  it('joining with the code sent to the attorney phone; yearly = 6 seats', async () => {
    const att = await attorney(0, 'yearly');
    const asst = await assistantUser();
    await api()
      .post('/api/v1/assistants/join/request-code')
      .set(asst.auth)
      .send({ phone: att.phone })
      .expect(204);
    const bad = await api()
      .post('/api/v1/assistants/join/verify')
      .set(asst.auth)
      .send({ attorneyPhone: att.phone, code: '111111' })
      .expect(400);
    expect(bad.body.error.code).toBe('AUTH_OTP_INVALID');
    const ok = await api()
      .post('/api/v1/assistants/join/verify')
      .set(asst.auth)
      .send({ attorneyPhone: att.phone, code: '000000' })
      .expect(201);
    expect(ok.body.data.state).toBe('active');
    const team = await api().get('/api/v1/team').set(att.auth).expect(200);
    expect(team.body.data).toMatchObject({ seats: 6, used: 1, plan: 'yearly' });
    expect(team.body.data.members[0].approval).toBe('attorney_otp');
  });

  it('approvals, tasks, bid drafts, labelled chat and the hidden log', async () => {
    const att = await attorney(2);
    const asst = await assistantUser();
    await api()
      .post('/api/v1/team')
      .set(att.auth)
      .send({
        phone: asst.phone,
        name: 'Sam H.',
        duties: [
          'chats',
          'files',
          'cases',
          'bid_drafts',
          'posts',
          'tasks',
          'profile',
        ],
        acceptLiability: true,
      })
      .expect(201);
    await api()
      .post('/api/v1/assistants/join/accept')
      .set(asst.auth)
      .expect(201);

    // A post goes through approval.
    const r = await api()
      .post('/api/v1/team/requests')
      .set(asst.auth)
      .send({
        kind: 'post',
        payload: {
          title: 'Custody basics',
          body: 'What every parent should know before court.',
          practiceCode: 'family_law',
        },
      })
      .expect(201);
    expect(r.body.data.status).toBe('pending');
    // The assistant can't publish directly nor approve.
    await api()
      .post('/api/v1/posts')
      .set(asst.auth)
      .set('Idempotency-Key', randomUUID())
      .send({ title: 'x', body: 'y', practiceCode: 'family_law' })
      .expect(403);
    await api()
      .post(`/api/v1/team/requests/${r.body.data.id}/approve`)
      .set(asst.auth)
      .send({})
      .expect(403);
    const approved = await api()
      .post(`/api/v1/team/requests/${r.body.data.id}/approve`)
      .set(att.auth)
      .send({ note: 'Great' })
      .expect(201);
    expect(approved.body.data.status).toBe('approved');
    const post = await prisma.post.findFirst({
      where: { author_id: att.id, title: 'Custody basics' },
    });
    expect(post).not.toBeNull();
    const told = await prisma.notification.findFirst({
      where: { user_id: asst.id },
    });
    expect(told).not.toBeNull();

    // Tasks: the assistant sets, the attorney moves it.
    const task = await api()
      .post('/api/v1/tasks')
      .set(asst.auth)
      .send({
        kind: 'call',
        title: 'Call Mr. Brown about the hearing',
        dueAt: new Date(Date.now() + 86_400_000).toISOString(),
        contactName: 'John Brown',
        contactPhone: '+13125550199',
      })
      .expect(201);
    expect(task.body.data).toMatchObject({
      status: 'open',
      createdByName: 'Sam H.',
    });
    const list = await api().get('/api/v1/tasks').set(att.auth).expect(200);
    expect(list.body.data).toHaveLength(1);
    // Only the attorney completes.
    await api()
      .patch(`/api/v1/tasks/${task.body.data.id}/status`)
      .set(asst.auth)
      .send({ status: 'done' })
      .expect(403);
    const later = new Date(Date.now() + 3 * 86_400_000).toISOString();
    const moved = await api()
      .patch(`/api/v1/tasks/${task.body.data.id}/status`)
      .set(att.auth)
      .send({
        status: 'not_done',
        outcomeNote: 'No answer',
        rescheduleTo: later,
      })
      .expect(200);
    expect(moved.body.data).toMatchObject({
      status: 'open',
      outcomeNote: 'No answer',
      rescheduledTo: later,
    });
    const done = await api()
      .patch(`/api/v1/tasks/${task.body.data.id}/status`)
      .set(att.auth)
      .send({ status: 'done', outcomeNote: 'Talked, hearing confirmed' })
      .expect(200);
    expect(done.body.data.status).toBe('done');
    const mine = await api()
      .get('/api/v1/tasks?view=done&mine=true')
      .set(asst.auth)
      .expect(200);
    expect(mine.body.data[0].outcomeNote).toBe('Talked, hearing confirmed');

    // Bid draft prepared by the assistant.
    const client = await prisma.user.create({
      data: { role: 'client', first_name: 'Cy' },
    });
    const area = await prisma.practiceArea.findUniqueOrThrow({
      where: { code: 'family_law' },
    });
    await prisma.state.upsert({
      where: { code: 'IL' },
      create: { code: 'IL', name: 'Illinois' },
      update: {},
    });
    const kase = await prisma.case.create({
      data: {
        client_id: client.id,
        title: 'Divorce',
        description: 'Details',
        practice_area_id: area.id,
        primary_state_code: 'IL',
        budget_mode: 'clarify_later',
        status: 'open',
      },
    });
    await api()
      .put(`/api/v1/cases/${kase.id}/bid-draft`)
      .set(asst.auth)
      .send({ feeType: 'fixed', amountCents: 150000, message: 'Draft text' })
      .expect(200);
    const draft = await api()
      .get(`/api/v1/cases/${kase.id}/bid-draft`)
      .set(att.auth)
      .expect(200);
    expect(draft.body.data).toMatchObject({
      amountCents: 150000,
      preparedBy: 'Sam H.',
    });

    // Chat: labelled "assistant" messages; files need the "files" duty.
    const conv = await prisma.conversation.create({
      data: {
        case_id: kase.id,
        client_id: client.id,
        attorney_id: att.id,
        status: 'active',
        contacts_unlocked: true,
        participants: { create: [{ user_id: client.id }, { user_id: att.id }] },
      },
    });
    const msg = await api()
      .post(`/api/v1/conversations/${conv.id}/messages`)
      .set(asst.auth)
      .send({
        type: 'text',
        body: 'Hello, I am the assistant',
        clientMessageId: randomUUID(),
      })
      .expect(201);
    expect(msg.body.data).toMatchObject({
      senderId: att.id,
      sentByAssistant: 'Sam H.',
    });

    const team = await api().get('/api/v1/team').set(att.auth).expect(200);
    const memberId = team.body.data.members[0].id as string;
    await api()
      .patch(`/api/v1/team/${memberId}`)
      .set(att.auth)
      .send({ duties: ['tasks'] }) // withdrawing needs no consent
      .expect(200);
    const noChat = await api()
      .get(`/api/v1/conversations/${conv.id}/messages`)
      .set(asst.auth)
      .expect(403);
    expect(noChat.body.error.details.duty).toBe('chats');

    // The hidden activity log.
    const act = await api()
      .get('/api/v1/team/activity')
      .set(att.auth)
      .expect(200);
    const actions = (act.body.data as { action: string }[]).map(
      (x) => x.action,
    );
    expect(actions).toEqual(
      expect.arrayContaining([
        'request.post',
        'task.create',
        'bid.draft',
        'chat.message',
      ]),
    );
    await api().get('/api/v1/team/activity').set(asst.auth).expect(403);

    // Removed: access ends at once.
    await api().delete(`/api/v1/team/${memberId}`).set(att.auth).expect(200);
    const gone = await api()
      .get('/api/v1/assistants/me')
      .set(asst.auth)
      .expect(200);
    expect(gone.body.data.state).toBe('none');
  });

  // OQ-049 (owner 2026-10-01): every access is switched on by the attorney,
  // who accepts responsibility; bids and direct publishing included.
  it('one task, many steps: each with its own time, checked off one by one', async () => {
    const att = await attorney(2);
    const asst = await assistantUser();
    await api()
      .post('/api/v1/team')
      .set(att.auth)
      .send({
        phone: asst.phone,
        name: 'Ann P.',
        duties: ['tasks'],
        acceptLiability: true,
      })
      .expect(201);
    await api()
      .post('/api/v1/assistants/join/accept')
      .set(asst.auth)
      .expect(201);
    const at = (h: number) =>
      new Date(Date.now() + h * 3_600_000).toISOString();
    const t = await api()
      .post('/api/v1/tasks')
      .set(asst.auth)
      .send({
        kind: 'call',
        title: 'Monday calls',
        steps: [
          { title: 'Mr. Brown', contactPhone: '+13125550199', dueAt: at(2) },
          { title: 'Ms. Lee', contactPhone: '+13125550198', dueAt: at(3) },
          { kind: 'visit', title: 'Courthouse', location: '50 W Washington' },
        ],
      })
      .expect(201);
    const id = t.body.data.id as string;
    const steps = t.body.data.steps as { id: string; title: string }[];
    expect(steps.map((x) => x.title)).toEqual([
      'Mr. Brown',
      'Ms. Lee',
      'Courthouse',
    ]);
    expect(t.body.data.steps[0]).toMatchObject({
      status: 'open',
      createdByName: 'Ann P.',
      contactPhone: '+13125550199',
    });
    expect(t.body.data.steps[2]).toMatchObject({ kind: 'visit' });

    // The assistant adds a step and moves a time, but can't check off.
    const added = await api()
      .post(`/api/v1/tasks/${id}/steps`)
      .set(asst.auth)
      .send({ title: 'Email the clerk', contactEmail: 'clerk@court.gov' })
      .expect(201);
    expect(added.body.data.steps).toHaveLength(4);
    const fourth = added.body.data.steps[3].id as string;
    await api()
      .patch(`/api/v1/tasks/${id}/steps/${steps[0].id}`)
      .set(asst.auth)
      .send({ dueAt: at(5) })
      .expect(200);
    await api()
      .patch(`/api/v1/tasks/${id}/steps/${steps[0].id}`)
      .set(asst.auth)
      .send({ status: 'done' })
      .expect(403);

    // The attorney removes one and checks the rest off, one by one.
    await api()
      .delete(`/api/v1/tasks/${id}/steps/${fourth}`)
      .set(att.auth)
      .expect(200);
    for (const [i, s] of steps.entries()) {
      const r = await api()
        .patch(`/api/v1/tasks/${id}/steps/${s.id}`)
        .set(att.auth)
        .send({ status: 'done', note: i === 0 ? 'Confirmed' : undefined })
        .expect(200);
      // The task finishes only with the last checkmark.
      expect(r.body.data.status).toBe(i === steps.length - 1 ? 'done' : 'open');
    }
    const told = await prisma.notification.findFirst({
      where: { user_id: asst.id, type: 'assistant_result' },
    });
    expect(told).not.toBeNull();
    // Unchecking one opens the task again.
    const reopened = await api()
      .patch(`/api/v1/tasks/${id}/steps/${steps[1].id}`)
      .set(att.auth)
      .send({ status: 'open' })
      .expect(200);
    expect(reopened.body.data.status).toBe('open');
    expect(reopened.body.data.steps[0].note).toBe('Confirmed');
    await api()
      .patch(`/api/v1/tasks/${id}/steps/00000000-0000-4000-8000-000000000000`)
      .set(att.auth)
      .send({ status: 'done' })
      .expect(404);
  });

  it('access only with the attorney accepting responsibility; bids and publishing', async () => {
    const att = await attorney(1);
    const asst = await assistantUser();
    await api()
      .post('/api/v1/team')
      .set(att.auth)
      .send({ phone: asst.phone })
      .expect(201);
    await api()
      .post('/api/v1/assistants/join/accept')
      .set(asst.auth)
      .expect(201);
    const me = await api()
      .get('/api/v1/assistants/me')
      .set(asst.auth)
      .expect(200);
    expect(me.body.data.duties).toEqual([]);

    const team = await api().get('/api/v1/team').set(att.auth).expect(200);
    const memberId = team.body.data.members[0].id as string;
    const refused = await api()
      .patch(`/api/v1/team/${memberId}`)
      .set(att.auth)
      .send({ duties: ['bids', 'publish'] })
      .expect(400);
    expect(refused.body.error.code).toBe('ASSISTANT_LIABILITY_REQUIRED');

    const granted = await api()
      .patch(`/api/v1/team/${memberId}`)
      .set(att.auth)
      .send({ duties: ['bids', 'publish'], acceptLiability: true })
      .expect(200);
    expect(granted.body.data.members[0].liabilityAcceptedAt).not.toBeNull();
    const rows = await prisma.assistantLiabilityAcceptance.findMany({
      where: { membership_id: memberId },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ granted: true, attorney_id: att.id });
    expect(rows[0].duties.sort()).toEqual(['bids', 'publish']);

    // Publishing directly, in the attorney's name.
    const post = await api()
      .post('/api/v1/posts')
      .set(asst.auth)
      .set('Idempotency-Key', randomUUID())
      .send({
        title: 'Weekly tip',
        body: 'Keep copies of every court notice.',
        practiceCode: 'family_law',
      })
      .expect(201);
    const row = await prisma.post.findUniqueOrThrow({
      where: { id: post.body.data.id },
    });
    expect(row.author_id).toBe(att.id);

    // Bidding in the attorney's name.
    const client = await prisma.user.create({
      data: { role: 'client', first_name: 'Cy' },
    });
    const area = await prisma.practiceArea.findUniqueOrThrow({
      where: { code: 'family_law' },
    });
    await prisma.state.upsert({
      where: { code: 'IL' },
      create: { code: 'IL', name: 'Illinois' },
      update: {},
    });
    await prisma.attorneyLicense.create({
      data: {
        attorney_id: att.id,
        state_code: 'IL',
        bar_number: `IL-${Date.now()}`,
        license_status: 'verified',
        verified_at: new Date(),
      },
    });
    const kase = await prisma.case.create({
      data: {
        client_id: client.id,
        title: 'Custody',
        description: 'Details',
        practice_area_id: area.id,
        primary_state_code: 'IL',
        budget_mode: 'clarify_later',
        status: 'open',
        states: { create: { state_code: 'IL', is_primary: true } },
      },
    });
    const bid = await api()
      .post(`/api/v1/cases/${kase.id}/bids`)
      .set(asst.auth)
      .set('Idempotency-Key', randomUUID())
      .send({
        feeType: 'fixed',
        amountCents: 120000,
        message: 'We can start this week and file within ten days.',
        startAvailability: 'immediately',
      })
      .expect(201);
    expect(bid.body.data).toMatchObject({ attorneyId: att.id });

    // Withdrawn access is recorded too, and works at once.
    await api()
      .patch(`/api/v1/team/${memberId}`)
      .set(att.auth)
      .send({ duties: [] })
      .expect(200);
    expect(
      await prisma.assistantLiabilityAcceptance.count({
        where: { membership_id: memberId, granted: false },
      }),
    ).toBe(1);
    await api()
      .post('/api/v1/posts')
      .set(asst.auth)
      .send({ title: 'x', body: 'y', practiceCode: 'family_law' })
      .expect(403);
  });
});
