import type { VideoAsset } from '@prisma/client';
import {
  VideosService,
  mp4FallbackFile,
  pickMp4Fallback,
} from './videos.service';

const MB = 1024 * 1024;

const stored: Record<string, number> = {};
const updatedAt: { rows: { key: string; updated_at: Date }[] } = { rows: [] };

function setup(video: Record<string, unknown> | null) {
  const prisma = {
    appConfig: {
      findMany: jest.fn(() => Promise.resolve(updatedAt.rows)),
    },
    videoAsset: {
      // refresh stores a change only from the status it read (updateMany),
      // then reads the row back.
      updateMany: jest.fn((args: { data: object }) => {
        last = { id: 'a1', ...args.data };
        return Promise.resolve({ count: 1 });
      }),
      findUnique: jest.fn(() => Promise.resolve(last)),
    },
  };
  let last: object | null = null;
  const bunny = { getVideo: jest.fn().mockResolvedValue(video) };
  const settings = {
    number: jest.fn((key: string) =>
      Promise.resolve(
        (
          {
            'video.max_duration_sec': 60,
            'video.reel_max_duration_sec': 60,
            'video.post_max_duration_sec': 600,
            'video.max_size_mb': 100,
          } as Record<string, number>
        )[key],
      ),
    ),
    storedNumber: jest.fn((key: string) =>
      Promise.resolve(stored[key] ?? null),
    ),
  };
  const service = new VideosService(
    prisma as never,
    bunny as never,
    {} as never,
    settings as never,
    {} as never,
    {} as never,
  );
  return { service, prisma };
}

const asset = {
  id: 'a1',
  external_id: 'guid',
  status: 'processing',
} as VideoAsset;

describe('VideosService.refresh', () => {
  it('rejects a video Bunny stores at more than 3x the size cap', async () => {
    const s = setup({ status: 4, length: 30, storageSize: 301 * MB });
    const next = await s.service.refresh(asset);
    expect(next).toMatchObject({
      status: 'rejected',
      failure_reason: 'too_large',
    });
  });

  it('marks a video within the cap ready', async () => {
    const s = setup({ status: 4, length: 30, storageSize: 250 * MB });
    const next = await s.service.refresh(asset);
    expect(next).toMatchObject({ status: 'ready', duration_sec: 30 });
  });
});

describe('VideosService limits', () => {
  beforeEach(() => {
    for (const k of Object.keys(stored)) delete stored[k];
  });

  it('reel limit: the new key wins, else the old single key, else the default', async () => {
    const { service } = setup({});
    expect(await service.reelMaxSec()).toBe(60);
    stored['video.max_duration_sec'] = 100;
    expect(await service.reelMaxSec()).toBe(100);
    stored['video.reel_max_duration_sec'] = 120;
    expect(await service.reelMaxSec()).toBe(120);
  });

  it('both keys saved: the one the admin changed last wins (feature reality 2026-11-08)', async () => {
    const { service } = setup({});
    stored['video.reel_max_duration_sec'] = 120;
    stored['video.max_duration_sec'] = 90;
    updatedAt.rows = [
      {
        key: 'video.reel_max_duration_sec',
        updated_at: new Date('2026-11-01'),
      },
      { key: 'video.max_duration_sec', updated_at: new Date('2026-11-08') },
    ];
    expect(await service.reelMaxSec()).toBe(90);
    updatedAt.rows = [
      {
        key: 'video.reel_max_duration_sec',
        updated_at: new Date('2026-11-09'),
      },
      { key: 'video.max_duration_sec', updated_at: new Date('2026-11-08') },
    ];
    expect(await service.reelMaxSec()).toBe(120);
    updatedAt.rows = [];
  });

  it('post limit is never below the reel limit', async () => {
    const { service } = setup({});
    expect(await service.postMaxSec(60)).toBe(600);
    expect(await service.postMaxSec(900)).toBe(900);
  });

  it('a video longer than a reel is rejected at refresh unless it is a post within its limit', async () => {
    const s = setup({ status: 4, length: 300, storageSize: 10 * MB });
    const reelLike = await s.service.refresh({
      ...asset,
      duration_sec: 50,
    });
    expect(reelLike).toMatchObject({
      status: 'rejected',
      failure_reason: 'too_long',
    });
    const s2 = setup({ status: 4, length: 300, storageSize: 10 * MB });
    const post = await s2.service.refresh({
      ...asset,
      duration_sec: 300,
    });
    expect(post).toMatchObject({ status: 'ready' });
  });
});

