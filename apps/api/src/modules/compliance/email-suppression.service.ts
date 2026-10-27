import { Injectable, Optional } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { PrismaService } from '../../prisma/prisma.service';

/** The "system" actor in outreach_suppressions.created_by (no admin). */
export const SYSTEM_ACTOR = '00000000-0000-0000-0000-000000000000';

export type EmailSuppressionReason = 'bounce' | 'complaint' | 'manual';

/** Kinds of mail: a sign-in code or receipt (`transactional`), a system
 * notice (`notification`) and anything sent to win or keep a customer
 * (`marketing`: outreach, newsletters). */
export type EmailKind = 'transactional' | 'notification' | 'marketing';

export function normalizeEmailAddress(
  raw: string | undefined | null,
): string | null {
  const s = (raw ?? '').trim().toLowerCase();
  return s.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) ? s : null;
}

/**
 * Which kinds a suppression blocks. A hard bounce means the address does
 * not exist: nothing is delivered. A complaint ("this is spam") stops all
 * notification and marketing mail but not a code the person asks for.
 */
export function blocksKind(
  reason: EmailSuppressionReason,
  kind: EmailKind,
): boolean {
  if (reason === 'bounce') return true;
  return kind !== 'transactional';
}

/**
 * 2026-10-25 (CAN-SPAM, Gmail/Yahoo bulk-sender rules): the address stop
 * list. SES bounce/complaint events (and the admin) write here; every
 * event is also copied into the outreach stop-list so a cold email is
 * never sent to the address, and matching outreach leads stop being
 * e-mailed (a complaint also makes the lead do-not-contact, like an
 * unsubscribe).
 */
@Injectable()
export class EmailSuppressionService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly logger?: PinoLogger,
  ) {}

  async lookup(emailRaw: string): Promise<EmailSuppressionReason | null> {
    const email = normalizeEmailAddress(emailRaw);
    if (!email) return null;
    const row = await this.prisma.emailSuppression.findUnique({
      where: { email },
      select: { reason: true },
    });
    return (row?.reason as EmailSuppressionReason | undefined) ?? null;
  }

  async isBlocked(emailRaw: string, kind: EmailKind): Promise<boolean> {
    const reason = await this.lookup(emailRaw);
    return reason !== null && blocksKind(reason, kind);
  }

  /** Records a bounce / complaint. Idempotent; a complaint outranks a
   * bounce. Returns false for an unusable address. */
  async add(
    emailRaw: string,
    reason: EmailSuppressionReason,
    extra: { detail?: string; messageId?: string; now?: Date } = {},
  ): Promise<boolean> {
    const email = normalizeEmailAddress(emailRaw);
    if (!email) return false;
    const now = extra.now ?? new Date();
    const existing = await this.prisma.emailSuppression.findUnique({
      where: { email },
      select: { reason: true },
    });
    const keepComplaint =
      existing?.reason === 'complaint' && reason !== 'complaint';
    await this.prisma.emailSuppression.upsert({
      where: { email },
      create: {
        email,
        reason,
        detail: extra.detail?.slice(0, 80) ?? null,
        message_id: extra.messageId?.slice(0, 80) ?? null,
        created_at: now,
      },
      update: keepComplaint
        ? {}
        : {
            reason,
            detail: extra.detail?.slice(0, 80) ?? null,
            message_id: extra.messageId?.slice(0, 80) ?? null,
          },
    });
    await this.prisma.outreachSuppression.createMany({
      data: [
        {
          kind: 'email',
          value: email,
          note: `ses ${reason}`.slice(0, 200),
          created_by: SYSTEM_ACTOR,
          created_at: now,
        },
      ],
      skipDuplicates: true,
    });
    await this.stopOutreachLeads(email, reason, now);
    this.logger?.info(
      { metric: 'email_suppression', reason, domain: email.split('@')[1] },
      'email suppressed',
    );
    return true;
  }

  private async stopOutreachLeads(
    email: string,
    reason: EmailSuppressionReason,
    now: Date,
  ): Promise<void> {
    await this.prisma.outreachLead.updateMany({
      where: { email, unsubscribed_at: null },
      data: { unsubscribed_at: now },
    });
    if (reason === 'complaint') {
      await this.prisma.outreachLead.updateMany({
        where: { email, do_not_contact_at: null },
        data: { do_not_contact_at: now, do_not_contact_reason: 'unsubscribed' },
      });
    }
  }
}
