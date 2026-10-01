import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { SubscriptionAlertsService } from '../src/modules/notifications/subscription-alerts.service';
import { NotificationsApiService } from '../src/modules/notifications/notifications-api.service';
import { ensurePostPractices } from './support/post-practices';

/**
 * Owner 2026-09-30: opt-in alerts. Followers who turned "Following" on
 * get `followed_post`; attorneys who turned "New cases" on get `new_case`
 * for a case in their practice and licensed state. Nobody else does.
 */
jest.setTimeout(60_000);

describe('Opt-in follow / new-case alerts (e2e, owner 2026-09-30)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let alerts: SubscriptionAlertsService;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
    alerts = app.get(SubscriptionAlertsService);
    await ensurePostPractices(prisma);
    await prisma.state.upsert({
      where: { code: 'NJ' },
      create: { code: 'NJ', name: 'New Jersey' },
      update: {},
    });
  });

  afterAll(async () => {
    await app.close();
  });

  const notifs = (userId: string, type: 'followed_post' | 'new_case') =>
    prisma.notification.count({ where: { user_id: userId, type } });

  const optIn = (userId: string, category: 'following' | 'new_cases') =>
    prisma.notificationSetting.create({
      data: { user_id: userId, category, push_enabled: true },
    });

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
    async function attorney(practiceId: string, optedIn: boolean) {
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
      if (optedIn) await optIn(u.id, 'new_cases');
      return u.id;
    }
    const match = await attorney(leaf.id, true);
    const notOptedIn = await attorney(leaf.id, false);
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

    expect(await alerts.attorneysForCase(c.id)).toBe(1);
    expect(await notifs(match, 'new_case')).toBe(1);
    expect(await notifs(notOptedIn, 'new_case')).toBe(0);
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
});
