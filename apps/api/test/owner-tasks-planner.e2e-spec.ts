import type { AddressInfo, Server } from 'node:net';
import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { TokenService } from '../src/modules/auth/services/token.service';
import {
  TaskArchivePurgeJob,
  TaskRemindersJob,
} from '../src/jobs/handlers/tasks-planner.jobs';
import { nextOccurrence } from '../src/modules/assistants/tasks.service';

/**
 * Owner 2026-10-05: the attorney's planner — many addresses and people on
 * one task (app people open the chat, outside contacts are called /
 * written to), priority, repeating tasks, reminders, assignment to an
 * assistant and their rights, filters, bulk actions, and the archive that
 * is cleaned after a year unless a task is kept forever.
 */
jest.setTimeout(120_000);

describe('Tasks planner (e2e, owner 2026-10-05)', () => {
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
    `+1312${2 + Math.floor(Math.random() * 8)}${String(
      Math.floor(Math.random() * 1e6),
    ).padStart(6, '0')}`;
  const inHours = (h: number) =>
    new Date(Date.now() + h * 3_600_000).toISOString();

  async function attorney(first = 'Ada') {
    const a = await prisma.user.create({
      data: {
        role: 'attorney',
        first_name: first,
        last_name: 'Counsel',
        phone_e164: phone(),
        phone_verified_at: new Date(),
      },
    });
    await prisma.subscription.create({
      data: {
        user_id: a.id,
        status: 'active',
        price_cents: 9900,
        plan: 'monthly',
        assistant_seats: 3,
      },
    });
    return { id: a.id, auth: bearer(a.id, 'attorney') };
  }

  /** An active assistant of the attorney with these duties. */
  async function assistant(attorneyId: string, duties: string[], name: string) {
    const u = await prisma.user.create({
      data: {
        role: 'assistant',
        first_name: name,
        last_name: 'Helper',
        phone_e164: phone(),
        phone_verified_at: new Date(),
      },
    });
    const m = await prisma.assistantMembership.create({
      data: {
        attorney_id: attorneyId,
        assistant_user_id: u.id,
        phone_e164: u.phone_e164!,
        display_name: name,
        status: 'active',
        approval: 'attorney_added',
        duties,
        joined_at: new Date(),
      },
    });
    return { id: u.id, membershipId: m.id, auth: bearer(u.id, 'assistant') };
  }

  it('many places and people on one task; app people only when known', async () => {
    const att = await attorney();
    const colleague = await attorney('Bea');
    const client = await prisma.user.create({
      data: { role: 'client', first_name: 'Cy', last_name: 'Client' },
    });
    const stranger = await prisma.user.create({
      data: { role: 'client', first_name: 'Sly', last_name: 'Stranger' },
    });
    const chat = await prisma.conversation.create({
      data: {
        attorney_id: att.id,
        client_id: client.id,
        request_status: 'accepted',
      },
    });

    const created = await api()
      .post('/api/v1/tasks')
      .set(att.auth)
      .send({
        kind: 'visit',
        title: 'Visit the witnesses',
        dueAt: inHours(30),
        priority: 'high',
        remindBeforeMin: 60,
        conversationId: chat.id,
        places: [
          { label: 'Court', address: '50 W Washington St, Chicago, IL' },
          { address: '233 S Wacker Dr, Chicago, IL' },
        ],
        people: [
          { userId: client.id, role: 'Client' },
          { userId: colleague.id },
          { name: 'John Witness', role: 'Witness', phone: '(312) 555-0101' },
          { name: 'Mary Clerk', email: 'mary@court.gov' },
        ],
      })
      .expect(201);
    const t = created.body.data;
    expect(t).toMatchObject({
      priority: 'high',
      remindBeforeMin: 60,
      conversationId: chat.id,
      repeat: 'none',
      keepForever: false,
      archivedAt: null,
      canComplete: true,
      canEdit: true,
      // Older apps still read the first place / outside contact.
      location: '50 W Washington St, Chicago, IL',
      contactName: 'John Witness',
      contactPhone: '+13125550101',
    });
    expect(t.places).toHaveLength(2);
    expect(t.places[0]).toMatchObject({ label: 'Court' });
    expect((t.people as { name: string }[]).map((p) => p.name)).toEqual([
      'Cy Client',
      'Bea Counsel',
      'John Witness',
      'Mary Clerk',
    ]);
    expect(t.people[0]).toMatchObject({
      userId: client.id,
      userRole: 'client',
    });
    expect(t.people[1]).toMatchObject({ userRole: 'attorney' });
    expect(t.people[2]).toMatchObject({ userId: null, userRole: null });
    const row = await prisma.attorneyTask.findUniqueOrThrow({
      where: { id: t.id },
    });
    expect(row.remind_at?.getTime()).toBe(
      new Date(t.dueAt).getTime() - 60 * 60_000,
    );

    // Someone this account has nothing to do with can't be added.
    await api()
      .post('/api/v1/tasks')
      .set(att.auth)
      .send({ kind: 'call', title: 'x', people: [{ userId: stranger.id }] })
      .expect(404);
    // An outside contact needs a name.
    await api()
      .post('/api/v1/tasks')
      .set(att.auth)
      .send({ kind: 'call', title: 'x', people: [{ phone: '+13125550102' }] })
      .expect(400);
    // A foreign chat is refused.
    const other = await attorney('Oz');
    await api()
      .post('/api/v1/tasks')
      .set(other.auth)
      .send({ kind: 'call', title: 'x', conversationId: chat.id })
      .expect(404);

    // Editing replaces the lists.
    const edited = await api()
      .patch(`/api/v1/tasks/${t.id}`)
      .set(att.auth)
      .send({
        places: [{ address: '1 Courthouse Sq' }],
        people: [{ name: 'John Witness', phone: '+13125550101' }],
        clearRemind: true,
      })
      .expect(200);
    expect(edited.body.data.places).toHaveLength(1);
    expect(edited.body.data.people).toHaveLength(1);
    expect(edited.body.data.remindBeforeMin).toBeNull();

    // Suggestions: used addresses, chat people, contacts, attorneys found.
    const places = await api()
      .get('/api/v1/tasks/places')
      .set(att.auth)
      .expect(200);
    expect(
      (places.body.data as { address: string }[]).map((p) => p.address),
    ).toEqual(expect.arrayContaining(['1 Courthouse Sq']));
    const people = await api()
      .get('/api/v1/tasks/people')
      .set(att.auth)
      .expect(200);
    const sources = (
      people.body.data as { source: string; name: string }[]
    ).map((p) => `${p.source}:${p.name}`);
    expect(sources).toEqual(
      expect.arrayContaining(['client:Cy Client', 'contact:John Witness']),
    );
    expect(sources.some((s) => s.includes('Stranger'))).toBe(false);
    const found = await api()
      .get('/api/v1/tasks/people?q=bea coun')
      .set(att.auth)
      .expect(200);
    expect(found.body.data[0]).toMatchObject({
      source: 'attorney',
      userId: colleague.id,
    });

    // A client never sees the attorney's tasks.
    await api()
      .get(`/api/v1/tasks/${t.id}`)
      .set(bearer(client.id, 'client'))
      .expect(404);
  });

  it('assigned assistants see and check off their tasks; planners see all', async () => {
    const att = await attorney();
    const planner = await assistant(att.id, ['tasks'], 'Pam');
    const runner = await assistant(att.id, [], 'Rex');

    const forRex = await api()
      .post('/api/v1/tasks')
      .set(planner.auth)
      .send({
        kind: 'print',
        title: 'Print the motion',
        assigneeMembershipId: runner.membershipId,
        steps: [{ title: 'Three copies' }, { title: 'Bring to court' }],
      })
      .expect(201);
    expect(forRex.body.data).toMatchObject({
      assigneeName: 'Rex',
      assigneeMembershipId: runner.membershipId,
    });
    const told = await prisma.notification.findFirst({
      where: { user_id: runner.id, type: 'task_assigned' },
    });
    expect(told).not.toBeNull();
    await api()
      .post('/api/v1/tasks')
      .set(att.auth)
      .send({ kind: 'call', title: 'Call the judge' })
      .expect(201);

    // Without the tasks duty: only what is assigned, no planning.
    const rexList = await api()
      .get('/api/v1/tasks')
      .set(runner.auth)
      .expect(200);
    expect(rexList.body.data).toHaveLength(1);
    expect(rexList.body.data[0]).toMatchObject({
      assignedToMe: true,
      canComplete: true,
      canEdit: false,
    });
    await api()
      .post('/api/v1/tasks')
      .set(runner.auth)
      .send({ kind: 'call', title: 'x' })
      .expect(403);
    const pamList = await api()
      .get('/api/v1/tasks')
      .set(planner.auth)
      .expect(200);
    expect(pamList.body.data).toHaveLength(2);

    // Rex checks the steps off one by one; the last finishes the task.
    const [s1, s2] = forRex.body.data.steps as { id: string }[];
    await api()
      .patch(`/api/v1/tasks/${forRex.body.data.id}/steps/${s1.id}`)
      .set(runner.auth)
      .send({ status: 'done' })
      .expect(200);
    const last = await api()
      .patch(`/api/v1/tasks/${forRex.body.data.id}/steps/${s2.id}`)
      .set(runner.auth)
      .send({ status: 'done' })
      .expect(200);
    expect(last.body.data.status).toBe('done');
    expect(last.body.data.archivedAt).not.toBeNull();

    // A task not assigned to Pam is not hers to check off.
    const judge = (pamList.body.data as { id: string; title: string }[]).find(
      (x) => x.title === 'Call the judge',
    )!;
    await api()
      .patch(`/api/v1/tasks/${judge.id}/status`)
      .set(planner.auth)
      .send({ status: 'done' })
      .expect(403);

    // Filters: by assignee, overdue, search.
    const byRex = await api()
      .get(`/api/v1/tasks?view=all&assignee=${runner.membershipId}`)
      .set(att.auth)
      .expect(200);
    expect(byRex.body.data).toHaveLength(1);
    const unassigned = await api()
      .get('/api/v1/tasks?assignee=none')
      .set(att.auth)
      .expect(200);
    expect(unassigned.body.data).toHaveLength(1);
    const searched = await api()
      .get('/api/v1/tasks?view=all&q=MOTION')
      .set(att.auth)
      .expect(200);
    expect(searched.body.data).toHaveLength(1);
    await api()
      .patch(`/api/v1/tasks/${judge.id}`)
      .set(att.auth)
      .send({ dueAt: inHours(-2) })
      .expect(200);
    const overdue = await api()
      .get('/api/v1/tasks?overdue=true')
      .set(att.auth)
      .expect(200);
    expect((overdue.body.data as { id: string }[]).map((x) => x.id)).toEqual([
      judge.id,
    ]);
    // An assistant of another team can't be assigned.
    const other = await attorney('Oz');
    const outsider = await assistant(other.id, ['tasks'], 'Out');
    await api()
      .patch(`/api/v1/tasks/${judge.id}`)
      .set(att.auth)
      .send({ assigneeMembershipId: outsider.membershipId })
      .expect(404);
  });

  it('repeating tasks set up the next one; reminders are pushed once', async () => {
    expect(
      nextOccurrence(new Date('2026-01-31T15:00:00Z'), 'monthly').toISOString(),
    ).toBe('2026-02-28T15:00:00.000Z');
    expect(
      nextOccurrence(
        new Date('2026-10-09T15:00:00Z'),
        'weekdays',
      ).toISOString(),
    ).toBe('2026-10-12T15:00:00.000Z');

    const att = await attorney();
    const due = inHours(2);
    const weekly = await api()
      .post('/api/v1/tasks')
      .set(att.auth)
      .send({
        kind: 'meeting',
        title: 'Team meeting',
        dueAt: due,
        repeat: 'weekly',
        remindBeforeMin: 0,
        places: [{ address: 'Office' }],
        steps: [{ title: 'Agenda' }],
      })
      .expect(201);
    await api()
      .patch(`/api/v1/tasks/${weekly.body.data.id}/status`)
      .set(att.auth)
      .send({ status: 'done' })
      .expect(200);
    // Twice "done" still makes only one next task.
    await api()
      .patch(`/api/v1/tasks/${weekly.body.data.id}/status`)
      .set(att.auth)
      .send({ status: 'done' })
      .expect(200);
    const active = await api().get('/api/v1/tasks').set(att.auth).expect(200);
    expect(active.body.data).toHaveLength(1);
    expect(active.body.data[0]).toMatchObject({
      title: 'Team meeting',
      status: 'open',
      repeat: 'weekly',
      places: [expect.objectContaining({ address: 'Office' })],
    });
    expect(active.body.data[0].steps[0].status).toBe('open');
    expect(new Date(active.body.data[0].dueAt).getTime()).toBe(
      new Date(due).getTime() + 7 * 86_400_000,
    );

    // The reminder job: due now → one push, never twice.
    const soon = await api()
      .post('/api/v1/tasks')
      .set(att.auth)
      .send({ kind: 'call', title: 'Call now', dueAt: inHours(0.1) })
      .expect(201);
    const job = app.get(TaskRemindersJob);
    const at = new Date(Date.now() + 10 * 60_000);
    await job.run(at);
    await job.run(at);
    const pushes = await prisma.notification.findMany({
      where: { user_id: att.id, type: 'task_reminder' },
    });
    expect(pushes).toHaveLength(1);
    expect(pushes[0].payload).toMatchObject({ taskId: soon.body.data.id });
  });

  it('archive: bulk actions, keep forever, notices and the yearly cleanup', async () => {
    const att = await attorney();
    const helper = await assistant(att.id, ['tasks'], 'Hal');
    const make = async (title: string, auth = att.auth) =>
      (
        await api()
          .post('/api/v1/tasks')
          .set(auth)
          .send({ kind: 'other', title })
          .expect(201)
      ).body.data.id as string;
    const a = await make('A');
    const b = await make('B');
    const c = await make('C');
    const byHal = await make('D', helper.auth);

    // Mark three done at once → the archive.
    const done = await api()
      .post('/api/v1/tasks/bulk')
      .set(att.auth)
      .send({ ids: [a, b, c], action: 'status', status: 'done' })
      .expect(200);
    expect(done.body.data).toEqual({ affected: 3, skipped: 0 });
    const archive = await api()
      .get('/api/v1/tasks?view=archive')
      .set(att.auth)
      .expect(200);
    expect(archive.body.data).toHaveLength(3);
    expect(archive.body.data[0].purgeAt).not.toBeNull();
    // Keep one forever, bring one back.
    await api()
      .post('/api/v1/tasks/bulk')
      .set(att.auth)
      .send({ ids: [a], action: 'keep' })
      .expect(200);
    await api()
      .post('/api/v1/tasks/bulk')
      .set(att.auth)
      .send({ ids: [b], action: 'unarchive' })
      .expect(200);
    const back = await api()
      .get(`/api/v1/tasks/${b}`)
      .set(att.auth)
      .expect(200);
    expect(back.body.data).toMatchObject({ status: 'open', archivedAt: null });

    // An assistant deletes only the tasks they set; the rest is skipped.
    const del = await api()
      .post('/api/v1/tasks/bulk')
      .set(helper.auth)
      .send({ ids: [b, byHal], action: 'delete' })
      .expect(200);
    expect(del.body.data).toEqual({ affected: 1, skipped: 1 });
    // Bulk assign to a team member.
    const assigned = await api()
      .post('/api/v1/tasks/bulk')
      .set(att.auth)
      .send({
        ids: [b],
        action: 'assign',
        assigneeMembershipId: helper.membershipId,
      })
      .expect(200);
    expect(assigned.body.data.affected).toBe(1);

    // A year later: notices 30 and 7 days before, then removal — but not
    // the one kept forever, and never an active task.
    const day = 86_400_000;
    await prisma.attorneyTask.updateMany({
      where: { id: { in: [a, c] } },
      data: { archived_at: new Date(Date.now() - 340 * day) },
    });
    const purge = app.get(TaskArchivePurgeJob);
    const first = await purge.run();
    expect(first.removed).toBe(0);
    const notice = await prisma.notification.findFirst({
      where: { user_id: att.id, type: 'task_purge_soon' },
    });
    expect(notice?.payload).toMatchObject({ count: '1', days: '30' });
    // The same stage is not announced twice.
    await purge.run();
    expect(
      await prisma.notification.count({
        where: { user_id: att.id, type: 'task_purge_soon' },
      }),
    ).toBe(1);
    await prisma.attorneyTask.updateMany({
      where: { id: { in: [a, c] } },
      data: { archived_at: new Date(Date.now() - 366 * day) },
    });
    const second = await purge.run();
    expect(second.removed).toBeGreaterThanOrEqual(1);
    expect(
      await prisma.attorneyTask.findUnique({ where: { id: c } }),
    ).toBeNull();
    expect(
      await prisma.attorneyTask.findUnique({ where: { id: a } }),
    ).not.toBeNull();
    expect(
      await prisma.attorneyTask.findUnique({ where: { id: b } }),
    ).not.toBeNull();
  });
});
