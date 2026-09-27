import { Injectable } from '@nestjs/common';
import type { IdentifierType } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';

export interface IdentifierView {
  id: string;
  provider: IdentifierType;
  /** The phone (E.164) or email itself; null for apple/google — the
   * provider `sub` is an opaque id that means nothing to the user and is
   * not echoed back. */
  value: string | null;
  verified: boolean;
  /** True for the phone/email that is the account's contact
   * (users.phone_e164 / users.email) — the one "Change" replaces. */
  isPrimaryContact: boolean;
  createdAt: string;
}

const PROVIDER_ORDER: Record<IdentifierType, number> = {
  phone: 0,
  email: 1,
  apple: 2,
  google: 3,
};

/**
 * GET /users/me/identifiers — the sign-in methods linked to the account
 * (docs/01 §10.3 "Идентификаторы пользователя … привязка в Настройки →
 * Аккаунт"). Only the caller's own rows; ordered phone, email, Apple,
 * Google, then oldest first.
 */
@Injectable()
export class AccountIdentifiersService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string): Promise<IdentifierView[]> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: {
        phone_e164: true,
        email: true,
        identifiers: {
          select: {
            id: true,
            provider: true,
            provider_uid: true,
            verified_at: true,
            created_at: true,
          },
          orderBy: { created_at: 'asc' },
        },
      },
    });
    return user.identifiers
      .map((row) => {
        const contact = row.provider === 'phone' || row.provider === 'email';
        const primary =
          (row.provider === 'phone' && row.provider_uid === user.phone_e164) ||
          (row.provider === 'email' &&
            row.provider_uid.toLowerCase() === user.email?.toLowerCase());
        return {
          id: row.id,
          provider: row.provider,
          value: contact ? row.provider_uid : null,
          verified: row.verified_at !== null,
          isPrimaryContact: primary,
          createdAt: row.created_at.toISOString(),
        };
      })
      .sort((a, b) => PROVIDER_ORDER[a.provider] - PROVIDER_ORDER[b.provider]);
  }
}
