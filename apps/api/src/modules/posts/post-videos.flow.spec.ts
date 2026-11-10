import type { Post, VideoAsset } from '@prisma/client';
import { mapBunnyStatus, VideosService } from '../videos/videos.service';
import { BunnyStreamClient } from '../videos/bunny-stream.client';
import { PostVideosService } from './post-videos.service';

/**
 * Prod 2026-11-09 (post 01a1c15a…): a video post stayed `processing`
 * forever. A fake Bunny answers with Bunny's real video status codes
 * (GET /library/{id}/videos/{guid}: 0 created, 1 uploaded, 2 processing,
 * 3 transcoding, 4 finished, 5 error, 6 upload failed, 7 JIT segmenting,
 * 8 JIT playlists created) and `availableResolutions` (the renditions that
 * already play).
 */

const MIN = 60_000;

function world() {
  const assets = new Map<string, VideoAsset>();
  const posts = new Map<string, Post>();
  const match = (
    row: Record<string, unknown>,
    where: Record<string, unknown>,
  ) =>
    Object.entries(where).every(([k, v]) => {
      if (k === 'OR') return true;
      if (v && typeof v === 'object' && !(v instanceof Date)) {
        const o = v as { in?: unknown[]; lt?: Date };
        if (o.in) return o.in.includes(row[k]);
        if (o.lt) return (row[k] as Date) < o.lt;
        return true;
      }
      return row[k] === v;
    });
  const prisma = {
    appConfig: { findMany: jest.fn(() => Promise.resolve([])) },
    videoAsset: {
      findUnique: ({
        where,
      }: {
        where: { id?: string; external_id?: string };
      }) =>
        Promise.resolve(
          [...assets.values()].find(
            (a) => a.id === where.id || a.external_id === where.external_id,
          ) ?? null,
        ),
      findMany: ({ where }: { where: Record<string, unknown> }) => {
        const rows = [...assets.values()].filter((a) => {
          const hasPost = [...posts.values()].some(
            (p) => p.video_asset_id === a.id,
          );
          if (where.OR) {
            const ok = (where.OR as Record<string, unknown>[]).some((c) =>
              c.post ? c.status === a.status && hasPost : c.status === a.status,
            );
            if (!ok) return false;
          }
          if ('post' in where && where.post === null && hasPost) return false;
          const rest = Object.fromEntries(
            Object.entries(where).filter(
              ([k]) => !['post', 'story', 'channel_post'].includes(k),
            ),
          );
          return match(a, rest);
        });
        return Promise.resolve(rows);
      },
      update: ({ where, data }: { where: { id: string }; data: object }) => {
        const next = { ...assets.get(where.id)!, ...data };
        assets.set(where.id, next);
        return Promise.resolve(next);
      },
      updateMany: ({
        where,
        data,
      }: {
        where: Record<string, unknown>;
        data: object;
      }) => {
        let count = 0;
        for (const a of assets.values()) {
          if (match(a, where)) {
            assets.set(a.id, { ...a, ...data });
            count++;
          }
        }
        return Promise.resolve({ count });
      },
    },
    post: {
      findFirst: ({ where }: { where: Record<string, unknown> }) =>
        Promise.resolve(
          [...posts.values()].find((p) => match(p as never, where)) ?? null,
        ),
      findMany: ({ where }: { where: Record<string, unknown> }) => {
        const { video_asset: va, ...rest } = where as {
          video_asset?: { status: string };
        };
        return Promise.resolve(
          [...posts.values()].filter(
            (p) =>
              match(p as never, rest) &&
              (!va || assets.get(p.video_asset_id ?? '')?.status === va.status),
          ),
        );
      },
      updateMany: ({
        where,
        data,
      }: {
        where: Record<string, unknown>;
        data: object;
      }) => {
        let count = 0;
        for (const p of posts.values()) {
          if (match(p, where)) {
            posts.set(p.id, { ...p, ...data });
            count++;
          }
        }
        return Promise.resolve({ count });
      },
    },
  };
  const answer: { status: number; availableResolutions: string | null } = {
    status: 1,
    availableResolutions: null,
  };
  const bunny = {
    keys: () => Promise.resolve(null),
    answer,
    getVideo: jest.fn((guid: string): Promise<Record<string, unknown>> =>
      Promise.resolve({
        guid,
        length: 40,
        width: 1080,
        height: 1920,
        storageSize: 5_000_000,
        ...bunny.answer,
      }),
    ),
  };
  const settings = {
    number: (key: string) =>
      Promise.resolve(
        (
          {
            'video.reel_max_duration_sec': 60,
            'video.post_max_duration_sec': 600,
            'video.max_source_duration_sec': 600,
            'video.max_size_mb': 500,
          } as Record<string, number>
        )[key],
      ),
    storedNumber: () => Promise.resolve(null),
  };
  const videos = new VideosService(
    prisma as never,
    bunny as never,
    {} as never,
    settings as never,
    {} as never,
    {} as never,
  );
  const afterPublish = jest.fn(() => Promise.resolve());
  const notifyVideoFailed = jest.fn(() => Promise.resolve());
  const postVideos = new PostVideosService(prisma as never, videos, {
    afterPublish,
    notifyVideoFailed,
  } as never);
  const created = new Date(Date.now() - 5 * MIN);
  assets.set('a1', {
    id: 'a1',
    owner_user_id: 'u1',
    external_id: 'guid-1',
    status: 'awaiting_upload',
    created_at: created,
    upload_expires_at: new Date(Date.now() + 55 * MIN),
    duration_sec: 40,
    trim_end_ms: null,
    trim_start_ms: null,
  } as unknown as VideoAsset);
  posts.set('p1', {
    id: 'p1',
    author_id: 'u1',
    status: 'processing',
    video_asset_id: 'a1',
    deleted_at: null,
  } as unknown as Post);
  return {
    videos,
    postVideos,
    bunny,
    assets,
    posts,
    afterPublish,
    notifyVideoFailed,
  };
}

