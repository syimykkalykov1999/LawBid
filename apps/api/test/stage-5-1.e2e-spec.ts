import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { CounterAggregator } from '../src/modules/counters/counter-aggregator.service';
import { UsageLimitsService } from '../src/common/usage-limits/usage-limits.service';
import { RateLimitService } from '../src/modules/auth/services/rate-limit.service';
import { AppSettingsService } from '../src/common/app-settings/app-settings.service';

/**
 * docs/05 §16 stage 5.1 acceptance: counters flush to the DB and the
 * nightly reconcile fixes drift; limits answer RATE_LIMITED.
 */
jest.setTimeout(60_000);

describe('File 05 foundation (e2e, stage 5.1)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let counters: CounterAggregator;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
    counters = app.get(CounterAggregator);
  });

  afterAll(async () => {
    await app.close();
  });

  async function attorneyWithPost() {
    const u = await prisma.user.create({ data: { role: 'attorney' } });
    await prisma.attorneyProfile.create({
      data: {
        user_id: u.id,
        username: `att_${u.id.slice(0, 8)}`,
        username_lower: `att_${u.id.slice(0, 8)}`,
        languages: ['en'],
        verification_status: 'verified',
      },
    });
    const post = await prisma.post.create({
      data: {
        author_id: u.id,
        body: 'Know your rights at a traffic stop #dui',
      },
    });
    return { attorneyId: u.id, postId: post.id };
  }

  it('bumps land in the DB on flush; reads can overlay pending deltas', async () => {
    const { postId } = await attorneyWithPost();
    const likers = await Promise.all(
      [1, 2, 3].map(() => prisma.user.create({ data: { role: 'client' } })),
    );
    for (const l of likers) {
      await prisma.postLike.create({
        data: { post_id: postId, user_id: l.id },
      });
      await counters.bump('post', postId, 'like_count', 1);
    }
    expect(
      (await counters.pending('post', 'like_count', [postId])).get(postId),
    ).toBe(3);
    await counters.flush();
    const post = await prisma.post.findUniqueOrThrow({ where: { id: postId } });
    expect(post.like_count).toBe(3);
    expect(
      (await counters.pending('post', 'like_count', [postId])).get(postId),
    ).toBeUndefined();
  });

  it('the nightly reconcile recomputes touched rows from source tables', async () => {
    const { attorneyId, postId } = await attorneyWithPost();
    const fan = await prisma.user.create({ data: { role: 'client' } });
    await prisma.follow.create({
      data: { follower_id: fan.id, followee_id: attorneyId },
    });
    await counters.bump('attorney', attorneyId, 'followers_count', 1);
    await counters.bump('post', postId, 'like_count', 5); // drift: no like rows
    await counters.flush();
    expect(
      (await prisma.post.findUniqueOrThrow({ where: { id: postId } }))
        .like_count,
    ).toBe(5);
    await counters.reconcile();
    expect(
      (await prisma.post.findUniqueOrThrow({ where: { id: postId } }))
        .like_count,
    ).toBe(0);
    const profile = await prisma.attorneyProfile.findUniqueOrThrow({
      where: { user_id: attorneyId },
    });
    expect(profile.followers_count).toBe(1);
    expect(profile.posts_count).toBe(1);
  });

  it('limits answer 429 RATE_LIMITED past the app_config value', async () => {
    const settings = {
      number: jest.fn().mockResolvedValue(2),
    } as unknown as AppSettingsService;
    const limits = new UsageLimitsService(app.get(RateLimitService), settings);
    const user = randomUUID();
    await limits.consume('comment', user);
    await limits.consume('comment', user);
    await expect(limits.consume('comment', user)).rejects.toMatchObject({
      response: { code: 'RATE_LIMITED' },
      status: 429,
    });
    // Another action has its own budget.
    await expect(limits.consume('like', user)).resolves.toBeUndefined();
  });
});
