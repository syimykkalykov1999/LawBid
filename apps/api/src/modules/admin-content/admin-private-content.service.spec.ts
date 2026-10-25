import { ForbiddenException, NotFoundException } from '@nestjs/common';
import type { AppSettingsService } from '../../common/app-settings/app-settings.service';
import type { MessageBodyCipher } from '../../common/secrets/message-body-cipher';
import type { PrismaService } from '../../prisma/prisma.service';
import type { AdminActor } from '../admin-auth/admin-auth.decorators';
import type { AdminAuthService } from '../admin-auth/admin-auth.service';
import type { S3StorageService } from '../files/storage/s3-storage.service';
import { AdminPrivateContentService } from './admin-private-content.service';

const admin = (extra: Partial<AdminActor> = {}): AdminActor => ({
  id: 'a1',
  adminRole: 'moderator',
  sessionId: 's1',
  justification: 'Report 42: harassment',
  reasonCode: 'report_review',
  ip: '203.0.113.9',
  ...extra,
});

function make(opts: { freshStepUp?: boolean } = {}) {
  const prisma = {
    conversation: {
      findUnique: jest.fn().mockResolvedValue({
        id: 'c1',
        attorney_id: 'att',
        client_id: 'cli',
      }),
    },
    message: {
      findMany: jest.fn().mockResolvedValue([
        {
          id: 'm1',
          sender_id: 'att',
          type: 'text',
          created_at: new Date('2026-10-01T10:00:00Z'),
          deleted_at: null,
          file_name: null,
          duration_ms: null,
        },
      ]),
      findUnique: jest.fn().mockResolvedValue({
        id: 'm1',
        conversation_id: 'c1',
        sender_id: 'att',
        created_at: new Date('2026-10-01T10:00:00Z'),
        body_original: 'enc:secret',
      }),
    },
    call: { findMany: jest.fn().mockResolvedValue([]) },
    casePhoto: {
      findFirst: jest.fn().mockResolvedValue({ file_id: 'f1' }),
      findMany: jest.fn().mockResolvedValue([]),
    },
    file: {
      findUnique: jest.fn().mockResolvedValue({
        s3_bucket: 'docs',
        s3_key: 'k',
        purpose: 'case_attachment',
        scan_status: 'clean',
        deleted_at: null,
        purged_at: null,
      }),
      findMany: jest.fn().mockResolvedValue([]),
    },
  };
  const auth = {
    assertFreshStepUp: jest.fn(() => {
      if (opts.freshStepUp === false) {
        return Promise.reject(
          new ForbiddenException({ code: 'ADMIN_STEP_UP_REQUIRED' }),
        );
      }
      return Promise.resolve();
    }),
  };
  const storage = {
    signedGetUrl: jest.fn().mockResolvedValue('https://signed'),
  };
  const settings = { number: jest.fn().mockResolvedValue(120) };
  const cipher = { open: jest.fn().mockReturnValue('the real text') };
  const svc = new AdminPrivateContentService(
    prisma as unknown as PrismaService,
    auth as unknown as AdminAuthService,
    storage as unknown as S3StorageService,
    settings as unknown as AppSettingsService,
    cipher as unknown as MessageBodyCipher,
  );
  return { svc, prisma, auth, storage, settings, cipher };
}

describe('AdminPrivateContentService (owner 2026-10-28)', () => {
  it('lists messages WITHOUT reading or returning any body column', async () => {
    const { svc, prisma } = make();
    const page = await svc.listMessages(admin(), 'c1');
    const select = prisma.message.findMany.mock.calls[0][0].select;
    expect(select.body_original).toBeUndefined();
    expect(select.body_display).toBeUndefined();
    expect(page.items[0].bodyHidden).toBe(true);
    expect(JSON.stringify(page)).not.toContain('enc:secret');
  });

  it('reveals one text only after a fresh step-up, within the setting’s window', async () => {
    const ok = make();
    const r = await ok.svc.revealMessage(admin(), 'm1');
    expect(r.body).toBe('the real text');
    expect(ok.auth.assertFreshStepUp).toHaveBeenCalledWith('s1', 120);
    expect(ok.cipher.open).toHaveBeenCalledWith('enc:secret', 'm1');

    const stale = make({ freshStepUp: false });
    await expect(stale.svc.revealMessage(admin(), 'm1')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    // The text was not even read from the database.
    expect(stale.prisma.message.findUnique).not.toHaveBeenCalled();
  });

  it('an unknown conversation or message is a 404', async () => {
    const t = make();
    t.prisma.conversation.findUnique.mockResolvedValue(null);
    await expect(t.svc.listMessages(admin(), 'x')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(t.svc.listCalls(admin(), 'x')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    t.prisma.message.findUnique.mockResolvedValue(null);
    await expect(t.svc.revealMessage(admin(), 'x')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('an admin limited to some countries sees nothing private', async () => {
    const t = make();
    await expect(
      t.svc.listMessages(admin({ countries: ['CA'] }), 'c1'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(t.prisma.message.findMany).not.toHaveBeenCalled();
  });

  it('a case file link needs the step-up and a clean case file', async () => {
    const t = make();
    const link = await t.svc.caseFileUrl(admin(), 'case1', 'f1');
    expect(link.url).toBe('https://signed');
    expect(t.auth.assertFreshStepUp).toHaveBeenCalled();
    expect(t.storage.signedGetUrl).toHaveBeenCalledWith('docs', 'k', 300);

    const infected = make();
    infected.prisma.file.findUnique.mockResolvedValue({
      s3_bucket: 'docs',
      s3_key: 'k',
      purpose: 'case_attachment',
      scan_status: 'infected',
      deleted_at: null,
      purged_at: null,
    });
    await expect(
      infected.svc.caseFileUrl(admin(), 'case1', 'f1'),
    ).rejects.toBeInstanceOf(NotFoundException);

    const stale = make({ freshStepUp: false });
    await expect(
      stale.svc.caseFileUrl(admin(), 'case1', 'f1'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(stale.storage.signedGetUrl).not.toHaveBeenCalled();
  });
});
