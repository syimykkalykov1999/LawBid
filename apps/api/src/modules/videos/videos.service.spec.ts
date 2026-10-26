import type { VideoAsset } from '@prisma/client';
import { VideosService } from './videos.service';

const MB = 1024 * 1024;

const stored: Record<string, number> = {};

function setup(video: Record<string, unknown> | null) {
  const prisma = {
    videoAsset: {
      update: jest.fn((args: { data: object }) =>
        Promise.resolve({ id: 'a1', ...args.data }),
      ),
    },
  };
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
