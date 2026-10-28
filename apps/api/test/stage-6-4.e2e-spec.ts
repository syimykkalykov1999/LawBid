import type { AddressInfo, Server } from 'node:net';
import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import type Redis from 'ioredis';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { dropAppConfigCache } from '../src/modules/feature-flags/services/app-config.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { REDIS_CLIENT } from '../src/redis/redis.constants';
import { TokenService } from '../src/modules/auth/services/token.service';
import { CounterAggregator } from '../src/modules/counters/counter-aggregator.service';
import { withDeleted } from '../src/prisma/soft-delete.extension';
import { adminSession } from './support/admin-login';
import { ensurePostPractices } from './support/post-practices';

jest.setTimeout(120_000);

interface Body {
  data: Record<string, unknown>;
  error?: { code: string };
}

/**
 * docs/06 stage 6.4 acceptance: an object with 3 confirmed reports is
 * hidden; a hidden post disappears from the feed, search and profile; a
 * hidden review recalculates the rating. Plus the rule hook (block/hold,
 * links, duplicates), the queue grouping and each action.
 */
describe('stage 6.4 — moderation (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let redis: Redis;
  let tokens: TokenService;
  let counters: CounterAggregator;
  let baseUrl = '';
  let practiceAreaId = '';
  const api = () => request(baseUrl);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>({
      rawBody: true,
    });
    configureApp(app as NestExpressApplication);
    await app.init();
    await app.listen(0);
    const port = (app.getHttpServer() as Server).address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${port.port}`;
    prisma = app.get(PrismaService);
    await ensurePostPractices(prisma);
    redis = app.get<Redis>(REDIS_CLIENT);
    tokens = app.get(TokenService);
    counters = app.get(CounterAggregator);
    await setConfig('moderation.blocked_terms', ['casino bonus']);
    await setConfig('moderation.hold_terms', ['guaranteed win']);
    // This suite checks the plain «3 distinct reporters» rule; the weighted
    // rule (#364, the default) has its own suite (report-abuse.e2e-spec).
    await setConfig('moderation.auto_hide_mode', 'count');
    await prisma.state.upsert({
      where: { code: 'NJ' },
      create: { code: 'NJ', name: 'New Jersey', is_active: true },
      update: {},
    });
    practiceAreaId = (
      await prisma.practiceArea.upsert({
        where: { code: 'e2e_moderation_leaf' },
        create: {
          code: 'e2e_moderation_leaf',
          name_en: 'E2E moderation',
          i18n_key: 'practice.e2e_moderation_leaf',
          sort: 1,
        },
        update: {},
      })
    ).id;
  });

  afterAll(async () => {
    await setConfig('moderation.blocked_terms', []);
    await setConfig('moderation.hold_terms', []);
    await setConfig('moderation.auto_hide_mode', 'weighted');
    await app.close();
  });

  async function setConfig(key: string, value: unknown) {
    await prisma.appConfig.upsert({
      where: { key },
      create: { key, value: value as never },
      update: { value: value as never },
    });
    // AppConfigService caches the whole table in Redis for 30 s; the
    // version bump also drops the per-version caches (blocked terms).
    await dropAppConfigCache(redis);
  }

  const auth = (id: string, role: string, verified = false) => ({
    Authorization: `Bearer ${tokens.signAccessToken({
      sub: id,
      role,
      sid: randomUUID(),
      verified,
      subscriptionStatus: 'none',
    })}`,
  });

  async function attorney() {
    const username = `att_${randomUUID().slice(0, 8)}`;
    const u = await prisma.user.create({
      data: {
        role: 'attorney',
        first_name: 'Mod',
        last_name: 'Target',
        attorney_profile: {
          create: {
            username,
            username_lower: username,
            languages: ['en'],
            verification_status: 'verified',
            verified_at: new Date(),
          },
        },
      },
    });
    return { id: u.id, auth: auth(u.id, 'attorney', true) };
  }
  async function client() {
    const u = await prisma.user.create({ data: { role: 'client' } });
    return { id: u.id, auth: auth(u.id, 'client') };
  }
  async function post(a: { id: string }, body: string) {
    const p = await prisma.post.create({ data: { author_id: a.id, body } });
    await counters.bump('attorney', a.id, 'posts_count', 1);
    return p.id;
  }
  async function reportBy(n: number, targetType: string, targetId: string) {
    for (let i = 0; i < n; i++) {
      const r = await client();
      await api()
        .post('/api/v1/reports')
        .set(r.auth)
        .send({ targetType, targetId, reason: 'spam' })
        .expect(204);
    }
  }

  it('rule hook: blocked terms → 422 CONTENT_BLOCKED; hold terms / links / duplicates → hidden ("на проверке")', async () => {
    const a = await attorney();
    const blocked = await api()
      .post('/api/v1/posts')
      .set(a.auth)
      .set('Idempotency-Key', randomUUID())
      .send({
        title: 'A title',
        practiceCode: 'family_law',
        body: 'Free CASINO bonus for every client',
      })
      .expect(422);
    expect((blocked.body as Body).error?.code).toBe('CONTENT_BLOCKED');

    const held = await api()
      .post('/api/v1/posts')
      .set(a.auth)
      .set('Idempotency-Key', randomUUID())
      .send({
        title: 'A title',
        practiceCode: 'family_law',
        body: 'A guaranteed win, call me',
      })
      .expect(201);
    expect((held.body as Body).data.status).toBe('hidden');

    const links = await api()
      .post('/api/v1/posts')
      .set(a.auth)
      .set('Idempotency-Key', randomUUID())
      .send({
        title: 'A title',
        practiceCode: 'family_law',
        body: 'see https://a.io https://b.io https://c.io',
      })
      .expect(201);
    expect((links.body as Body).data.status).toBe('hidden');

    const first = await api()
      .post('/api/v1/posts')
      .set(a.auth)
      .set('Idempotency-Key', randomUUID())
      .send({
        title: 'A title',
        practiceCode: 'family_law',
        body: 'Plain advice about parking tickets',
      })
      .expect(201);
    expect((first.body as Body).data.status).toBe('published');
    const dup = await api()
      .post('/api/v1/posts')
      .set(a.auth)
      .set('Idempotency-Key', randomUUID())
      .send({
        title: 'A title',
        practiceCode: 'family_law',
        body: 'Plain advice about PARKING tickets!',
      })
      .expect(201);
    expect((dup.body as Body).data.status).toBe('hidden');

    // Algo audit 2026-10-27 (CONTENT C-3): re-saving the own post (same
    // text, or a changed one) is not a "repeat" of itself.
    const firstId = (first.body as Body).data.id as string;
    const resaved = await api()
      .patch(`/api/v1/posts/${firstId}`)
      .set(a.auth)
      .send({ title: 'A title', body: 'Plain advice about parking tickets' })
      .expect(200);
    expect((resaved.body as Body).data.status).toBe('published');
    const edited = await api()
      .patch(`/api/v1/posts/${firstId}`)
      .set(a.auth)
      .send({
        title: 'A title',
        body: 'Plain advice about parking tickets, updated',
      })
      .expect(200);
    expect((edited.body as Body).data.status).toBe('published');

    // Algo audit 2026-10-27 (CONTENT C-2): every held post is a ticket in
    // the moderators' queue (a system report, not a person's complaint).
    const heldId = (held.body as Body).data.id as string;
    const mod = await adminSession(baseUrl, prisma, 'moderator');
    const queue = await api()
      .get('/api/v1/admin/moderation/queue?targetType=post')
      .set(mod.auth)
      .expect(200);
    const queued = (queue.body as { data: Array<Record<string, unknown>> })
      .data;
    expect(queued.map((r) => r.targetId)).toEqual(
      expect.arrayContaining([
        heldId,
        (links.body as Body).data.id as string,
        (dup.body as Body).data.id as string,
      ]),
    );
    expect(queued.find((r) => r.targetId === heldId)).toMatchObject({
      targetStatus: 'hidden',
      reports: 1,
    });
    expect(
      await prisma.report.count({
        where: { target_id: heldId, note: { startsWith: 'auto_hold' } },
      }),
    ).toBe(1);

    // CONTENT C-1: «Отклонить жалобы» on a post the rules hid puts it back
    // (recorded as a restore, the author told); the moderator may still
    // remove it instead.
    const notices = await prisma.notification.count({
      where: { user_id: a.id, type: 'moderation_notice' },
    });
    const dismissed = await api()
      .post(`/api/v1/admin/moderation/targets/post/${heldId}/actions`)
      .set(mod.auth)
      .send({ action: 'dismiss', reason: 'Nothing wrong with it' })
      .expect(200);
    expect((dismissed.body as Body).data.status).toBe('published');
    expect(
      (await prisma.post.findUniqueOrThrow({ where: { id: heldId } })).status,
    ).toBe('published');
    expect(
      await prisma.report.count({
        where: { target_id: heldId, status: 'dismissed' },
      }),
    ).toBe(1);
    expect(
      await prisma.moderationAction.count({
        where: { target_id: heldId, action: 'restore' },
      }),
    ).toBe(1);
    expect(
      await prisma.notification.count({
        where: { user_id: a.id, type: 'moderation_notice' },
      }),
    ).toBe(notices + 1);

    // A comment with a blocked term is refused too.
    const c = await client();
    const cb = await api()
      .post(`/api/v1/posts/${(first.body as Body).data.id as string}/comments`)
      .set(c.auth)
      .set('Idempotency-Key', randomUUID())
      .send({ body: 'casino bonus link inside' })
      .expect(422);
    expect((cb.body as Body).error?.code).toBe('CONTENT_BLOCKED');
  });

  it('3 distinct reporters auto-hide a post: gone from feed, search and profile; queue shows it grouped', async () => {
    const a = await attorney();
    const reader = await client();
    const postId = await post(
      a,
      `Unique moderation token ${randomUUID().slice(0, 8)} #modtest`,
    );
    const body = (
      await prisma.post.findUniqueOrThrow({ where: { id: postId } })
    ).body;
    const word = body.split(' ')[3];

    const visible = async () => {
      const profile = await api()
        .get(`/api/v1/attorneys/${a.id}/posts`)
        .set(reader.auth)
        .expect(200);
      const search = await api()
        .get(`/api/v1/search/posts?q=${word}`)
        .set(reader.auth)
        .expect(200);
      const ids = (r: request.Response) =>
        ((r.body as { data: Array<{ id: string }> }).data ?? []).map(
          (p) => p.id,
        );
      return {
        profile: ids(profile).includes(postId),
        search: ids(search).includes(postId),
      };
    };
    expect(await visible()).toEqual({ profile: true, search: true });

    await reportBy(2, 'post', postId);
    expect(
      (await prisma.post.findUniqueOrThrow({ where: { id: postId } })).status,
    ).toBe('published');
    await reportBy(1, 'post', postId);
    expect(
      (await prisma.post.findUniqueOrThrow({ where: { id: postId } })).status,
    ).toBe('hidden');
    expect(await visible()).toEqual({ profile: false, search: false });
    // The feed of a follower no longer lists it.
    await prisma.follow.create({
      data: { follower_id: reader.id, followee_id: a.id },
    });
    const feed = await api().get('/api/v1/feed').set(reader.auth).expect(200);
    expect(
      (feed.body as { data: Array<{ id: string }> }).data.map((p) => p.id),
    ).not.toContain(postId);
    // posts_count follows the status.
    await counters.flush();
    expect(
      (
        await prisma.attorneyProfile.findUniqueOrThrow({
          where: { user_id: a.id },
        })
      ).posts_count,
    ).toBe(0);

    const mod = await adminSession(baseUrl, prisma, 'moderator');
    const queue = await api()
      .get('/api/v1/admin/moderation/queue?targetType=post')
      .set(mod.auth)
      .expect(200);
    const row = (
      queue.body as { data: Array<Record<string, unknown>> }
    ).data.find((r) => r.targetId === postId);
    expect(row).toMatchObject({
      reports: 3,
      reporters: 3,
      targetStatus: 'hidden',
      reasons: ['spam'],
    });
    expect((row!.author as { id: string }).id).toBe(a.id);

    // Algo audit 2026-10-27 (CONTENT C-1): the threshold hid it, no
    // moderator did — «Отклонить жалобы» = the reports were wrong, the
    // post comes back. Before, it stayed hidden for ever.
    await api()
      .post(`/api/v1/admin/moderation/targets/post/${postId}/actions`)
      .set(mod.auth)
      .send({ action: 'dismiss', reason: 'Reports unfounded' })
      .expect(200);
    expect(
      (await prisma.post.findUniqueOrThrow({ where: { id: postId } })).status,
    ).toBe('published');
    expect(await visible()).toEqual({ profile: true, search: true });

    // A moderator's own hide is a decision: dismissing later reports on it
    // keeps it hidden.
    await api()
      .post(`/api/v1/admin/moderation/targets/post/${postId}/actions`)
      .set(mod.auth)
      .send({ action: 'hide', reason: 'Misleading' })
      .expect(200);
    await reportBy(1, 'post', postId);
    await api()
      .post(`/api/v1/admin/moderation/targets/post/${postId}/actions`)
      .set(mod.auth)
      .send({ action: 'dismiss', reason: 'Already handled' })
      .expect(200);
    expect(
      (await prisma.post.findUniqueOrThrow({ where: { id: postId } })).status,
    ).toBe('hidden');
  });

  it('3 reports on a review hide it and recalculate the attorney rating', async () => {
    const a = await attorney();
    const c1 = await client();
    const c2 = await client();
    const mk = async (cl: { id: string }, rating: number) => {
      const kase = await prisma.case.create({
        data: {
          client_id: cl.id,
          title: 'Closed case',
          description: 'Done and reviewed, nothing else to say here.',
          practice_area_id: practiceAreaId,
          primary_state_code: 'NJ',
          budget_mode: 'clarify_later',
          status: 'closed',
        },
      });
      return prisma.review.create({
        data: {
          case_id: kase.id,
          client_id: cl.id,
          attorney_id: a.id,
          rating,
          body: 'ok',
        },
      });
    };
    const good = await mk(c1, 5);
    const bad = await mk(c2, 1);
    await prisma.attorneyProfile.update({
      where: { user_id: a.id },
      data: { rating_avg: 3, rating_count: 2 },
    });
    // Only the reviewed attorney can report a review through the API
    // (file 03 §7.4); two more distinct reporters are seeded directly so the
    // attorney's own report is the third confirmed one.
    for (let i = 0; i < 2; i++) {
      await prisma.report.create({
        data: {
          reporter_id: (await client()).id,
          target_type: 'review',
          target_id: bad.id,
          reason: 'abuse',
        },
      });
    }
    await api()
      .post(`/api/v1/reviews/${bad.id}/report`)
      .set(a.auth)
      .send({ reason: 'abuse' })
      .expect(201);
    expect(
      (await prisma.review.findUniqueOrThrow({ where: { id: bad.id } })).status,
    ).toBe('hidden');
    const prof = await prisma.attorneyProfile.findUniqueOrThrow({
      where: { user_id: a.id },
    });
    expect(Number(prof.rating_avg)).toBe(5);
    expect(prof.rating_count).toBe(1);
    expect(
      (await prisma.review.findUniqueOrThrow({ where: { id: good.id } }))
        .status,
    ).toBe('published');
  });

  it('moderator actions: card, hide/restore with notice, warn, dismiss, remove; audit; matrix', async () => {
    const mod = await adminSession(baseUrl, prisma, 'moderator');
    const support = await adminSession(baseUrl, prisma, 'support');
    const a = await attorney();
    const postId = await post(a, 'Reported but fine');
    await reportBy(1, 'post', postId);

    await api()
      .get('/api/v1/admin/moderation/queue')
      .set(support.auth)
      .expect(404);

    const card = await api()
      .get(`/api/v1/admin/moderation/targets/post/${postId}`)
      .set(mod.auth)
      .expect(200);
    const cd = (card.body as Body).data;
    expect(cd).toMatchObject({
      status: 'published',
      text: 'Reported but fine',
    });
    expect((cd.author as { id: string }).id).toBe(a.id);
    expect(cd.availableActions).toEqual(
      expect.arrayContaining(['hide', 'remove', 'warn', 'suspend', 'dismiss']),
    );
    expect((cd.reports as unknown[]).length).toBe(1);

    const noReason = await api()
      .post(`/api/v1/admin/moderation/targets/post/${postId}/actions`)
      .set(mod.auth)
      .send({ action: 'hide' })
      .expect(400);
    // Owner 2026-10-05: moderation is a «reason required» section for staff.
    expect((noReason.body as Body).error?.code).toBe('REASON_REQUIRED');

    const hid = await api()
      .post(`/api/v1/admin/moderation/targets/post/${postId}/actions`)
      .set(mod.auth)
      .send({ action: 'hide', reason: 'Misleading claim' })
      .expect(200);
    expect((hid.body as Body).data).toMatchObject({
      status: 'hidden',
      reportsHandled: 1,
    });
    expect(
      (await prisma.post.findUniqueOrThrow({ where: { id: postId } })).status,
    ).toBe('hidden');
    expect(
      await prisma.report.count({
        where: {
          target_id: postId,
          status: 'actioned',
          handled_by: mod.userId,
        },
      }),
    ).toBe(1);
    expect(
      await prisma.notification.count({
        where: { user_id: a.id, type: 'moderation_notice' },
      }),
    ).toBe(1);

    // Restore → published again, author notified again.
    await api()
      .post(`/api/v1/admin/moderation/targets/post/${postId}/actions`)
      .set(mod.auth)
      .send({ action: 'restore', reason: 'Appeal accepted by email' })
      .expect(200);
    expect(
      (await prisma.post.findUniqueOrThrow({ where: { id: postId } })).status,
    ).toBe('published');
    // Hide again is fine; hiding an already hidden post is 409.
    await api()
      .post(`/api/v1/admin/moderation/targets/post/${postId}/actions`)
      .set(mod.auth)
      .send({ action: 'hide', reason: 'Second look' })
      .expect(200);
    const again = await api()
      .post(`/api/v1/admin/moderation/targets/post/${postId}/actions`)
      .set(mod.auth)
      .send({ action: 'hide', reason: 'Twice' })
      .expect(409);
    expect((again.body as Body).error?.code).toBe(
      'MODERATION_ACTION_NOT_APPLICABLE',
    );

    // Warn goes through the §3.4 path (moderation_actions on the user).
    await api()
      .post(`/api/v1/admin/moderation/targets/post/${postId}/actions`)
      .set(mod.auth)
      .send({ action: 'warn', reason: 'Keep claims factual' })
      .expect(200);
    expect(
      await prisma.moderationAction.count({
        where: { target_type: 'user', target_id: a.id, action: 'warn' },
      }),
    ).toBe(1);

    // Dismiss closes open reports without a notice.
    const other = await post(a, 'Perfectly fine post');
    await reportBy(1, 'post', other);
    const notices = await prisma.notification.count({
      where: { user_id: a.id, type: 'moderation_notice' },
    });
    await api()
      .post(`/api/v1/admin/moderation/targets/post/${other}/actions`)
      .set(mod.auth)
      .send({ action: 'dismiss', reason: 'Nothing wrong with it' })
      .expect(200);
    expect(
      await prisma.report.count({
        where: { target_id: other, status: 'dismissed' },
      }),
    ).toBe(1);
    expect(
      await prisma.notification.count({
        where: { user_id: a.id, type: 'moderation_notice' },
      }),
    ).toBe(notices);
    // The dismissed object is no longer in the open queue but is in "dismissed".
    const openQ = await api()
      .get('/api/v1/admin/moderation/queue')
      .set(mod.auth)
      .expect(200);
    expect(
      (openQ.body as { data: Array<{ targetId: string }> }).data.map(
        (r) => r.targetId,
      ),
    ).not.toContain(other);
    const dismissedQ = await api()
      .get('/api/v1/admin/moderation/queue?status=dismissed')
      .set(mod.auth)
      .expect(200);
    expect(
      (dismissedQ.body as { data: Array<{ targetId: string }> }).data.map(
        (r) => r.targetId,
      ),
    ).toContain(other);

    // Remove: gone for good (status removed), author notified.
    await api()
      .post(`/api/v1/admin/moderation/targets/post/${postId}/actions`)
      .set(mod.auth)
      .send({ action: 'remove', reason: 'Repeated violation' })
      .expect(200);
    expect(
      (await prisma.post.findUniqueOrThrow({ where: { id: postId } })).status,
    ).toBe('removed');

    const audit = await prisma.auditLog.findMany({
      where: { admin_id: mod.userId, action: { startsWith: 'moderation.' } },
      orderBy: { created_at: 'asc' },
    });
    expect(audit.map((r) => r.action)).toEqual([
      'moderation.hide',
      'moderation.restore',
      'moderation.hide',
      'moderation.warn',
      'moderation.dismiss',
      // #364: a removal also gives the author a strike (audited first).
      'moderation.strike_issued',
      'moderation.remove',
    ]);
    expect(audit[0]).toMatchObject({
      before: { status: 'published', openReports: 1 },
      after: { status: 'hidden', reason: 'Misleading claim' },
    });
    await redis.del('adm:sum:dashboard');
  });

  it('comment hide keeps the post comment_count in sync; message hide sets deleted_at', async () => {
    const mod = await adminSession(baseUrl, prisma, 'moderator');
    const a = await attorney();
    const c = await client();
    const postId = await post(a, 'Post with comments');
    const created = await api()
      .post(`/api/v1/posts/${postId}/comments`)
      .set(c.auth)
      .set('Idempotency-Key', randomUUID())
      .send({ body: 'Nice one' })
      .expect(201);
    const commentId = (created.body as Body).data.id as string;
    await counters.flush();
    expect(
      (await prisma.post.findUniqueOrThrow({ where: { id: postId } }))
        .comment_count,
    ).toBe(1);
    await api()
      .post(`/api/v1/admin/moderation/targets/comment/${commentId}/actions`)
      .set(mod.auth)
      .send({ action: 'hide', reason: 'Off topic spam' })
      .expect(200);
    await counters.flush();
    expect(
      (await prisma.post.findUniqueOrThrow({ where: { id: postId } }))
        .comment_count,
    ).toBe(0);
    const list = await api()
      .get(`/api/v1/posts/${postId}/comments`)
      .set(c.auth)
      .expect(200);
    expect(
      (list.body as { data: Array<{ id: string }> }).data.map((x) => x.id),
    ).not.toContain(commentId);

    const conv = await prisma.conversation.create({
      data: { client_id: c.id, attorney_id: a.id, status: 'pre_acceptance' },
    });
    const msg = await prisma.message.create({
      data: {
        conversation_id: conv.id,
        sender_id: c.id,
        type: 'text',
        client_message_id: randomUUID(),
        body_original: 'call me 555',
        body_display: 'call me [контакт скрыт]',
      },
    });
    const r = await api()
      .post(`/api/v1/admin/moderation/targets/message/${msg.id}/actions`)
      .set(mod.auth)
      .send({ action: 'hide', reason: 'Harassment' })
      .expect(200);
    expect((r.body as Body).data.status).toBe('removed');
    expect(
      (
        await prisma.message.findFirstOrThrow({
          where: withDeleted({ id: msg.id }),
        })
      ).deleted_at,
    ).toBeTruthy();
  });
});
