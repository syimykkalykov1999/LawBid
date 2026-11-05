import type { AddressInfo, Server } from 'node:net';
import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { ADMIN_COUNTS_SUMMARY_KEY } from '../src/common/admin-queues/admin-queues';
import { AdminSummaryService } from '../src/common/admin-summary/admin-summary.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { adminSession } from './support/admin-login';

/**
 * R-403 (owner 2026-11-04): the sidebar badge of a queue equals the number
 * of rows its default list view shows, for a seeded mix of statuses that
 * includes items the list hides (an `in_review` request, a draft, a second
 * report on the same object, a dismissed report, an unread but closed
 * ticket). A decision drops the 30 s shared copy, so the next poll already
 * shows the item gone. A country tab narrows the badge exactly as the list.
 */
jest.setTimeout(120_000);

type Page = { data: unknown[]; meta?: { nextCursor?: string | null } };
type Counts = {
  verificationQueue: number;
  openReports: number;
  supportUnread: number;
  trustQueue: number;
};

describe('Sidebar badges == default list rows (e2e, R-403)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let summary: AdminSummaryService;
  let base = '';
  let auth: Record<string, string> = {};

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
    base = `http://127.0.0.1:${((app.getHttpServer() as Server).address() as AddressInfo).port}`;
    prisma = app.get(PrismaService);
    summary = app.get(AdminSummaryService);
    auth = (await adminSession(base, prisma, 'super_admin')).auth;
  });

  afterAll(async () => {
    await app.close();
  });

  const api = () => request(base);

  /** Every row of a cursor-paged admin list. */
  async function allRows(path: string, query: Record<string, string>) {
    const rows: unknown[] = [];
    let cursor: string | undefined;
    for (;;) {
      const res = await api()
        .get(path)
        .query({ ...query, ...(cursor ? { cursor } : {}) })
        .set(auth)
        .expect(200);
      const page = res.body as Page;
      rows.push(...page.data);
      cursor = page.meta?.nextCursor ?? undefined;
      if (!cursor) return rows;
    }
  }

  /** The badges as the sidebar's next poll would get them (no stale copy). */
  async function counts(): Promise<Counts> {
    await summary.dropFamily(ADMIN_COUNTS_SUMMARY_KEY);
    const res = await api().get('/api/v1/admin/counts').set(auth).expect(200);
    return res.body.data as Counts;
  }

  async function attorney(): Promise<string> {
    const u = await prisma.user.create({
      data: { role: 'attorney', first_name: 'Badge', last_name: 'Row' },
    });
    const username = `bdg${u.id.slice(0, 8)}`;
    await prisma.attorneyProfile.create({
      data: {
        user_id: u.id,
        username,
        username_lower: username,
        languages: ['en'],
        verification_status: 'pending',
      },
    });
    return u.id;
  }

  it('verification: badge == «Все ожидающие» rows (in_review, draft and an unsubmitted request are not counted)', async () => {
    const ago = (h: number) => new Date(Date.now() - h * 3600_000);
    const submitted = await prisma.verificationRequest.create({
      data: {
        attorney_id: await attorney(),
        status: 'submitted',
        submitted_at: ago(5),
      },
    });
    await prisma.verificationRequest.create({
      data: {
        attorney_id: await attorney(),
        status: 'needs_more_info',
        submitted_at: ago(4),
      },
    });
    // The list hides these three; before R-403 the badge counted the first.
    await prisma.verificationRequest.create({
      data: {
        attorney_id: await attorney(),
        status: 'in_review',
        submitted_at: ago(3),
        reviewed_by: randomUUID(),
      },
    });
    await prisma.verificationRequest.create({
      data: { attorney_id: await attorney(), status: 'draft' },
    });
    await prisma.verificationRequest.create({
      data: { attorney_id: await attorney(), status: 'submitted' },
    });

    const before = await counts();
    const rows = await allRows('/api/v1/admin/verification/requests', {
      limit: '50',
    });
    expect(before.verificationQueue).toBe(rows.length);
    expect(rows.map((r) => (r as { id: string }).id)).toContain(submitted.id);

    // A verifier takes one: the badge drops at once, like the list.
    await api()
      .post(`/api/v1/admin/verification/requests/${submitted.id}/take`)
      .set(auth)
      .expect(200);
    const after = await api().get('/api/v1/admin/counts').set(auth).expect(200);
    expect((after.body.data as Counts).verificationQueue).toBe(
      before.verificationQueue - 1,
    );
    const left = await allRows('/api/v1/admin/verification/requests', {
      limit: '50',
    });
    expect(left.length).toBe(before.verificationQueue - 1);
  });

  it('reports: badge == «Открытые» rows (one row per object; a second report on the same object and a dismissed one add nothing)', async () => {
    const reporter = await prisma.user.create({ data: { role: 'client' } });
    const other = await prisma.user.create({ data: { role: 'client' } });
    const target = randomUUID();
    await prisma.report.createMany({
      data: [
        {
          reporter_id: reporter.id,
          target_type: 'post',
          target_id: target,
          reason: 'spam',
        },
        {
          reporter_id: other.id,
          target_type: 'post',
          target_id: target,
          reason: 'abuse',
        },
        {
          reporter_id: reporter.id,
          target_type: 'post',
          target_id: randomUUID(),
          reason: 'spam',
        },
        {
          reporter_id: reporter.id,
          target_type: 'post',
          target_id: randomUUID(),
          reason: 'spam',
          status: 'dismissed',
        },
      ],
    });
    const c = await counts();
    const rows = await allRows('/api/v1/admin/moderation/queue', {
      status: 'open',
      limit: '50',
    });
    expect(c.openReports).toBe(rows.length);
    expect(rows.length).toBeGreaterThanOrEqual(2);
  });

  it('support: badge == «Непрочитанные» rows (an unread closed ticket is not counted)', async () => {
    const u = await prisma.user.create({ data: { role: 'client' } });
    await prisma.supportTicket.createMany({
      data: [
        {
          user_id: u.id,
          subject: 'Badge unread open',
          status: 'open',
          unread_by_admin: true,
        },
        {
          user_id: u.id,
          subject: 'Badge unread waiting',
          status: 'waiting_user',
          unread_by_admin: true,
        },
        {
          user_id: u.id,
          subject: 'Badge read open',
          status: 'open',
          unread_by_admin: false,
        },
        {
          user_id: u.id,
          subject: 'Badge unread closed',
          status: 'closed',
          unread_by_admin: true,
        },
      ],
    });
    const c = await counts();
    const rows = await allRows('/api/v1/admin/support/tickets', {
      unread: 'true',
    });
    expect(c.supportUnread).toBe(rows.length);
    expect(rows.length).toBeGreaterThanOrEqual(2);
  });

  it('country tab: the badge is narrowed exactly like the list (a report from another country is in neither)', async () => {
    const elsewhere = await prisma.user.create({
      data: { role: 'client', country_code: 'US' },
    });
    await prisma.report.deleteMany({ where: { status: 'open' } });
    await prisma.report.create({
      data: {
        reporter_id: elsewhere.id,
        target_type: 'post',
        target_id: randomUUID(),
        reason: 'spam',
      },
    });
    await summary.dropFamily(ADMIN_COUNTS_SUMMARY_KEY);
    const tabbed = { ...auth, 'X-Admin-Country': 'CA' };
    const badge = await api()
      .get('/api/v1/admin/counts')
      .set(tabbed)
      .expect(200);
    const list = await api()
      .get('/api/v1/admin/moderation/queue')
      .query({ status: 'open', limit: '50' })
      .set(tabbed)
      .expect(200);
    expect((list.body as Page).data).toHaveLength(0);
    expect((badge.body.data as Counts).openReports).toBe(0);
    // Without the tab the same report is back in both.
    const all = await counts();
    expect(all.openReports).toBe(1);
  });
});
