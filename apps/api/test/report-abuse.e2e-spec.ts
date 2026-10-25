import type { AddressInfo, Server } from 'node:net';
import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { TokenService } from '../src/modules/auth/services/token.service';
import { AutoAppealsService } from '../src/modules/moderation/auto-appeals.service';
import { AutoModerationService } from '../src/modules/moderation/auto-moderation.service';
import { ReporterReputationService } from '../src/modules/moderation/reporter-reputation.service';
import { AdminModerationService } from '../src/modules/moderation/admin-moderation.service';
import { StrikesService } from '../src/modules/moderation/strikes.service';
import { UsageLimitsService } from '../src/common/usage-limits/usage-limits.service';
import { dropAppConfigCache } from '../src/modules/feature-flags/services/app-config.service';
import { REDIS_CLIENT } from '../src/redis/redis.constants';
import type { AdminActor } from '../src/modules/admin-auth/admin-auth.decorators';

/**
 * Owner 2026-10-27: weighted reports, the unfounded-reporter ladder, strikes,
 * and automatic account decisions with appeals.
 */
jest.setTimeout(180_000);

describe('Report abuse defenses (e2e, owner 2026-10-27)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tokens: TokenService;
  let base = '';
  const DAY = 24 * 3600 * 1000;

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

  async function setConfig(values: Record<string, unknown>) {
    for (const [key, value] of Object.entries(values)) {
      await prisma.appConfig.upsert({
        where: { key },
        create: { key, value: value as never },
        update: { value: value as never },
      });
    }
    await dropAppConfigCache(app.get(REDIS_CLIENT));
  }

  async function person(
    role: 'client' | 'attorney',
    opts: {
      ageDays?: number;
      verifiedAttorney?: boolean;
      device?: string;
    } = {},
  ) {
    const u = await prisma.user.create({
      data: {
        role,
        first_name: 'P',
        last_name: randomUUID().slice(0, 6),
        created_at: new Date(Date.now() - (opts.ageDays ?? 90) * DAY),
        phone_verified_at: new Date(),
      },
    });
    if (role === 'attorney') {
      await prisma.attorneyProfile.create({
        data: {
          user_id: u.id,
          username: `ra_${u.id.slice(0, 8)}`,
          username_lower: `ra_${u.id.slice(0, 8)}`,
          languages: ['en'],
          verification_status: opts.verifiedAttorney
            ? 'verified'
            : 'unverified',
        },
      });
    }
    const sid = randomUUID();
    await prisma.session.create({
      data: {
        user_id: u.id,
        session_chain_id: sid,
        device_id: opts.device ?? `dev-${u.id}`,
        ip: `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`,
        refresh_hash: randomUUID(),
        expires_at: new Date(Date.now() + DAY),
      },
    });
    const t = tokens.signAccessToken({
      sub: u.id,
      role,
      sid,
      verified: !!opts.verifiedAttorney,
      subscriptionStatus: 'none',
    });
    return { id: u.id, auth: { Authorization: `Bearer ${t}` } };
  }

  const newPost = (authorId: string) =>
    prisma.post.create({
      data: {
        author_id: authorId,
        body: 'A perfectly fine post',
        status: 'published',
      },
    });

  const report = (who: { auth: Record<string, string> }, postId: string) =>
    api()
      .post('/api/v1/reports')
      .set(who.auth)
      .send({ targetType: 'post', targetId: postId, reason: 'spam' });

  const actor = (id: string) =>
    ({
      id,
      role: 'super_admin',
      countries: null,
      ip: '127.0.0.1',
    }) as unknown as AdminActor;

  beforeEach(async () => {
    await setConfig({
      'moderation.auto_hide_mode': 'weighted',
      'moderation.auto_hide_score': 3,
      'moderation.verified_attorney_action': 'review',
      'rate_limit.report_per_day': 1000,
    });
  });

  it("3 brand-new sock-puppet accounts cannot hide a verified attorney's post", async () => {
    const attorney = await person('attorney', { verifiedAttorney: true });
    const post = await newPost(attorney.id);
    for (let i = 0; i < 3; i++) {
      const sock = await person('client', { ageDays: 0, device: 'one-device' });
      await report(sock, post.id).expect(204);
    }
    const after = await prisma.post.findUniqueOrThrow({
      where: { id: post.id },
    });
    expect(after.status).toBe('published');
  });

  it('3 sock puppets cannot hide an ordinary post either, 4 established independent people can; the owner can appeal', async () => {
    const author = await person('client');
    const target = await newPost(author.id);
    for (let i = 0; i < 3; i++) {
      await report(await person('client', { ageDays: 0 }), target.id).expect(
        204,
      );
    }
    expect(
      (await prisma.post.findUniqueOrThrow({ where: { id: target.id } }))
        .status,
    ).toBe('published');
    for (let i = 0; i < 4; i++) {
      await report(await person('client'), target.id).expect(204);
    }
    expect(
      (await prisma.post.findUniqueOrThrow({ where: { id: target.id } }))
        .status,
    ).toBe('hidden');

    const decision = await prisma.moderationAutoAction.findFirstOrThrow({
      where: { user_id: author.id, kind: 'content_hide' },
    });
    const appealed = await api()
      .post(`/api/v1/moderation/auto-actions/${decision.id}/appeal`)
      .set(author.auth)
      .send({ message: 'This is fine' })
      .expect(201);
    expect(appealed.body.data.appealStatus).toBe('pending');

    const mod = await prisma.user.create({
      data: { role: 'client', first_name: 'M', last_name: 'M' },
    });
    await expect(
      app
        .get(AutoAppealsService)
        .decide(actor(mod.id), decision.id, true, 'Looks fine'),
    ).resolves.toBe('accepted');
    expect(
      (await prisma.post.findUniqueOrThrow({ where: { id: target.id } }))
        .status,
    ).toBe('published');
    // The reports behind a wrong decision are dismissed.
    expect(
      await prisma.report.count({
        where: { target_id: target.id, status: 'open' },
      }),
    ).toBe(0);
  });

  it('the old count mode is still available as a setting', async () => {
    await setConfig({
      'moderation.auto_hide_mode': 'count',
      'moderation.auto_hide_reports': 3,
    });
    const author = await person('client');
    const post = await newPost(author.id);
    for (let i = 0; i < 3; i++) {
      await report(await person('client', { ageDays: 0 }), post.id).expect(204);
    }
    expect(
      (await prisma.post.findUniqueOrThrow({ where: { id: post.id } })).status,
    ).toBe('hidden');
  });

  it('a reporter whose reports are dismissed is warned, then paused, and can appeal', async () => {
    await setConfig({
      'moderation.report_abuse.min_reports': 2,
      'moderation.report_abuse.repeat_after_warning': 2,
      'moderation.report_abuse.unfounded_percent': 80,
    });
    const reporter = await person('client');
    const mod = await prisma.user.create({
      data: { role: 'client', first_name: 'M', last_name: 'M' },
    });
    const admin = app.get(AdminModerationService);
    const dismissTwo = async () => {
      for (let i = 0; i < 2; i++) {
        const post = await newPost((await person('client')).id);
        await report(reporter, post.id).expect(204);
        await admin.act(actor(mod.id), 'post', post.id, 'dismiss', '');
      }
    };
    await dismissTwo();
    let st = await prisma.reporterStanding.findUniqueOrThrow({
      where: { user_id: reporter.id },
    });
    expect(st.warnings).toBe(1);
    expect(st.suspended_until).toBeNull();

    await dismissTwo();
    st = await prisma.reporterStanding.findUniqueOrThrow({
      where: { user_id: reporter.id },
    });
    expect(st.suspended_until).not.toBeNull();

    const blocked = await report(
      reporter,
      (await newPost((await person('client')).id)).id,
    );
    expect(blocked.status).toBe(403);
    expect(blocked.body.error.code).toBe('REPORTING_SUSPENDED');

    await api()
      .post('/api/v1/moderation/reporting-appeal')
      .set(reporter.auth)
      .send({ message: 'They were real' })
      .expect(201);
    await expect(
      app
        .get(ReporterReputationService)
        .decideAppeal(actor(mod.id), reporter.id, true, 'OK'),
    ).resolves.toBe('accepted');
    await report(
      reporter,
      (await newPost((await person('client')).id)).id,
    ).expect(204);
  });

  it('a moderator removal gives a strike; at the threshold publishing is limited; revoking lifts it', async () => {
    await setConfig({
      'moderation.strikes.points_remove': 1,
      'moderation.strikes.cooldown_at': 0,
      'moderation.strikes.limited_at': 2,
      'moderation.strikes.suspend_at': 0,
    });
    const owner = await person('client');
    const mod = await prisma.user.create({
      data: { role: 'client', first_name: 'M', last_name: 'M' },
    });
    const admin = app.get(AdminModerationService);
    for (let i = 0; i < 2; i++) {
      const p = await newPost(owner.id);
      await admin.act(actor(mod.id), 'post', p.id, 'remove', 'spam');
    }
    const limits = app.get(UsageLimitsService);
    await expect(limits.consume('post_create', owner.id)).rejects.toMatchObject(
      {
        response: { code: 'ACCOUNT_STRIKE_LIMITED' },
      },
    );
    // Replies are still allowed while "limited".
    await expect(limits.consume('comment', owner.id)).resolves.toBeUndefined();
    const strikes = await prisma.userStrike.findMany({
      where: { user_id: owner.id },
    });
    expect(strikes).toHaveLength(2);
    for (const s of strikes)
      await app.get(StrikesService).revoke(actor(mod.id), s.id, 'mistake');
    await expect(
      limits.consume('post_create', owner.id),
    ).resolves.toBeUndefined();
  });

  it('account score from many independent reporters limits the account automatically; an appeal restores it; verified attorneys only get priority review', async () => {
    await setConfig({
      'moderation.auto.account_mode': 'enforce',
      'moderation.auto.limit_at': 2,
      'moderation.auto.suspend_temp_at': 0,
      'moderation.auto.suspend_at': 0,
      'moderation.auto_hide_score': 1000,
    });
    const owner = await person('client');
    const post = await newPost(owner.id);
    for (let i = 0; i < 3; i++)
      await report(await person('client'), post.id).expect(204);
    const limitAction = await prisma.moderationAutoAction.findFirstOrThrow({
      where: { user_id: owner.id, kind: 'account_limit' },
    });
    expect(limitAction.enforced).toBe(true);
    await expect(
      app.get(UsageLimitsService).consume('post_create', owner.id),
    ).rejects.toMatchObject({ response: { code: 'ACCOUNT_STRIKE_LIMITED' } });

    await api()
      .post(`/api/v1/moderation/auto-actions/${limitAction.id}/appeal`)
      .set(owner.auth)
      .send({ message: 'Mistake' })
      .expect(201);
    const mod = await prisma.user.create({
      data: { role: 'client', first_name: 'M', last_name: 'M' },
    });
    await app
      .get(AutoAppealsService)
      .decide(actor(mod.id), limitAction.id, true, 'Restored');
    await expect(
      app.get(UsageLimitsService).consume('post_create', owner.id),
    ).resolves.toBeUndefined();

    // A verified attorney with the same pile of reports is never limited.
    const attorney = await person('attorney', { verifiedAttorney: true });
    const apost = await newPost(attorney.id);
    for (let i = 0; i < 3; i++)
      await report(await person('client'), apost.id).expect(204);
    await app.get(AutoModerationService).evaluateAccount(attorney.id);
    expect(
      await prisma.moderationAutoAction.count({
        where: { user_id: attorney.id, kind: 'account_limit' },
      }),
    ).toBe(0);
    expect(
      await prisma.moderationAutoAction.count({
        where: { user_id: attorney.id, kind: 'review_needed' },
      }),
    ).toBe(1);
  });

  it('shadow mode logs the decision and does nothing; metrics count it', async () => {
    await setConfig({
      'moderation.auto.account_mode': 'shadow',
      'moderation.auto.limit_at': 2,
      'moderation.auto_hide_score': 1000,
    });
    const owner = await person('client');
    const post = await newPost(owner.id);
    for (let i = 0; i < 3; i++)
      await report(await person('client'), post.id).expect(204);
    const row = await prisma.moderationAutoAction.findFirstOrThrow({
      where: { user_id: owner.id, kind: 'account_limit' },
    });
    expect(row.enforced).toBe(false);
    await expect(
      app.get(UsageLimitsService).consume('post_create', owner.id),
    ).resolves.toBeUndefined();
    const m = await app.get(AutoModerationService).metrics(1);
    expect(m.shadowActions).toBeGreaterThanOrEqual(1);
  });

  it('appeals past the SLA are approved by themselves only when borderline and the setting is on', async () => {
    await setConfig({
      'moderation.auto.sla_auto_approve': true,
      'moderation.auto.appeal_sla_hours': 1,
    });
    const owner = await person('client');
    const mk = (borderline: boolean) =>
      prisma.moderationAutoAction.create({
        data: {
          kind: 'account_limit',
          user_id: owner.id,
          score: 7,
          threshold: 6,
          borderline,
          enforced: true,
          appeal_status: 'pending',
          appeal_message: 'please',
          appeal_at: new Date(Date.now() - 5 * 3600 * 1000),
        },
      });
    const borderline = await mk(true);
    const clear = await mk(false);
    const r = await app.get(AutoAppealsService).sweepOverdue();
    expect(r.approved).toBe(1);
    expect(
      (
        await prisma.moderationAutoAction.findUniqueOrThrow({
          where: { id: borderline.id },
        })
      ).appeal_status,
    ).toBe('accepted');
    expect(
      (
        await prisma.moderationAutoAction.findUniqueOrThrow({
          where: { id: clear.id },
        })
      ).appeal_status,
    ).toBe('pending');
  });
});
