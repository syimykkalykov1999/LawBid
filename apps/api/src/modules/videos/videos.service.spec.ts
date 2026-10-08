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

describe('VideosService.createUpload (owner 2026-10-08: gallery cover)', () => {
  function uploadSetup() {
    const create = jest.fn((args: { data: Record<string, unknown> }) =>
      Promise.resolve({ id: 'a1', ...args.data }),
    );
    const prisma = { videoAsset: { count: jest.fn(() => 0), create } };
    const bunny = {
      keys: jest.fn().mockResolvedValue({ libraryId: 'lib', apiKey: 'k' }),
      createVideo: jest.fn().mockResolvedValue('guid'),
      tusEndpoint: jest.fn(() => 'https://tus.test'),
    };
    const numbers: Record<string, number> = {
      'video.max_duration_sec': 90,
      'video.max_source_duration_sec': 90,
      'video.max_size_mb': 500,
      'video.max_pending_per_user': 3,
      'video.upload_ttl_min': 60,
    };
    const settings = {
      number: jest.fn((key: string) => Promise.resolve(numbers[key])),
    };
    const service = new VideosService(
      prisma as never,
      bunny as never,
      { isEnabled: jest.fn().mockResolvedValue(true) } as never,
      settings as never,
      { consume: jest.fn() } as never,
      { consume: jest.fn() } as never,
    );
    return { service, create };
  }

  it('stores the cover photo next to the cover frame', async () => {
    const s = uploadSetup();
    await s.service.createUpload('u1', {
      sizeBytes: 1000,
      durationSec: 30,
      coverTimeMs: 4000,
      coverFileId: '7d3c1d6e-58a4-4d43-b1a5-9f0a3c2b7e11',
    });
    expect(s.create.mock.calls[0][0].data).toMatchObject({
      cover_time_ms: 4000,
      cover_file_id: '7d3c1d6e-58a4-4d43-b1a5-9f0a3c2b7e11',
    });
  });

  it('keeps the frame cover when no photo is picked', async () => {
    const s = uploadSetup();
    await s.service.createUpload('u1', { sizeBytes: 1000, durationSec: 30 });
    expect(s.create.mock.calls[0][0].data).toMatchObject({
      cover_file_id: null,
    });
  });
});
