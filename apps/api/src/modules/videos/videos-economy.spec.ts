import { ServiceUnavailableException } from '@nestjs/common';
import { ErrorCode } from '../../common/errors/error-code.enum';
import { VideosService } from './videos.service';

function setup(limited: boolean) {
  const costGuard = { consume: jest.fn() };
  const bunny = { keys: jest.fn().mockResolvedValue({}) };
  const service = new VideosService(
    {} as never,
    bunny as never,
    { isEnabled: jest.fn().mockResolvedValue(true) } as never,
    { number: jest.fn().mockResolvedValue(60) } as never,
    { consume: jest.fn() } as never,
    costGuard as never,
    undefined,
    { isEconomyLimited: jest.fn().mockResolvedValue(limited) } as never,
  );
  return { service, costGuard };
}

describe('VideosService.createUpload under the economy guard', () => {
  it('refuses a new upload with a clear message and spends nothing', async () => {
    const { service, costGuard } = setup(true);
    const err = await service
      .createUpload('u1', { durationSec: 10, sizeBytes: 1000 })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ServiceUnavailableException);
    expect((err as ServiceUnavailableException).getResponse()).toMatchObject({
      code: ErrorCode.VIDEO_UNAVAILABLE,
      message: expect.stringContaining('paused'),
    });
    expect(costGuard.consume).not.toHaveBeenCalled();
  });
});

describe('VideosService.createUpload under the Bunny hard stop (cost registry V7)', () => {
  it('pauses new uploads while the hard stop is on and spends nothing', async () => {
    const costGuard = { consume: jest.fn() };
    const hardStop = { stopped: jest.fn().mockResolvedValue(true) };
    const service = new VideosService(
      {} as never,
      { keys: jest.fn().mockResolvedValue({}) } as never,
      { isEnabled: jest.fn().mockResolvedValue(true) } as never,
      { number: jest.fn().mockResolvedValue(60) } as never,
      { consume: jest.fn() } as never,
      costGuard as never,
      undefined,
      { isEconomyLimited: jest.fn().mockResolvedValue(false) } as never,
      undefined,
      hardStop as never,
    );
    const err = await service
      .createUpload('u1', { durationSec: 10, sizeBytes: 1000 })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ServiceUnavailableException);
    expect(hardStop.stopped).toHaveBeenCalledWith('bunny');
    expect(costGuard.consume).not.toHaveBeenCalled();
  });
});
