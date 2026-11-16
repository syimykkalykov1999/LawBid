import * as Sentry from '@sentry/nestjs';
import type { INestApplicationContext } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { SENTRY_DATA_COLLECTION, startSentry } from './sentry';

jest.mock('@sentry/nestjs', () => ({
  ...jest.requireActual<typeof import('@sentry/nestjs')>('@sentry/nestjs'),
  init: jest.fn(),
}));

/**
 * Sentry 11 (MIGRATION.md «sendDefaultPii is replaced by dataCollection»):
 * an unset `dataCollection` now collects cookies, request/response bodies,
 * headers, the user, SQL query data and queue payloads. The API must keep
 * the v10 restrictive baseline explicitly.
 */
describe('startSentry data collection (Sentry 11)', () => {
  const app = { get: () => undefined } as unknown as INestApplicationContext;
  const config = {
    get: (k: string) =>
      k === 'SENTRY_DSN' ? 'https://k@o1.ingest.sentry.io/1' : 'test',
  } as unknown as ConfigService;

  beforeEach(() => (Sentry.init as jest.Mock).mockClear());

  it('passes the v10 baseline so nothing new is collected', async () => {
    await expect(startSentry(app, config, (e) => e)).resolves.toBe(true);
    const opts = (Sentry.init as jest.Mock).mock.calls[0][0] as Record<
      string,
      unknown
    >;
    expect(opts.dataCollection).toBeDefined();
    expect(opts.dataCollection).toBe(SENTRY_DATA_COLLECTION);
    expect(opts).not.toHaveProperty('sendDefaultPii');
    // v11 turned this on by default; v10 sent captureMessage without a stack.
    expect(opts.attachStacktrace).toBe(false);
  });

  it('the baseline turns off every category v11 enables by default', () => {
    const deny = ['forwarded', '-ip', 'remote-', 'via', '-user'];
    expect(SENTRY_DATA_COLLECTION).toEqual({
      userInfo: false,
      cookies: false,
      httpHeaders: { request: { deny }, response: { deny } },
      httpBodies: [],
      urlQueryParams: { deny },
      genAI: { inputs: false, outputs: false },
      databaseQueryData: false,
      queues: false,
      graphQL: { document: false, variables: false },
    });
  });
});