/** Media batch A (R11, audit 13.11): play_720p.mp4 was hard-coded. */
describe('MP4 fallback from the renditions Bunny stored', () => {
  it('picks the tallest up to 720p, else the shortest, else none', () => {
    expect(pickMp4Fallback(['240p', '360p', '720p'])).toBe('720p');
    expect(pickMp4Fallback(['360p', '480p'])).toBe('480p');
    expect(pickMp4Fallback(['1080p', '720p'])).toBe('720p');
    expect(pickMp4Fallback(['1080p'])).toBe('1080p');
    expect(pickMp4Fallback([])).toBe('');
    expect(pickMp4Fallback(['original', ' 360p '])).toBe('360p');
  });

  it('file name: stored rendition, none, or the legacy 720p for unchecked rows', () => {
    expect(mp4FallbackFile({ mp4_fallback: '480p' })).toBe('play_480p.mp4');
    expect(mp4FallbackFile({ mp4_fallback: '' })).toBeNull();
    expect(mp4FallbackFile({ mp4_fallback: null })).toBe('play_720p.mp4');
    expect(mp4FallbackFile({ mp4_fallback: '../x' })).toBeNull();
  });

  it('a video turning ready stores what Bunny has', async () => {
    const s = setup({ status: 4, length: 30, storageSize: 10 * MB });
    const bunny = (s.service as unknown as { bunny: Record<string, unknown> })
      .bunny;
    bunny.getMp4Resolutions = jest.fn().mockResolvedValue(['360p']);
    const next = await s.service.refresh(asset);
    expect(next).toMatchObject({ status: 'ready', mp4_fallback: '360p' });
    expect(s.prisma.videoAsset.updateMany).toHaveBeenLastCalledWith({
      where: { id: 'a1' },
      data: { mp4_fallback: '360p' },
    });
  });

  it('a failed Bunny look keeps the video ready and unchanged', async () => {
    const s = setup({ status: 4, length: 30, storageSize: 10 * MB });
    const bunny = (s.service as unknown as { bunny: Record<string, unknown> })
      .bunny;
    bunny.getMp4Resolutions = jest.fn().mockRejectedValue(new Error('500'));
    const next = await s.service.refresh(asset);
    expect(next).toMatchObject({ status: 'ready' });
    expect(next.mp4_fallback).toBeUndefined();
  });
});

/** Media batch A (R10): the TUS signature lived 60 min with no way to renew. */
describe('VideosService.renewUpload', () => {
  const open = {
    id: 'a1',
    owner_user_id: 'u1',
    library_id: '42',
    external_id: 'guid',
    status: 'awaiting_upload',
    duration_sec: 30,
    upload_expires_at: new Date(Date.now() + 60_000),
  };

  function renewSetup(row: Record<string, unknown> | null) {
    const prisma = {
      videoAsset: {
        findFirst: jest.fn().mockResolvedValue(row),
        updateMany: jest.fn().mockResolvedValue({ count: row ? 1 : 0 }),
      },
      appConfig: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const bunny = {
      keys: jest.fn().mockResolvedValue({ libraryId: '42', apiKey: 'k' }),
      tusEndpoint: () => 'https://video.bunnycdn.com/tusupload',
    };
    const settings = {
      number: jest.fn((key: string) =>
        Promise.resolve(
          (
            {
              'video.upload_ttl_min': 60,
              'video.reel_max_duration_sec': 180,
              'video.max_duration_sec': 180,
              'video.post_max_duration_sec': 3600,
            } as Record<string, number>
          )[key],
        ),
      ),
      storedNumber: jest.fn().mockResolvedValue(null),
    };
    const flags = { isEnabled: jest.fn().mockResolvedValue(true) };
    const service = new VideosService(
      prisma as never,
      bunny as never,
      flags as never,
      settings as never,
      {} as never,
      {} as never,
    );
    return { service, prisma };
  }

  it('signs the same video again and moves the upload deadline', async () => {
    const { service, prisma } = renewSetup(open);
    const before = Math.floor(Date.now() / 1000);
    const out = await service.renewUpload('u1', 'a1');
    expect(out).toMatchObject({
      videoAssetId: 'a1',
      videoId: 'guid',
      libraryId: '42',
      maxDurationSec: 180,
    });
    expect(out.authorizationExpire).toBeGreaterThanOrEqual(before + 3600);
    expect(out.authorizationSignature).toMatch(/^[0-9a-f]{64}$/);
    const call = prisma.videoAsset.updateMany.mock.calls[0][0] as {
      where: object;
      data: { upload_expires_at: Date };
    };
    expect(call.where).toEqual({ id: 'a1', status: 'awaiting_upload' });
    expect(call.data.upload_expires_at.getTime()).toBe(
      out.authorizationExpire * 1000,
    );
  });

  it('refuses an upload that already finished or failed', async () => {
    const { service } = renewSetup({ ...open, status: 'processing' });
    await expect(service.renewUpload('u1', 'a1')).rejects.toMatchObject({
      response: { code: 'VIDEO_NOT_READY' },
    });
  });

  it('someone else’s video is not found', async () => {
    const { service } = renewSetup(null);
    await expect(service.renewUpload('u2', 'a1')).rejects.toMatchObject({
      response: { code: 'NOT_FOUND' },
    });
  });
});
