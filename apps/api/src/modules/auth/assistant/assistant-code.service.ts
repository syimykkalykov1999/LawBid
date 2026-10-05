import { Injectable, UnauthorizedException } from '@nestjs/common';
import type { AssistantMembership } from '@prisma/client';
import { ErrorCode } from '../../../common/errors/error-code.enum';
import { PrismaService } from '../../../prisma/prisma.service';
import { hashJoinCode, normalizeJoinCode } from '../../assistants/join-code';
import { NotificationsService } from '../../notifications/notifications.service';
import { AssistantContextService } from './assistant-context';

/**
 * Owner 2026-10-04: redeeming an assistant's one-time code (join-code.ts).
 * A code of an invited seat makes the account that redeems it the
 * assistant; a code the attorney issued again for a joined assistant signs
 * that same assistant in on a new phone. Either way the code is gone.
 */
@Injectable()
export class AssistantCodeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly context: AssistantContextService,
    private readonly notifications: NotificationsService,
  ) {}

  /** The live seat behind [code], or 401 ASSISTANT_CODE_INVALID — the
   * same answer for unknown, used, expired and removed (no probing). */
  async find(code: string): Promise<AssistantMembership> {
    const normalized = normalizeJoinCode(code);
    const m =
      normalized.length >= 8
        ? await this.prisma.assistantMembership.findUnique({
            where: { join_code_hash: hashJoinCode(normalized) },
          })
        : null;
    if (
      !m ||
      m.status === 'removed' ||
      !m.join_code_expires_at ||
      m.join_code_expires_at.getTime() <= Date.now()
    ) {
      throw invalid();
    }
    return m;
  }

  /**
   * Binds [m] to [userId] and burns the code in one conditional write, so
   * two phones racing with the same code can't both get in.
   */
  async claim(m: AssistantMembership, userId: string): Promise<void> {
    const joining = m.status !== 'active';
    await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.assistantMembership.updateMany({
        where: {
          id: m.id,
          join_code_hash: m.join_code_hash,
          status: { not: 'removed' },
        },
        data: {
          assistant_user_id: userId,
          status: 'active',
          joined_at: m.joined_at ?? new Date(),
          join_code_hash: null,
          join_code_enc: null,
          join_code_expires_at: null,
        },
      });
      if (count !== 1) throw invalid();
      await tx.user.update({
        where: { id: userId },
        data: { role: 'assistant' },
      });
    });
    await this.context.invalidate(userId);
    if (joining) {
      await this.notifications.emit({
        type: 'assistant_joined',
        recipientId: m.attorney_id,
        payload: { membershipId: m.id },
      });
    }
  }
}

function invalid(): UnauthorizedException {
  return new UnauthorizedException({
    code: ErrorCode.ASSISTANT_CODE_INVALID,
    message: 'This code is not valid. Ask the attorney for a new one.',
  });
}
