import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type Redis from 'ioredis';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { REDIS_CLIENT } from '../src/redis/redis.constants';
import { shardContext } from '../src/sharding/shard-context';
import { CasesService } from '../src/modules/cases/cases.service';
import { dropAppConfigCache } from '../src/modules/feature-flags/services/app-config.service';
import { CaseFanoutService } from '../src/modules/notifications/case-fanout/case-fanout.service';
import { SubscriptionAlertsService } from '../src/modules/notifications/subscription-alerts.service';
import { NotificationsApiService } from '../src/modules/notifications/notifications-api.service';
import { ensurePostPractices } from './support/post-practices';

/**
 * Owner 2026-09-30: opt-in alerts. Followers who turned "Following" on
 * get `followed_post`; attorneys get `new_case` for a case in their
 * practice and licensed state. Algo audit 2026-10-27 (CASES C-2): an
 * attorney who never touched the «Новые дела» toggle is alerted too
 * (`case_alerts.default_enabled`); an explicit OFF still excludes. C-1:
 * a changed practice alerts the new audience again under a new
 * generation. H-1: with Redis the one legacy wave is a queue job.
 */
jest.setTimeout(60_000);

describe('Opt-in follow / new-case alerts (e2e, owner 2026-09-30)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let redis: Redis;
  let alerts: SubscriptionAlertsService;

  async function setConfig(key: string, value: unknown) {
    if (value === null) {
      await prisma.appConfig.deleteMany({ where: { key } });
    } else {
      await prisma.appConfig.upsert({
        where: { key },
        create: { key, value: value as never },
        update: { value: value as never },
      });
    }
    await dropAppConfigCache(redis);
  }

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
    redis = app.get<Redis>(REDIS_CLIENT);
    alerts = app.get(SubscriptionAlertsService);
    await ensurePostPractices(prisma);
    await prisma.state.upsert({
      where: { code: 'NJ' },
      create: { code: 'NJ', name: 'New Jersey' },
      update: {},
    });
    // The assertions below read the rows right after the call: the legacy
    // wave runs inline here (the queue path has its own test at the end).
    await setConfig('case_fanout.queue_mode', 'off');
  });

  afterAll(async () => {
    await setConfig('case_fanout.queue_mode', null);
    await app.close();
  });

  const notifs = (userId: string, type: 'followed_post' | 'new_case') =>
    prisma.notification.count({ where: { user_id: userId, type } });

  const optIn = (userId: string, category: 'following' | 'new_cases') =>
    prisma.notificationSetting.create({
      data: { user_id: userId, category, push_enabled: true },
    });

  /** Waits (≤ 5 s) until [count] rows of [type] exist for [userId]. */
  async function waitForNotifs(
    userId: string,
    type: 'new_case',
    count: number,
  ): Promise<number> {
    for (let i = 0; i < 50; i++) {
      const n = await notifs(userId, type);
      if (n >= count) return n;
      await new Promise((r) => setTimeout(r, 100));
    }
    return notifs(userId, type);
  }

  it('alerts only followers who turned "Following" on', async () => {
    const author = await prisma.user.create({ data: { role: 'attorney' } });
    const on = await prisma.user.create({ data: { role: 'client' } });
    const off = await prisma.user.create({ data: { role: 'client' } });
    const blocked = await prisma.user.create({ data: { role: 'client' } });
    for (const f of [on, off, blocked]) {
      await prisma.follow.create({
        data: { follower_id: f.id, followee_id: author.id },
      });
    }
    await optIn(on.id, 'following');
    await optIn(blocked.id, 'following');
    await prisma.userBlock.create({
      data: { blocker_id: author.id, blocked_id: blocked.id },
    });
    const post = await prisma.post.create({
      data: { author_id: author.id, body: 'hello', title: 'Hi' },
    });

    expect(await alerts.followersOfPost(author.id, post.id)).toBe(1);
    expect(await notifs(on.id, 'followed_post')).toBe(1);
    expect(await notifs(off.id, 'followed_post')).toBe(0);
    expect(await notifs(blocked.id, 'followed_post')).toBe(0);
  });

  it('alerts attorneys of the practice and state who turned "New cases" on', async () => {
    const leaf = await prisma.practiceArea.findUniqueOrThrow({
      where: {
        code: 'civil_litigation.arbitration_and_mediation_representation',
      },
    });
    const other = await prisma.practiceArea.findUniqueOrThrow({
      where: { code: 'family_law' },
    });
    const client = await prisma.user.create({ data: { role: 'client' } });
    async function attorney(
      practiceId: string,
      optedIn: boolean | 'off' | 'untouched' = 'untouched',
    ) {
      const u = await prisma.user.create({ data: { role: 'attorney' } });
      const username = `al_${u.id.slice(0, 8)}`;
      await prisma.attorneyProfile.create({
        data: {
          user_id: u.id,
          username,
          username_lower: username,
          languages: ['en'],
          verification_status: 'verified',
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
      await prisma.attorneyPracticeArea.create({
        data: { attorney_id: u.id, practice_area_id: practiceId },
      });
      if (optedIn === true) await optIn(u.id, 'new_cases');
      if (optedIn === 'off') {
        await prisma.notificationSetting.create({
          data: { user_id: u.id, category: 'new_cases', push_enabled: false },
        });
      }
      return u.id;
    }
    const match = await attorney(leaf.id, true);
    // Algo audit 2026-10-27 (C-2): never opened the toggle → alerted.
    const untouched = await attorney(leaf.id);
    const optedOut = await attorney(leaf.id, 'off');
    const otherPractice = await attorney(other.id, true);
    const c = await prisma.case.create({
      data: {
        client_id: client.id,
        title: 'Arbitration clause dispute',
        description: 'A contract with an arbitration clause',
        practice_area_id: leaf.id,
        primary_state_code: 'NJ',
        budget_mode: 'clarify_later',
      },
    });
    await prisma.caseState.create({
      data: { case_id: c.id, state_code: 'NJ', is_primary: true },
    });

    expect(await alerts.attorneysForCase(c.id)).toBe(2);
    expect(await notifs(match, 'new_case')).toBe(1);
    expect(await notifs(untouched, 'new_case')).toBe(1);
    expect(await notifs(optedOut, 'new_case')).toBe(0);
    expect(await notifs(otherPractice, 'new_case')).toBe(0);

    // Owner 2026-10-01: a chosen list replaces the profile's — a category
    // covers its subcategories; the match above narrows to family law.
    const settings = app.get(NotificationsApiService);
    const parent = await prisma.practiceArea.findUniqueOrThrow({
      where: { id: leaf.parent_id! },
    });
    const view = await settings.setNewCaseAlerts(otherPractice, {
      useProfile: false,
      practiceAreaIds: [parent.id],
    });
    expect(view).toMatchObject({
      useProfile: false,
      practiceAreaIds: [parent.id],
      profilePracticeAreaIds: [other.id],
    });
    await settings.setNewCaseAlerts(match, {
      useProfile: false,
      practiceAreaIds: [other.id],
    });
    await expect(
      settings.setNewCaseAlerts(match, {
        useProfile: false,
        practiceAreaIds: [],
      }),
    ).rejects.toMatchObject({ status: 400 });
    expect(await alerts.attorneysForCase(c.id)).toBe(1);
    expect(await notifs(otherPractice, 'new_case')).toBe(1);
    expect(await notifs(match, 'new_case')).toBe(1); // not a second one
    // Back to "as in my profile": the list is kept for later.
    const back = await settings.setNewCaseAlerts(match, { useProfile: true });
    expect(back).toMatchObject({
      useProfile: true,
      practiceAreaIds: [other.id],
    });
    await expect(settings.newCaseAlerts(client.id)).rejects.toMatchObject({
      status: 403,
    });
  });

  // Algo audit 2026-10-27 (CASES C-1 / M-2).
  it('a changed practice alerts the new audience again, under a new generation key', async () => {
    const leaf = await prisma.practiceArea.findUniqueOrThrow({
      where: {
        code: 'civil_litigation.arbitration_and_mediation_representation',
      },
    });
    const family = await prisma.practiceArea.findUniqueOrThrow({
      where: { code: 'family_law' },
    });
    const familyLeaf = await prisma.practiceArea.upsert({
      where: { code: 'family_law.e2e_divorce' },
      create: {
        code: 'family_law.e2e_divorce',
        name_en: 'E2E divorce',
        // Built from parts: a literal `practice.…` string here reads as an
        // API key to the secret scanner (gitleaks generic-api-key).
        i18n_key: ['practice', 'family_law', 'e2e_divorce'].join('.'),
        sort: 1,
        parent_id: family.id,
      },
      update: {},
    });
    const client = await prisma.user.create({ data: { role: 'client' } });
    async function attorney(practiceId: string) {
      const u = await prisma.user.create({ data: { role: 'attorney' } });
      const username = `rg_${u.id.slice(0, 8)}`;
      await prisma.attorneyProfile.create({
        data: {
          user_id: u.id,
          username,
          username_lower: username,
          languages: ['en'],
          verification_status: 'verified',
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
      await prisma.attorneyPracticeArea.create({
        data: { attorney_id: u.id, practice_area_id: practiceId },
      });
      return u.id;
    }
    const arbitration = await attorney(leaf.id);
    const familyLawyer = await attorney(familyLeaf.id);
    const c = await prisma.case.create({
      data: {
        client_id: client.id,
        title: 'Picked the wrong topic at first',
        description: 'A dispute that is really about a divorce settlement',
        practice_area_id: leaf.id,
        primary_state_code: 'NJ',
        budget_mode: 'clarify_later',
      },
    });
    await prisma.caseState.create({
      data: { case_id: c.id, state_code: 'NJ', is_primary: true },
    });
    // Other arbitration lawyers of earlier tests are alerted too (C-2).
    expect(await alerts.attorneysForCase(c.id)).toBeGreaterThanOrEqual(1);
    expect(await notifs(arbitration, 'new_case')).toBe(1);
    expect(await notifs(familyLawyer, 'new_case')).toBe(0);
    // Same generation again: nothing new (dedupe key per case).
    expect(await alerts.attorneysForCase(c.id)).toBe(0);

    // The client corrects the practice → cases.alert_generation = 1 and
    // the fan-out runs again after the response. Called as a request would:
    // inside the case's shard context (two-database mode routes the
    // transaction by it; the HTTP layer sets it from `cases/:id`).
    await shardContext.runForCase(c.id, () =>
      app.get(CasesService).update(
        {
          sub: client.id,
          role: 'client',
          sid: randomUUID(),
          verified: false,
          subscriptionStatus: 'none',
        },
        c.id,
        { practiceAreaId: familyLeaf.id },
      ),
    );
    expect(
      (await prisma.case.findUniqueOrThrow({ where: { id: c.id } }))
        .alert_generation,
    ).toBe(1);
    expect(await waitForNotifs(familyLawyer, 'new_case', 1)).toBe(1);
    const row = await prisma.notification.findFirstOrThrow({
      where: { user_id: familyLawyer, type: 'new_case' },
      select: { dedupe_key: true },
    });
    expect(row.dedupe_key).toBe(CaseFanoutService.key(c.id, 1));
    // The arbitration lawyer keeps the old row; the case is not his now.
    expect(await notifs(arbitration, 'new_case')).toBe(1);
  });

  // Algo audit 2026-10-27 (CASES H-1).
  it('with Redis the legacy wave is a queue job: nothing sent in the call, the worker delivers', async () => {
    await setConfig('case_fanout.queue_mode', null); // default: auto
    try {
      const leaf = await prisma.practiceArea.findUniqueOrThrow({
        where: {
          code: 'civil_litigation.arbitration_and_mediation_representation',
        },
      });
      const client = await prisma.user.create({ data: { role: 'client' } });
      const u = await prisma.user.create({ data: { role: 'attorney' } });
      const username = `qa_${u.id.slice(0, 8)}`;
      await prisma.attorneyProfile.create({
        data: {
          user_id: u.id,
          username,
          username_lower: username,
          languages: ['en'],
          verification_status: 'verified',
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
      await prisma.attorneyPracticeArea.create({
        data: { attorney_id: u.id, practice_area_id: leaf.id },
      });
      const c = await prisma.case.create({
        data: {
          client_id: client.id,
          title: 'Queued, not inline',
          description: 'The wave is a job with retries now',
          practice_area_id: leaf.id,
          primary_state_code: 'NJ',
          budget_mode: 'clarify_later',
        },
      });
      await prisma.caseState.create({
        data: { case_id: c.id, state_code: 'NJ', is_primary: true },
      });
      expect(await alerts.attorneysForCase(c.id)).toBe(0);
      expect(await waitForNotifs(u.id, 'new_case', 1)).toBe(1);
    } finally {
      await setConfig('case_fanout.queue_mode', 'off');
    }
  });
});
