import type { ConfigService } from '@nestjs/config';
import type { PinoLogger } from 'nestjs-pino';
import type { Request } from 'express';
import type { PrismaService } from '../../prisma/prisma.service';
import type { S3StorageService } from '../files/storage/s3-storage.service';
import type { RequestUser } from '../auth/decorators/current-user.decorator';
import type { ReauthVerifier } from '../auth/services/reauth-verifier.service';
import { DataExportController } from './data-export.controller';
import { DataExportRunner } from './data-export.runner';
import type { DataExportService } from './data-export.service';

/** Detective R2B-12 (14.11): the ZIP link is the whole account, so it is
 * given out only with a fresh reauth token (or to an older app while the
 * admin's `security.export_reauth_min_app_version` says so). The status
 * itself stays readable, so the app can poll without one. */
const user = { sub: 'u1' } as RequestUser;

function readyRow() {
  return {
    id: 'e1',
    user_id: 'u1',
    type: 'user_data',
    status: 'ready',
    file: { s3_bucket: 'b', s3_key: 'k' },
    expires_at: new Date(Date.now() + 3_600_000),
    error: null,
    created_at: new Date(),
    updated_at: new Date(),
  };
}

function runnerWith(row: unknown) {
  const prisma = {
    dataExportJob: { findFirst: jest.fn(() => Promise.resolve(row)) },
  };
  const storage = {
    signedGetUrl: jest.fn(() => Promise.resolve('https://s3.test/signed')),
  };
  const runner = new DataExportRunner(
    { mode: 'api' },
    { get: () => undefined } as unknown as ConfigService,
    prisma as unknown as PrismaService,
    {} as DataExportService,
    storage as unknown as S3StorageService,
    { setContext: jest.fn(), error: jest.fn() } as unknown as PinoLogger,
  );
  return { runner, storage };
}

describe('DataExportRunner.status without the link (R2B-12)', () => {
  it('a ready export without reauth: status ready, no link, nothing signed', async () => {
    const { runner, storage } = runnerWith(readyRow());
    const out = await runner.status(user, 'e1', { withLink: false });
    expect(out.status).toBe('ready');
    expect(out.url).toBeNull();
    expect(out.expiresAt).not.toBeNull();
    expect(storage.signedGetUrl).not.toHaveBeenCalled();
  });

  it('with reauth the signed link is there', async () => {
    const { runner } = runnerWith(readyRow());
    const out = await runner.status(user, 'e1', { withLink: true });
    expect(out.url).toBe('https://s3.test/signed');
  });
});

describe('GET /users/me/data-export/:id (R2B-12)', () => {
  function controller(allowed: boolean) {
    const exports = {
      status: jest.fn(() => Promise.resolve({ exportId: 'e1' })),
    };
    const reauth = {
      validOrLegacyClient: jest.fn(() => Promise.resolve(allowed)),
    };
    const c = new DataExportController(
      exports as unknown as DataExportRunner,
      reauth as unknown as ReauthVerifier,
    );
    return { c, exports, reauth };
  }

  it.each([true, false])(
    'asks the reauth rule (setting security.export_reauth_min_app_version) and passes withLink=%s',
    async (allowed) => {
      const { c, exports, reauth } = controller(allowed);
      const req = {} as Request;
      await c.getDataExport(user, { exportId: 'e1' }, req);
      expect(reauth.validOrLegacyClient).toHaveBeenCalledWith(
        req,
        'security.export_reauth_min_app_version',
      );
      expect(exports.status).toHaveBeenCalledWith(user, 'e1', {
        withLink: allowed,
      });
    },
  );
});
