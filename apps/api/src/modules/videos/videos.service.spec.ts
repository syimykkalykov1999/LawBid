import type { VideoAsset } from '@prisma/client';
import { VideosService } from './videos.service';

const MB = 1024 * 1024;

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
        ({ 'video.max_duration_sec': 60, 'video.max_size_mb': 100 } as const)[
          key as 'video.max_duration_sec'
        ],
      ),
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
