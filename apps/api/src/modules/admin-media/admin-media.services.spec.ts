import { ConflictException } from '@nestjs/common';
import type { AppSettingsService } from '../../common/app-settings/app-settings.service';
import { ErrorCode } from '../../common/errors/error-code.enum';
import type { PrismaService } from '../../prisma/prisma.service';
import type { AuditLogService } from '../admin-access/audit-log.service';
import type { AdminActor } from '../admin-auth/admin-auth.decorators';
import type { AdminContentService } from '../admin-content/admin-content.service';
import type { FilesService } from '../files/files.service';
import type { NotificationsService } from '../notifications/notifications.service';
import type { VideosService } from '../videos/videos.service';
import { AdminStickersService } from './admin-stickers.service';
import { AdminVideosService } from './admin-videos.service';

const admin: AdminActor = {
  id: 'admin-1',
  adminRole: 'moderator',
  sessionId: 's',
  justification: null,
  ip: null,
};

async function codeOf(p: Promise<unknown>): Promise<string | undefined> {
  const e = await p.catch((err: unknown) => err);
  return e instanceof ConflictException
    ? (e.getResponse() as { code: string }).code
    : undefined;
}

describe('AdminVideosService.takedown', () => {
  function setup(asset: Record<string, unknown>) {
    const prisma = {
      videoAsset: { findFirst: jest.fn().mockResolvedValue(asset) },
    } as unknown as PrismaService;
    const videos = {
      markDeleted: jest.fn().mockResolvedValue(undefined),
      purgeNow: jest.fn().mockResolvedValue(undefined),
    };
    const content = { removePost: jest.fn().mockResolvedValue(undefined) };
    const audit = { record: jest.fn().mockResolvedValue(undefined) };
    const service = new AdminVideosService(
      prisma,
      videos as unknown as VideosService,
      content as unknown as AdminContentService,
      audit as unknown as AuditLogService,
    );
    return { service, videos, content, audit };
  }

  it('removes the live post, deletes + purges the asset, audits', async () => {
    const s = setup({
      id: 'v1',
      external_id: 'g1',
      status: 'ready',
      purged_at: null,
      post: { id: 'p1', status: 'published', deleted_at: null },
    });
    await s.service.takedown(admin, 'v1', 'Graphic violence in reel');
    expect(s.content.removePost).toHaveBeenCalledWith(
      'p1',
      'Graphic violence in reel',
    );
    expect(s.videos.markDeleted).toHaveBeenCalledWith(['v1']);
    expect(s.videos.purgeNow).toHaveBeenCalled();
    expect(s.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'admin.video.takedown',
        targetId: 'v1',
        after: expect.objectContaining({
          status: 'deleted',
          postRemoved: true,
        }),
      }),
    );
  });

  it('a failed upload without a post is only deleted', async () => {
    const s = setup({
      id: 'v2',
      external_id: 'g2',
      status: 'failed',
      purged_at: null,
      post: null,
    });
    await s.service.takedown(admin, 'v2', 'Clean up failed upload');
    expect(s.content.removePost).not.toHaveBeenCalled();
    expect(s.videos.markDeleted).toHaveBeenCalledWith(['v2']);
  });

  it('an already deleted video with no live post is a 409', async () => {
    const s = setup({
      id: 'v3',
      external_id: 'g3',
      status: 'deleted',
      purged_at: new Date(),
      post: { id: 'p3', status: 'removed', deleted_at: new Date() },
    });
    expect(
      await codeOf(s.service.takedown(admin, 'v3', 'Second takedown')),
    ).toBe(ErrorCode.CONTENT_INVALID_STATE);
    expect(s.videos.markDeleted).not.toHaveBeenCalled();
  });
});

describe('AdminStickersService', () => {
  function setup(pack: Record<string, unknown> | null) {
    const tx = {
      stickerPack: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        create: jest.fn(),
        update: jest.fn(),
      },
      sticker: {
        create: jest.fn().mockResolvedValue({ id: 's1', emoji: '🙂' }),
      },
    };
    const prisma = {
      $transaction: jest.fn((fn: (t: typeof tx) => unknown) => fn(tx)),
      stickerPack: { findFirst: jest.fn().mockResolvedValue(pack) },
      sticker: { findUnique: jest.fn().mockResolvedValue(null) },
    } as unknown as PrismaService;
    const files = {
      assertAttachable: jest.fn().mockResolvedValue({}),
      stickerUrls: jest.fn().mockResolvedValue(new Map()),
    };
    const settings = { number: jest.fn().mockResolvedValue(120) };
    const notifications = { emit: jest.fn().mockResolvedValue(null) };
    const audit = { record: jest.fn().mockResolvedValue(undefined) };
    const service = new AdminStickersService(
      prisma,
      files as unknown as FilesService,
      settings as unknown as AppSettingsService,
      notifications as unknown as NotificationsService,
      audit as unknown as AuditLogService,
    );
    jest
      .spyOn(service, 'get')
      .mockResolvedValue({ id: 'pk' } as unknown as Awaited<
        ReturnType<AdminStickersService['get']>
      >);
    return { service, tx, files, notifications, audit };
  }

  const userPack = {
    id: 'pk',
    status: 'active',
    is_official: false,
    owner_user_id: 'u1',
    sticker_count: 3,
  };

  it('hide: status hidden (CAS), audit, the author is told why', async () => {
    const s = setup(userPack);
    await s.service.setHidden(admin, 'pk', true, 'Hate symbols in pack');
    expect(s.tx.stickerPack.updateMany).toHaveBeenCalledWith({
      where: { id: 'pk', status: 'active', deleted_at: null },
      data: { status: 'hidden' },
    });
    expect(s.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'admin.sticker_pack.hide',
        before: { status: 'active' },
        after: { status: 'hidden', reason: 'Hate symbols in pack' },
      }),
      s.tx,
    );
    expect(s.notifications.emit).toHaveBeenCalledWith({
      type: 'moderation_notice',
      recipientId: 'u1',
      payload: { reason: 'Hate symbols in pack', stickerPackId: 'pk' },
    });
  });

  it('hiding a hidden pack is CONTENT_INVALID_STATE', async () => {
    const s = setup({ ...userPack, status: 'hidden' });
    expect(
      await codeOf(s.service.setHidden(admin, 'pk', true, 'Hide it again')),
    ).toBe(ErrorCode.CONTENT_INVALID_STATE);
  });

  it("stickers can't be added to a user's pack", async () => {
    const s = setup(userPack);
    expect(
      await codeOf(
        s.service.addSticker(
          admin,
          'pk',
          '00000000-0000-4000-8000-000000000009',
        ),
      ),
    ).toBe(ErrorCode.CONTENT_INVALID_STATE);
    expect(s.files.assertAttachable).not.toHaveBeenCalled();
  });

  it("adds the admin's clean sticker file to an official pack", async () => {
    const s = setup({ ...userPack, is_official: true, owner_user_id: null });
    await s.service.addSticker(admin, 'pk', 'f1', '👍');
    expect(s.files.assertAttachable).toHaveBeenCalledWith('admin-1', 'f1', [
      'sticker',
    ]);
    expect(s.tx.sticker.create).toHaveBeenCalledWith({
      data: { pack_id: 'pk', file_id: 'f1', emoji: '👍', position: 3 },
    });
    expect(s.tx.stickerPack.update).toHaveBeenCalledWith({
      where: { id: 'pk' },
      data: { sticker_count: { increment: 1 } },
    });
  });
});
