/* eslint-disable @typescript-eslint/unbound-method */
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import type { AppSettingsService } from '../../common/app-settings/app-settings.service';
import type { PrismaService } from '../../prisma/prisma.service';
import type { AuditLogService } from '../admin-access/audit-log.service';
import type { AdminActor } from '../admin-auth/admin-auth.decorators';
import type { AdminAuthService } from '../admin-auth/admin-auth.service';
import type { S3StorageService } from '../files/storage/s3-storage.service';
import { LEGAL_AUDIT, LegalExportService } from './legal-export.service';

const admin = {
  id: 'a0000000-0000-4000-8000-000000000001',
  sessionId: 's1',
  ip: '1.2.3.4',
  justification: 'court order 123',
} as unknown as AdminActor;
const REQ = 'r0000000-0000-4000-8000-000000000001';
const USER = 'u0000000-0000-4000-8000-000000000001';

function build(
  opts: { stepUp?: boolean; requestStatus?: string; waiting?: number } = {},
) {
  const tx = {
    legalExport: {
      create: jest.fn().mockResolvedValue(exportRow()),
      count: jest.fn().mockResolvedValue(opts.waiting ?? 0),
      findUnique: jest.fn(),
    },
    legalHold: {
      create: jest.fn().mockResolvedValue(holdRow()),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    dataAccessRequest: {
      findUnique: jest.fn().mockResolvedValue({
        id: REQ,
        status: opts.requestStatus ?? 'received',
      }),
      update: jest.fn(),
    },
    user: { findUnique: jest.fn().mockResolvedValue({ id: USER }) },
    $transaction: jest.fn(),
  };
  tx.$transaction.mockImplementation((fn: (t: typeof tx) => unknown) => fn(tx));
  const prisma = tx as unknown as PrismaService;
  const audit = { record: jest.fn() } as unknown as AuditLogService;
  const auth = {
    assertStepUp: jest.fn(() =>
      opts.stepUp === false
        ? Promise.reject(new ForbiddenException('step-up'))
        : Promise.resolve(),
    ),
  } as unknown as AdminAuthService;
  const storage = {
    signedGetUrl: jest.fn().mockResolvedValue('https://signed'),
  } as unknown as S3StorageService;
  const settings = { number: jest.fn() } as unknown as AppSettingsService;
  return {
    svc: new LegalExportService(prisma, audit, auth, storage, settings),
    prisma,
    audit,
    auth,
    tx,
    storage,
  };
}

function exportRow() {
  return {
    id: 'e1',
    request_id: REQ,
    subject_user_id: USER,
    requested_by: admin.id,
    status: 'queued',
    selection: { sections: ['chats'] },
    row_counts: null,
    size_bytes: null,
    sha256: null,
    error: null,
    created_at: new Date(),
    finished_at: null,
    expires_at: null,
  };
}
function holdRow() {
  return {
    id: 'h1',
    request_id: REQ,
    target_type: 'user',
    target_id: USER,
    created_by: admin.id,
    created_at: new Date(),
    expires_at: null,
    released_at: null,
  };
}

describe('LegalExportService', () => {
  it('queues an archive, audits it and moves the request to in_progress', async () => {
    const { svc, audit, tx } = build();
    const res = await svc.queue(admin, REQ, {
      userId: USER,
      sections: ['chats', 'chats'],
    });
    expect(res.status).toBe('queued');
    expect(
      tx.legalExport.create.mock.calls[0][0].data.selection.sections,
    ).toEqual(['chats']);
    expect(tx.dataAccessRequest.update).toHaveBeenCalled();
    expect((audit.record as jest.Mock).mock.calls[0][0].action).toBe(
      LEGAL_AUDIT.queue,
    );
    expect((audit.record as jest.Mock).mock.calls[0][0].justification).toBe(
      'court order 123',
    );
  });

  it('refuses without a fresh step-up and writes nothing', async () => {
    const { svc, tx, audit } = build({ stepUp: false });
    await expect(
      svc.queue(admin, REQ, { userId: USER, sections: ['chats'] }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(tx.legalExport.create).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('refuses a closed request', async () => {
    const { svc } = build({ requestStatus: 'fulfilled' });
    await expect(
      svc.queue(admin, REQ, { userId: USER, sections: ['chats'] }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('has a safety valve on the waiting queue but no daily counter', async () => {
    const { svc } = build({ waiting: 50 });
    await expect(
      svc.queue(admin, REQ, { userId: USER, sections: ['chats'] }),
    ).rejects.toBeInstanceOf(BadRequestException);
    const ok = build({ waiting: 49 });
    await expect(
      ok.svc.queue(admin, REQ, { userId: USER, sections: ['chats'] }),
    ).resolves.toBeDefined();
  });

  it('refuses to download an archive that is not ready, and audits a ready one', async () => {
    const a = build();
    (a.prisma.legalExport.findUnique as jest.Mock).mockResolvedValue({
      id: 'e1',
      status: 'expired',
      file_bucket: null,
      file_key: null,
    });
    await expect(a.svc.download(admin, 'e1')).rejects.toBeInstanceOf(
      BadRequestException,
    );

    const b = build();
    (b.prisma.legalExport.findUnique as jest.Mock).mockResolvedValue({
      id: 'e1',
      status: 'ready',
      file_bucket: 'b',
      file_key: 'k',
      sha256: 'abc',
    });
    const out = await b.svc.download(admin, 'e1');
    expect(out.url).toBe('https://signed');
    expect(out.sha256).toBe('abc');
    expect((b.audit.record as jest.Mock).mock.calls[0][0].action).toBe(
      LEGAL_AUDIT.download,
    );
  });

  it('download needs a step-up too', async () => {
    const { svc, storage } = build({ stepUp: false });
    await expect(svc.download(admin, 'e1')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(storage.signedGetUrl).not.toHaveBeenCalled();
  });

  it('creates an unlimited hold and a timed hold; rejects a past expiry', async () => {
    const { svc, tx, audit } = build();
    await svc.createHold(admin, REQ, { targetType: 'user', targetId: USER });
    expect(tx.legalHold.create.mock.calls[0][0].data.expires_at).toBeNull();
    expect((audit.record as jest.Mock).mock.calls[0][0].action).toBe(
      LEGAL_AUDIT.holdOn,
    );
    await expect(
      svc.createHold(admin, REQ, {
        targetType: 'user',
        targetId: USER,
        expiresAt: '2020-01-01T00:00:00Z',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('holds need a step-up', async () => {
    const { svc, tx } = build({ stepUp: false });
    await expect(
      svc.createHold(admin, REQ, { targetType: 'user', targetId: USER }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(tx.legalHold.create).not.toHaveBeenCalled();
  });
});
