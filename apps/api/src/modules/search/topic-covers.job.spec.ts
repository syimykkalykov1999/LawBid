import { TOPIC_COVERS_KEY } from './search.provider';
import { coverUrlOf, TopicCoversJob } from './topic-covers.job';

/** Owner 2026-11-04 (R-406): a hashtag topic's cover is the picture of its
 * most popular post of 90 days — one nightly snapshot (tag → post id), and
 * a text-only topic has no cover (the app shows its letter tile). */
describe('TopicCoversJob', () => {
  function make(rows: { tag: string; id: string }[]) {
    const prisma = { $queryRaw: jest.fn().mockResolvedValue(rows) };
    const redis = { set: jest.fn().mockResolvedValue('OK') };
    const logger = { setContext: jest.fn(), info: jest.fn() };
    const job = new TopicCoversJob(
      prisma as never,
      redis as never,
      logger as never,
    );
    return { job, prisma, redis };
  }

  it('writes one small JSON: tag → the ranked post, with a long TTL', async () => {
    const { job, redis, prisma } = make([
      { tag: 'alimony', id: 'p-alimony' },
      { tag: 'greencard', id: 'p-green' },
    ]);
    const out = await job.run(new Date('2026-11-04T03:40:00Z'));
    expect(out).toEqual({ topics: 2 });
    expect(redis.set).toHaveBeenCalledTimes(1);
    const [key, json, ex, ttl] = redis.set.mock.calls[0] as [
      string,
      string,
      string,
      number,
    ];
    expect(key).toBe(TOPIC_COVERS_KEY);
    expect(JSON.parse(json)).toEqual({
      alimony: { postId: 'p-alimony' },
      greencard: { postId: 'p-green' },
    });
    expect(ex).toBe('EX');
    // Outlives several nightly runs.
    expect(ttl).toBeGreaterThanOrEqual(2 * 24 * 3600);
    // The 90-day window is a bound parameter of the one query.
    const since = (prisma.$queryRaw.mock.calls[0] as unknown[])
      .slice(1)
      .find((v) => v instanceof Date) as Date;
    expect(since.toISOString()).toBe('2026-08-06T03:40:00.000Z');
  });

  it('a run with no media posts leaves an empty snapshot (every topic falls back to text)', async () => {
    const { job, redis } = make([]);
    expect(await job.run()).toEqual({ topics: 0 });
    expect(JSON.parse((redis.set.mock.calls[0] as string[])[1])).toEqual({});
  });

  it('ranks by the decayed likes + comments + views and keeps only posts with a picture', async () => {
    const { job, prisma } = make([]);
    await job.run();
    const sql = (prisma.$queryRaw.mock.calls[0] as [TemplateStringsArray])[0]
      .join('?')
      .replace(/\s+/g, ' ');
    expect(sql).toContain(
      'p.like_count + 2 * p.comment_count + 0.1 * p.view_count',
    );
    expect(sql).toContain('power(');
    expect(sql).toContain("va.status = 'ready'");
    expect(sql).toContain(
      'EXISTS (SELECT 1 FROM post_media pm WHERE pm.post_id = p.id)',
    );
    expect(sql).toContain('DISTINCT ON (tag)');
    expect(sql).toContain("t.tag_lower NOT LIKE '~%'");
  });
});

describe('coverUrlOf', () => {
  const media = (previewUrl: string | null, url: string) => [
    { previewUrl, url },
  ];

  it("prefers the video's frame, then the first photo's small variant, then its full link", () => {
    expect(
      coverUrlOf({
        media: media('https://cdn/p_320.jpg', 'https://cdn/p.jpg'),
        video: { thumbnailUrl: 'https://cdn/v/thumb.jpg' },
      }),
    ).toBe('https://cdn/v/thumb.jpg');
    expect(
      coverUrlOf({
        media: media('https://cdn/p_320.jpg', 'https://cdn/p.jpg'),
        video: null,
      }),
    ).toBe('https://cdn/p_320.jpg');
    expect(
      coverUrlOf({
        media: media(null, 'https://cdn/p.jpg'),
        video: null,
      }),
    ).toBe('https://cdn/p.jpg');
  });

  it('a text-only post (or a post gone since the snapshot) has no cover', () => {
    expect(coverUrlOf({ media: [], video: null })).toBe(null);
    expect(
      coverUrlOf({
        media: [],
        video: { thumbnailUrl: null },
      }),
    ).toBe(null);
    expect(coverUrlOf(undefined)).toBe(null);
  });
});