describe('mapBunnyStatus (Bunny video status codes)', () => {
  it.each([
    [0, null, 'awaiting_upload'],
    [1, null, 'processing'],
    [2, null, 'processing'],
    [3, null, 'processing'],
    [3, '360p', 'ready'],
    [3, '360p,720p', 'ready'],
    [4, null, 'ready'],
    [4, '360p,720p,1080p', 'ready'],
    [5, null, 'failed'],
    [6, null, 'failed'],
    [7, null, 'processing'],
    [8, '720p', 'ready'],
  ])('status %i, renditions %p → %s', (status, res, want) => {
    expect(mapBunnyStatus({ status, availableResolutions: res })).toBe(want);
  });
});

describe('a video post goes live when Bunny can play it', () => {
  it('first rendition encoded (status 3 + availableResolutions) → the sweep publishes', async () => {
    const w = world();
    w.bunny.answer = { status: 3, availableResolutions: '360p,720p' };
    await w.postVideos.sweep();
    expect(w.posts.get('p1')!.status).toBe('published');
    expect(w.afterPublish).toHaveBeenCalledTimes(1);
  });

  it('the composer poll (GET /videos/:id) that sees "finished" publishes the post too', async () => {
    const w = world();
    w.bunny.answer = { status: 4, availableResolutions: '720p' };
    // GET /videos/:id → getOwn → refresh (the composer's own poll).
    await w.videos.refresh(w.assets.get('a1')!);
    expect(w.assets.get('a1')!.status).toBe('ready');
    expect(w.posts.get('p1')!.status).toBe('published');
    expect(w.afterPublish).toHaveBeenCalledTimes(1);
  });

  it('a post left `processing` next to a ready video is healed by the next sweep', async () => {
    const w = world();
    w.assets.set('a1', { ...w.assets.get('a1')!, status: 'ready' });
    await w.postVideos.sweep();
    expect(w.posts.get('p1')!.status).toBe('published');
    expect(w.afterPublish).toHaveBeenCalledTimes(1);
  });

  it('two paths seeing "finished" at once publish exactly once', async () => {
    const w = world();
    w.bunny.answer = { status: 4, availableResolutions: '720p' };
    const a = w.assets.get('a1')!;
    await Promise.all([w.videos.refresh(a), w.postVideos.sweep()]);
    expect(w.posts.get('p1')!.status).toBe('published');
    expect(w.afterPublish).toHaveBeenCalledTimes(1);
  });

  it.each([
    [5, 5_000_000, 'failed', 'encoding_failed'],
    [4, 2_000_000_000, 'rejected', 'too_large'],
  ])(
    'Bunny status %i (%i bytes) → video %s (%s): the author is told once, the post never goes live',
    async (status, storageSize, want, reason) => {
      const w = world();
      w.bunny.getVideo.mockResolvedValue({
        guid: 'guid-1',
        status,
        length: 40,
        width: 1080,
        height: 1920,
        storageSize,
        availableResolutions: '720p',
      });
      await w.postVideos.sweep();
      await w.postVideos.sweep();
      expect(w.assets.get('a1')).toMatchObject({
        status: want,
        failure_reason: reason,
      });
      expect(w.posts.get('p1')!.status).toBe('processing');
      expect(w.notifyVideoFailed).toHaveBeenCalledTimes(1);
      expect(w.afterPublish).not.toHaveBeenCalled();
    },
  );

  it('still encoding (status 2) → stays processing and keeps being polled', async () => {
    const w = world();
    w.bunny.answer = { status: 2, availableResolutions: null };
    const s1 = await w.postVideos.sweep();
    const s2 = await w.postVideos.sweep();
    expect(s1.polled).toBe(1);
    expect(s2.polled).toBe(1);
    expect(w.posts.get('p1')!.status).toBe('processing');
  });
});

