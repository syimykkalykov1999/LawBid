import { ForbiddenException, Injectable } from '@nestjs/common';
import { ErrorCode } from '../../common/errors/error-code.enum';
import { PrismaService } from '../../prisma/prisma.service';

export const BAN_KINDS = ['user', 'phone', 'email', 'device'] as const;
export type BanKind = (typeof BAN_KINDS)[number];

export interface BanSubject {
  userId?: string | null;
  phone?: string | null;
  email?: string | null;
  deviceId?: string | null;
}

/** Same shape the stored value takes: e-mail lower-cased, rest trimmed. */
export function normalizeBanValue(kind: BanKind, value: string): string {
  const v = value.trim();
  return kind === 'email' ? v.toLowerCase() : v;
}

/**
 * Sign-in blocks (owner 2026-10-02): a user, a phone number, an e-mail or a
 * device can be blocked for a time or for good. A ban is active while it is
 * not lifted and has no end date or the end date is ahead, so a timed ban
 * ends by itself with no job.
 */
@Injectable()
export class AccountBansService {
  constructor(private readonly prisma: PrismaService) {}

  /** The active ban matching any of the given identities, if there is one. */
  async findActive(subject: BanSubject) {
    const or: { kind: BanKind; value: string }[] = [];
    if (subject.userId) or.push({ kind: 'user', value: subject.userId });
    if (subject.phone)
      or.push({
        kind: 'phone',
        value: normalizeBanValue('phone', subject.phone),
      });
    if (subject.email)
      or.push({
        kind: 'email',
        value: normalizeBanValue('email', subject.email),
      });
    if (subject.deviceId)
      or.push({
        kind: 'device',
        value: normalizeBanValue('device', subject.deviceId),
      });
    if (or.length === 0) return null;
    return this.prisma.accountBan.findFirst({
      where: {
        OR: or,
        lifted_at: null,
        AND: [
          { OR: [{ expires_at: null }, { expires_at: { gt: new Date() } }] },
        ],
      },
      orderBy: { created_at: 'desc' },
    });
  }

  /** Throws the same 403 a suspended account gets, with the reason and the
   * end date so the app can show "blocked until …, contact support". */
  async assertAllowed(subject: BanSubject): Promise<void> {
    const ban = await this.findActive(subject);
    if (!ban) return;
    throw new ForbiddenException({
      code: ErrorCode.ACCOUNT_SUSPENDED,
      message: 'This account has been blocked. Contact support.',
      details: {
        blocked: true,
        kind: ban.kind,
        reason: ban.reason,
        until: ban.expires_at ? ban.expires_at.toISOString() : null,
      },
    });
  }
}
