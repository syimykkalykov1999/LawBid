import { Injectable } from '@nestjs/common';
import type { Prisma, PrismaClient, User } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { withDeleted } from '../../../prisma/soft-delete.extension';

export type IdentityProvider = 'phone' | 'email' | 'apple' | 'google';

export interface FindOrCreateResult {
  user: User;
  isNewUser: boolean;
}

export interface CollisionResult {
  collision: true;
  maskedIdentifier: string;
  availableMethods: IdentityProvider[];
}

/**
 * Owns "who is this identifier" resolution and the account-collision
 * policy for social login (docs/CHANGELOG.md, stage 1.4, ask-item A5).
 *
 * Policy: NEVER auto-merge at login, even when the spec's §10.3 wording
 * ("автослияние только при подтверждённом владении обоими
 * идентификаторами") could be read as allowing it. An IdP's email claim
 * is an assertion from a third party, not proof the human in front of the
 * device controls that email's inbox right now — auto-merging on it is a
 * full account-takeover vector (a forged/stale Google Workspace email, an
 * Apple relay address that changed hands), not a UX papercut. Merging
 * only ever happens through the already-authenticated `POST
 * /auth/identifiers` flow, where the user proves the new identifier while
 * signed into the account they want to add it to.
 */
@Injectable()
export class IdentityService {
  constructor(private readonly prisma: PrismaService) {}

  async findByIdentifier(
    provider: IdentityProvider,
    providerUid: string,
  ): Promise<User | null> {
    const identifier = await this.prisma.userIdentifier.findUnique({
      where: { provider_provider_uid: { provider, provider_uid: providerUid } },
      include: { user: true },
    });
    return identifier?.user ?? null;
  }

  /** OTP login (phone/email channel) — one identifier IS the account key,
   * no collision policy needed (unlike social, a phone/email you can
   * prove control of via OTP already establishes it's you). */
  async findOrCreateForOtp(
    channel: 'phone' | 'email',
    normalizedIdentifier: string,
    tx?: Prisma.TransactionClient | PrismaClient,
  ): Promise<FindOrCreateResult> {
    const client = tx ?? this.prisma;
    const existing = await client.userIdentifier.findUnique({
      where: {
        provider_provider_uid: {
          provider: channel,
          provider_uid: normalizedIdentifier,
        },
      },
      include: { user: true },
    });
    if (existing) {
      return { user: existing.user, isNewUser: false };
    }

    const now = new Date();
    const user = await client.user.create({
      data: {
        status: 'active',
        [channel === 'phone' ? 'phone_e164' : 'email']: normalizedIdentifier,
        [channel === 'phone' ? 'phone_verified_at' : 'email_verified_at']: now,
        identifiers: {
          create: {
            provider: channel,
            provider_uid: normalizedIdentifier,
            verified_at: now,
          },
        },
      },
    });
    return { user, isNewUser: true };
  }

  /** Social login. Checks the collision policy BEFORE creating anything —
   * see class doc. Returns a CollisionResult instead of throwing so the
   * controller can shape the 409 response (masked identifier + which
   * methods are available) without this service knowing about HTTP. */
  async findOrCreateForSocial(
    provider: 'apple' | 'google',
    providerUid: string,
    verifiedEmail: string | undefined,
    firstName: string | undefined,
    lastName: string | undefined,
  ): Promise<FindOrCreateResult | CollisionResult> {
    const existingByProvider = await this.findByIdentifier(
      provider,
      providerUid,
    );
    if (existingByProvider) {
      return { user: existingByProvider, isNewUser: false };
    }

    if (verifiedEmail) {
      const normalizedEmail = verifiedEmail.trim().toLowerCase();
      // withDeleted: a soft-deleted account that still owns this email
      // (not yet anonymized, docs/02 §6.4) is still a collision — and
      // users.email is unique, so creating a second owner would fail.
      const emailOwner = await this.prisma.user.findFirst({
        where: withDeleted({
          email: normalizedEmail,
          email_verified_at: { not: null },
        }),
      });
      if (emailOwner) {
        return {
          collision: true,
          maskedIdentifier: maskEmail(normalizedEmail),
          availableMethods: await this.availableMethodsFor(emailOwner.id),
        };
      }
    }

    const now = new Date();
    const user = await this.prisma.user.create({
      data: {
        status: 'active',
        first_name: firstName,
        last_name: lastName,
        email: verifiedEmail?.trim().toLowerCase(),
        email_verified_at: verifiedEmail ? now : undefined,
        identifiers: {
          create: { provider, provider_uid: providerUid, verified_at: now },
        },
      },
    });
    return { user, isNewUser: true };
  }

  /** POST /auth/identifiers — link an additional identifier to the
   * CURRENT (already authenticated) account. Throws-by-return: caller
   * checks the `linked` flag rather than catching, matching this
   * project's controller-throws/service-returns split. */
  async linkIdentifier(
    userId: string,
    provider: IdentityProvider,
    providerUid: string,
  ): Promise<{
    linked: boolean;
    reason?: 'already_linked_elsewhere' | 'already_linked_here';
  }> {
    const existing = await this.prisma.userIdentifier.findUnique({
      where: { provider_provider_uid: { provider, provider_uid: providerUid } },
    });
    if (existing) {
      return {
        linked: false,
        reason:
          existing.user_id === userId
            ? 'already_linked_here'
            : 'already_linked_elsewhere',
      };
    }
    await this.prisma.userIdentifier.create({
      data: {
        user_id: userId,
        provider,
        provider_uid: providerUid,
        verified_at: new Date(),
      },
    });
    return { linked: true };
  }

  private async availableMethodsFor(
    userId: string,
  ): Promise<IdentityProvider[]> {
    const rows = await this.prisma.userIdentifier.findMany({
      where: { user_id: userId },
      select: { provider: true },
    });
    return rows.map((r) => r.provider);
  }
}

function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!domain) return '***';
  const maskedLocal =
    local.length <= 2
      ? local[0] + '*'
      : local[0] + '*'.repeat(local.length - 1);
  const [domainName, ...rest] = domain.split('.');
  const maskedDomain =
    domainName.length <= 1
      ? domainName
      : domainName[0] + '*'.repeat(domainName.length - 1);
  return `${maskedLocal}@${[maskedDomain, ...rest].join('.')}`;
}
