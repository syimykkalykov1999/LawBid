import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
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
    const agg = await this.prisma.quickReply.aggregate({
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
    return this.prisma.quickReply.create({
      data: {
        user_id: user.sub,
        title: input.title,
        body: input.body,
        position: (agg._max.position ?? -1) + 1,
      },
      select: SELECT,
    });
  }

  async update(
    user: RequestUser,
    id: string,
    input: QuickReplyInputDto,
  ): Promise<QuickReplyDto> {
    // The owner is part of the filter: someone else's id looks missing.
    const res = await this.prisma.quickReply.updateMany({
      where: { id, user_id: user.sub },
      data: { title: input.title, body: input.body },
    });
    if (res.count === 0) throw this.missing();
    return this.prisma.quickReply.findFirstOrThrow({
      where: { id, user_id: user.sub },
      select: SELECT,
    });
  }

  /** Idempotent: deleting a missing reply is not an error. */
  async remove(user: RequestUser, id: string): Promise<void> {
    await this.prisma.quickReply.deleteMany({
      where: { id, user_id: user.sub },
    });
  }

  private missing(): NotFoundException {
    return new NotFoundException({
      code: ErrorCode.NOT_FOUND,
      message: 'Quick reply not found',
    });
  }
}
