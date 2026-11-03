import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ErrorCode } from '../../common/errors/error-code.enum';
import { PrismaService } from '../../prisma/prisma.service';
import type { RequestUser } from '../auth/decorators/current-user.decorator';
import type { QuickReplyDto, QuickReplyInputDto } from './quick-replies.dto';

/** One person keeps at most this many quick replies (the list is read whole,
 * so it stays one small indexed query). */
export const QUICK_REPLIES_MAX = 50;

const SELECT = { id: true, title: true, body: true } as const;

/** Owner 2026-11-02: ready-made answers an attorney inserts from the chat
 * composer (WhatsApp Business quick replies). Private to the owner. */
@Injectable()
export class QuickRepliesService {
  constructor(private readonly prisma: PrismaService) {}

  list(user: RequestUser): Promise<QuickReplyDto[]> {
    this.assertAttorney(user);
    return this.prisma.quickReply.findMany({
      where: { user_id: user.sub },
      orderBy: [{ position: 'asc' }, { created_at: 'asc' }],
      take: QUICK_REPLIES_MAX,
      select: SELECT,
    });
  }

  async create(
    user: RequestUser,
    input: QuickReplyInputDto,
  ): Promise<QuickReplyDto> {
    this.assertAttorney(user);
    // The count and the next position are read and written under one
    // per-person lock: two taps or two devices cannot both pass the cap.
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`quick-replies:${user.sub}`}))`;
      const agg = await tx.quickReply.aggregate({
        where: { user_id: user.sub },
        _count: { _all: true },
        _max: { position: true },
      });
      if (agg._count._all >= QUICK_REPLIES_MAX) {
        throw new BadRequestException({
          code: ErrorCode.VALIDATION_ERROR,
          message: `At most ${QUICK_REPLIES_MAX} quick replies`,
        });
      }
      return tx.quickReply.create({
        data: {
          user_id: user.sub,
          title: input.title,
          body: input.body,
          position: (agg._max.position ?? -1) + 1,
        },
        select: SELECT,
      });
    });
  }

  async update(
    user: RequestUser,
    id: string,
    input: QuickReplyInputDto,
  ): Promise<QuickReplyDto> {
    this.assertAttorney(user);
    try {
      // One statement; the owner is part of the filter, so someone else's id
      // (or one deleted a moment ago) looks missing.
      return await this.prisma.quickReply.update({
        where: { id, user_id: user.sub },
        data: { title: input.title, body: input.body },
        select: SELECT,
      });
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2025'
      ) {
        throw new NotFoundException({
          code: ErrorCode.NOT_FOUND,
          message: 'Quick reply not found',
        });
      }
      throw e;
    }
  }

  /** Idempotent: deleting a missing reply is not an error. */
  async remove(user: RequestUser, id: string): Promise<void> {
    this.assertAttorney(user);
    await this.prisma.quickReply.deleteMany({
      where: { id, user_id: user.sub },
    });
  }

  /** The feature is the attorney's (the app shows it to attorneys only). */
  private assertAttorney(user: RequestUser): void {
    if (user.role !== 'attorney') {
      throw new ForbiddenException({
        code: ErrorCode.FORBIDDEN,
        message: 'Quick replies are for attorneys',
      });
    }
  }
}
