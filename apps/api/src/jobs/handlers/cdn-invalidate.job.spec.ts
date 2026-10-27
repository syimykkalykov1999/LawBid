import type { ConfigService } from '@nestjs/config';
import type Redis from 'ioredis';
import type { PinoLogger } from 'nestjs-pino';
import type { AppSettingsService } from '../../common/app-settings/app-settings.service';
import { CdnInvalidateJob } from './cdn-invalidate.job';

const logger = {
  setContext: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
} as unknown as PinoLogger;

function make(
  env: Record<string, string | undefined>,
  enabled = true,
  send = jest.fn(() => Promise.resolve()),
) {
  const sets = new Map<string, Set<string>>([
    ['cdn:inval:pending:media', new Set(['/a/f1*', '/a/f2*'])],
  ]);
  const redis = {
    set: jest.fn(() => Promise.resolve('OK')),
    eval: jest.fn(() => Promise.resolve(1)),
    get: jest.fn(() => Promise.resolve(null)),
    incrby: jest.fn(() => Promise.resolve(2)),
    expire: jest.fn(() => Promise.resolve(1)),
    sadd: jest.fn(() => Promise.resolve(1)),
    spop: jest.fn((k: string, n: number) => {
      const s = sets.get(k) ?? new Set<string>();
      const out = [...s].slice(0, n);
      out.forEach((x) => s.delete(x));
      return Promise.resolve(out);
    }),
  } as unknown as Redis;
  const settings = {
    string: jest.fn(() => Promise.resolve(enabled ? 'auto' : 'off')),
    number: jest.fn((k: string) =>
      Promise.resolve(k === 'cdn.invalidate_batch_paths' ? 500 : 5000),
    ),
  } as unknown as AppSettingsService;
  const config = { get: (k: string) => env[k] } as unknown as ConfigService;
  return {
    job: new CdnInvalidateJob(config, redis, logger, settings, send),
    send,
  };
}

describe('CdnInvalidateJob', () => {
  it('sends the queued paths of a configured distribution', async () => {
    const { job, send } = make({
      CLOUDFRONT_MEDIA_DISTRIBUTION_ID: 'EMEDIA12345',
    });
    const res = await job.run();
    expect(send).toHaveBeenCalledWith({
      distributionId: 'EMEDIA12345',
      paths: ['/a/f1*', '/a/f2*'],
    });
    expect(res).toMatchObject({ requests: 1, paths: 2 });
  });

  it('is a no-op without a distribution id', async () => {
    const { job, send } = make({});
    expect(await job.run()).toBeNull();
    expect(send).not.toHaveBeenCalled();
  });

  it('is a no-op when the admin switch is off', async () => {
    const { job, send } = make(
      { CLOUDFRONT_MEDIA_DISTRIBUTION_ID: 'EMEDIA12345' },
      false,
    );
    expect(await job.run()).toBeNull();
    expect(send).not.toHaveBeenCalled();
  });
});