describe('the library webhook points at us (Bunny Core API)', () => {
  const keys = {
    libraryId: '42',
    cdnHostname: 'vz.b-cdn.net',
    apiKey: 'lib-key',
    tokenAuthKey: 't',
    webhookToken: 'tok',
  };
  function client(withAccount: boolean) {
    const c = new BunnyStreamClient({} as never);
    jest
      .spyOn(c, 'keys')
      .mockResolvedValue(
        withAccount ? { ...keys, accountApiKey: 'acct-key' } : keys,
      );
    return c;
  }
  const url = 'https://api.lawbid.dev/api/v1/webhooks/bunny/tok';

  it('sets WebhookUrl when the library has another one', async () => {
    const calls: { method: string; body?: string; key: string }[] = [];
    const fetchFn = jest.fn((u: string, init: RequestInit) => {
      expect(u).toBe('https://api.bunny.net/videolibrary/42');
      calls.push({
        method: init.method ?? 'GET',
        body: init.body as string | undefined,
        key: (init.headers as Record<string, string>).AccessKey,
      });
      return Promise.resolve(
        new Response(JSON.stringify({ WebhookUrl: null }), { status: 200 }),
      );
    });
    await expect(
      client(true).ensureWebhook(url, fetchFn as never),
    ).resolves.toBe('set');
    expect(calls).toEqual([
      { method: 'GET', body: undefined, key: 'acct-key' },
      {
        method: 'POST',
        body: JSON.stringify({ WebhookUrl: url }),
        key: 'acct-key',
      },
    ]);
  });

  it('leaves an already correct URL alone', async () => {
    const fetchFn = jest.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify({ WebhookUrl: url }), { status: 200 }),
      ),
    );
    await expect(
      client(true).ensureWebhook(url, fetchFn as never),
    ).resolves.toBe('ok');
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('without the account key says so and calls nobody', async () => {
    const fetchFn = jest.fn();
    await expect(
      client(false).ensureWebhook(url, fetchFn as never),
    ).resolves.toBe('no_account_key');
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('only production registers (staging never takes the live webhook)', () => {
    const c = new BunnyStreamClient({} as never);
    const env = process.env.NODE_ENV;
    process.env.NODE_ENV = 'staging';
    expect(c.ownWebhookUrl('tok')).toBeNull();
    process.env.NODE_ENV = 'production';
    expect(c.ownWebhookUrl('tok')).toBe(url);
    process.env.NODE_ENV = env;
  });
});
