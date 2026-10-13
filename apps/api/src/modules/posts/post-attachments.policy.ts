import { ForbiddenException, Injectable } from '@nestjs/common';
import { AppSettingsService } from '../../common/app-settings/app-settings.service';
import { ErrorCode } from '../../common/errors/error-code.enum';
import { PrismaService } from '../../prisma/prisma.service';
import { activeClientBadgeIds } from '../client-badge/client-badge.util';
import { EntitlementsService } from '../plans/entitlements.service';

export const POST_ATTACHMENT_MODES = [
  'by_subscription',
  'off_for_all',
  'on_for_all',
] as const;
export type PostAttachmentMode = (typeof POST_ATTACHMENT_MODES)[number];

/**
 * Owner 2026-10-13: who may ADD documents and extra photos to a post or a
 * reel (everybody always sees them). The admin's setting
 * `attachments_in_posts` decides: off for all (the default), on for all,
 * or by subscription — a client needs an active gold badge, an attorney an
 * active paid plan and a verified licence, and in both cases the plan must
 * include "attachments in posts and reels".
 */
@Injectable()
export class PostAttachmentsPolicy {
  constructor(
    private readonly settings: AppSettingsService,
    private readonly prisma: PrismaService,
    private readonly entitlements: EntitlementsService,
  ) {}

  async mode(): Promise<PostAttachmentMode> {
    const raw = await this.settings.string('attachments_in_posts');
    return (POST_ATTACHMENT_MODES as readonly string[]).includes(raw)
      ? (raw as PostAttachmentMode)
      : 'off_for_all';
  }

  async canAttach(userId: string): Promise<boolean> {
    const mode = await this.mode();
    if (mode === 'off_for_all') return false;
    if (mode === 'on_for_all') return true;
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });
    if (!user) return false;
    const resolved = await this.entitlements.forUser(userId);
    if (resolved.values.post_attachments !== true) return false;
    if (user.role === 'client') {
      return (await activeClientBadgeIds(this.prisma, [userId])).has(userId);
    }
    if (!resolved.isPaid) return false;
    const licence = await this.prisma.attorneyLicense.findFirst({
      where: { attorney_id: userId, license_status: 'verified' },
      select: { id: true },
    });
    return licence !== null;
  }

  async assertCanAttach(userId: string): Promise<void> {
    if (await this.canAttach(userId)) return;
    throw new ForbiddenException({
      code: ErrorCode.POST_ATTACHMENTS_NOT_ALLOWED,
      message: 'Adding files to posts is not available for this account.',
    });
  }
}
