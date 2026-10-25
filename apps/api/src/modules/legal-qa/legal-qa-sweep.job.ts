import { Injectable } from '@nestjs/common';
import {
  activeHeldIds,
  notInHeld,
} from '../../common/legal-hold/legal-holds';
import { PrismaService } from '../../prisma/prisma.service';

const DAY_MS = 24 * 3_600_000;
/** A question nobody answered for this long is closed. */
export const QA_AUTO_CLOSE_DAYS = 30;
/** A deleted question is removed for good after this long (as messages). */
export const QA_PURGE_DAYS = 90;

/**
 * Owner 2026-10-21: nightly — questions without an answer for 30 days are
 * closed (gone from the attorneys' feed), questions the author deleted are
 * erased after 90 days (their answers go with them).
 */
@Injectable()
export class LegalQaSweepJob {
  constructor(private readonly prisma: PrismaService) {}

  async run(
    now: Date = new Date(),
  ): Promise<{ closed: number; purged: number }> {
    const closed = await this.prisma.legalQuestion.updateMany({
      where: {
        status: 'published',
        deleted_at: null,
        closed_at: null,
        answer_count: 0,
        created_at: {
          lt: new Date(now.getTime() - QA_AUTO_CLOSE_DAYS * DAY_MS),
        },
      },
      data: { closed_at: now },
    });
    const held = await activeHeldIds(this.prisma, 'user', now);
    const purged = await this.prisma.legalQuestion.deleteMany({
      where: {
        author_id: notInHeld(held),
        deleted_at: { lt: new Date(now.getTime() - QA_PURGE_DAYS * DAY_MS) },
      },
    });
    return { closed: closed.count, purged: purged.count };
  }
}
