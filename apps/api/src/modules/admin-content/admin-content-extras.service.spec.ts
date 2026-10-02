import { ConflictException } from '@nestjs/common';
import { ErrorCode } from '../../common/errors/error-code.enum';
import type { PrismaService } from '../../prisma/prisma.service';
import type { AuditLogService } from '../admin-access/audit-log.service';
import type { AdminActor } from '../admin-auth/admin-auth.decorators';
import type { ModerationService } from '../moderation/moderation.service';
import type { NotificationsService } from '../notifications/notifications.service';
import { AdminContentExtrasService } from './admin-content-extras.service';

const admin: AdminActor = {
  id: 'admin-1',
  adminRole: 'moderator',
  sessionId: 's',
  justification: null,
  ip: null,
};

function setup(row: Record<string, unknown> | null) {
  const tx = {
    post: { findUnique: jest.fn().mockResolvedValue(row) },
    comment: { findUnique: jest.fn().mockResolvedValue(row) },
    caseComment: { findUnique: jest.fn().mockResolvedValue(row) },
  };
  const prisma = {
    $transaction: jest.fn((fn: (t: typeof tx) => unknown) => fn(tx)),
  } as unknown as PrismaService;
  const target = {
    type: 'post',
    id: 'p1',
    authorId: 'u1',
    status: 'removed',
    text: 'x',
    context: {},
    createdAt: null,
  };
  const moderation = {
    resolve: jest.fn().mockResolvedValue(target),
    setContentStatus: jest
      .fn()
      .mockImplementation(
        (_tx: unknown, _t: unknown, _a: unknown, after: (() => void)[]) => {
          after.push(() => undefined);
          return Promise.resolve('removed');
        },
      ),
  };
  const notifications = { emit: jest.fn().mockResolvedValue(null) };
  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  const service = new AdminContentExtrasService(
    prisma,
    moderation as unknown as ModerationService,
    notifications as unknown as NotificationsService,
    audit as unknown as AuditLogService,
  );
  return { service, tx, moderation, notifications, audit };
}

async function codeOf(p: Promise<unknown>): Promise<string | undefined> {
  const e = await p.catch((err: unknown) => err);
  return e instanceof ConflictException
    ? (e.getResponse() as { code: string }).code
    : undefined;
}

describe('AdminContentExtrasService.restore', () => {
  it('restores a post removed by moderation and audits the reason', async () => {
    const s = setup({ status: 'removed', video_asset: null });
    await s.service.restore(admin, 'post', 'p1', 'Removed by mistake');
    expect(s.moderation.setContentStatus).toHaveBeenCalledWith(
      s.tx,
      expect.objectContaining({ id: 'p1' }),
      'restore',
      expect.any(Array),
    );
    expect(s.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'admin.post.restore',
        targetId: 'p1',
        before: { status: 'removed' },
        after: { status: 'published', reason: 'Removed by mistake' },
      }),
      s.tx,
    );
  });

  it('refuses a post its author deleted (status stays published)', async () => {
    const s = setup({ status: 'published', video_asset: null });
    expect(
      await codeOf(s.service.restore(admin, 'post', 'p1', 'Bring it back')),
    ).toBe(ErrorCode.CONTENT_INVALID_STATE);
    expect(s.moderation.setContentStatus).not.toHaveBeenCalled();
  });

  it('refuses a reel whose video was taken down', async () => {
    const s = setup({ status: 'removed', video_asset: { status: 'deleted' } });
    expect(
      await codeOf(s.service.restore(admin, 'post', 'p1', 'Bring it back')),
    ).toBe(ErrorCode.CONTENT_INVALID_STATE);
  });

  it('restores a hidden case comment', async () => {
    const s = setup({ status: 'hidden' });
    await s.service.restore(admin, 'case_comment', 'c1', 'False report');
    expect(s.tx.caseComment.findUnique).toHaveBeenCalled();
    expect(s.moderation.resolve).toHaveBeenCalledWith(
      'case_comment',
      'c1',
      s.tx,
    );
  });
});

describe('AdminContentExtrasService.setClientReviewStatus', () => {
  it('hide notifies the author with the reason', async () => {
    const s = setup(null);
    await s.service.setClientReviewStatus('r1', 'hide', 'Insulting language');
    expect(s.moderation.resolve).toHaveBeenCalledWith(
      'client_review',
      'r1',
      expect.anything(),
    );
    expect(s.notifications.emit).toHaveBeenCalledWith({
      type: 'moderation_notice',
      recipientId: 'u1',
      payload: { reason: 'Insulting language', clientReviewId: 'r1' },
    });
  });

  it('a no-op change is CONTENT_INVALID_STATE', async () => {
    const s = setup(null);
    s.moderation.setContentStatus.mockResolvedValueOnce(null);
    expect(
      await codeOf(
        s.service.setClientReviewStatus('r1', 'restore', 'Show it again'),
      ),
    ).toBe(ErrorCode.CONTENT_INVALID_STATE);
    expect(s.notifications.emit).not.toHaveBeenCalled();
  });
});
