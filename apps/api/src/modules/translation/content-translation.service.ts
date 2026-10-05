import { Injectable, NotFoundException } from '@nestjs/common';
import { ErrorCode } from '../../common/errors/error-code.enum';
import { PrismaService } from '../../prisma/prisma.service';
import type { RequestUser } from '../auth/decorators/current-user.decorator';
import { CaseAccessPolicy } from '../cases/policies/case-access.policy';
import type { TranslatableKind } from './translation.dto';
import type { TranslateZone } from './translation-zones';
import {
  type TextTranslation,
  TranslationService,
  translationUnavailable,
} from './translation.service';

export const KIND_ZONE: Record<TranslatableKind, TranslateZone> = {
  post: 'posts',
  comment: 'posts',
  case: 'cases',
  bid: 'cases',
  review: 'reviews',
  profile: 'profiles',
};

/**
 * Owner 2026-10-05: «Перевести» outside chats. The text is always read on
 * the server (never sent by the app, so the key can't be used as a free
 * translator) and only when the person may see it: published posts,
 * comments, reviews and bios; a case through CaseAccessPolicy; a bid by
 * its two parties. Anything else is 404, like a missing one.
 */
@Injectable()
export class ContentTranslationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly caseAccess: CaseAccessPolicy,
    private readonly translation: TranslationService,
  ) {}

  async translate(
    user: RequestUser,
    kind: TranslatableKind,
    id: string,
    target: string,
  ): Promise<TextTranslation> {
    const zone = KIND_ZONE[kind];
    // Plan, then zone and key: nothing is read when translation is off.
    await this.translation.assertEntitled(user);
    if (!(await this.translation.apiKey(zone))) throw translationUnavailable();
    const text = (await this.load(user, kind, id))?.trim() ?? '';
    if (text === '') throw notFound();
    return this.translation.translate(
      user,
      zone,
      `${kind}:${id}`,
      text,
      target,
    );
  }

  private async load(
    user: RequestUser,
    kind: TranslatableKind,
    id: string,
  ): Promise<string | null | undefined> {
    switch (kind) {
      case 'post':
        return (
          await this.prisma.post.findFirst({
            where: { id, deleted_at: null, status: 'published' },
            select: { body: true },
          })
        )?.body;
      case 'comment':
        return (
          await this.prisma.comment.findFirst({
            where: { id, deleted_at: null, status: 'published' },
            select: { body: true },
          })
        )?.body;
      case 'review':
        return (
          await this.prisma.review.findFirst({
            where: { id, status: 'published' },
            select: { body: true },
          })
        )?.body;
      case 'profile':
        return (
          await this.prisma.attorneyProfile.findUnique({
            where: { user_id: id },
            select: { bio: true },
          })
        )?.bio;
      case 'case': {
        const access = await this.caseAccess.decide(
          { userId: user.sub, role: user.role },
          id,
        );
        if (!access) return null;
        return (
          await this.prisma.case.findFirst({
            where: { id, deleted_at: null },
            select: { description: true },
          })
        )?.description;
      }
      case 'bid': {
        const bid = await this.prisma.bid.findUnique({
          where: { id },
          select: {
            message: true,
            attorney_id: true,
            case: { select: { client_id: true } },
          },
        });
        const party =
          bid &&
          ((user.role === 'client' && bid.case.client_id === user.sub) ||
            (user.role === 'attorney' && bid.attorney_id === user.sub));
        return party ? bid.message : null;
      }
    }
  }
}

function notFound(): NotFoundException {
  return new NotFoundException({
    code: ErrorCode.NOT_FOUND,
    message: 'Nothing to translate.',
  });
}
