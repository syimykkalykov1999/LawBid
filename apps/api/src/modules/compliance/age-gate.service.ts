import { ForbiddenException, Injectable, Optional } from '@nestjs/common';
import type { Prisma, PrismaClient } from '@prisma/client';
import { PinoLogger } from 'nestjs-pino';
import { AppSettingsService } from '../../common/app-settings/app-settings.service';
import { ErrorCode } from '../../common/errors/error-code.enum';
import { PrismaService } from '../../prisma/prisma.service';
import {
  judgeAttestation,
  parseMode,
  type AgeAttestationInput,
  type AgeGatePolicy,
  type AgeVerdict,
} from './age-gate.logic';

export type AgeSource = 'otp' | 'link' | 'social' | 'admin';

/**
 * 2026-10-25 (legal register C3, COPPA): the 18+ gate at sign-up.
 * - `off` (default): nothing changes.
 * - `record`: an attestation the app sends is stored; a missing one is
 *   allowed. A birth date under the minimum is still refused.
 * - `enforce`: a NEW account needs a valid attestation (403
 *   AGE_ATTESTATION_REQUIRED), a birth date under the minimum gets 403
 *   AGE_UNDER_MINIMUM and no account is created.
 * Existing accounts are never touched here.
 */
@Injectable()
export class AgeGateService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: AppSettingsService,
    @Optional() private readonly logger?: PinoLogger,
  ) {}

  async policy(): Promise<AgeGatePolicy> {
    const [mode, minAge, textVersion, requireBirthDate] = await Promise.all([
      this.settings.string('compliance.age_gate.mode'),
      this.settings.number('compliance.age_gate.min_age'),
      this.settings.string('compliance.age_gate.text_version'),
      this.settings.boolean('compliance.age_gate.require_birth_date'),
    ]);
    return {
      mode: parseMode(mode),
      minAge,
      textVersion,
      requireBirthDate,
    };
  }

  /** Throws when a NEW account may not be created with [input]. */
  async assertNewAccountAllowed(
    input: AgeAttestationInput | undefined | null,
    now = new Date(),
  ): Promise<void> {
    const policy = await this.policy();
    if (policy.mode === 'off') return;
    const verdict = judgeAttestation(input, policy, now);
    if (verdict.ok) return;
    // `record` mode lets a missing attestation through, but never a child.
    if (policy.mode === 'record' && verdict.reason === 'missing') return;
    if (policy.mode === 'record' && verdict.reason === 'stale_text') return;
    throw this.refusal(verdict, policy);
  }

  /** Before an OTP code is consumed: a known identifier is not a sign-up. */
  async precheckOtp(
    channel: 'phone' | 'email',
    identifier: string,
    input: AgeAttestationInput | undefined | null,
  ): Promise<void> {
    const policy = await this.policy();
    if (policy.mode === 'off') return;
    const existing = await this.prisma.userIdentifier.findUnique({
      where: {
        provider_provider_uid: { provider: channel, provider_uid: identifier },
      },
      select: { user_id: true },
    });
    if (existing) return;
    await this.assertNewAccountAllowed(input);
  }

  /** Stores the attestation of a freshly created account (same
   * transaction as the account). No-op in `off` mode or without input. */
  async record(
    client: Prisma.TransactionClient | PrismaClient | PrismaService,
    userId: string,
    input: AgeAttestationInput | undefined | null,
    source: AgeSource,
    now = new Date(),
  ): Promise<void> {
    if (!input) return;
    const policy = await this.policy();
    if (policy.mode === 'off') return;
    const verdict = judgeAttestation(input, policy, now);
    if (!verdict.ok) return;
    await client.ageAttestation.upsert({
      where: { user_id: userId },
      create: {
        user_id: userId,
        attested_at: now,
        text_version: input.textVersion,
        min_age: policy.minAge,
        birth_date: verdict.birthDate
          ? new Date(`${verdict.birthDate}T00:00:00.000Z`)
          : null,
        source,
      },
      update: {},
    });
  }

  private refusal(
    verdict: Extract<AgeVerdict, { ok: false }>,
    policy: AgeGatePolicy,
  ): ForbiddenException {
    this.logger?.info(
      { metric: 'age_gate', reason: verdict.reason },
      'age gate refused a sign-up',
    );
    if (verdict.reason === 'under_age') {
      return new ForbiddenException({
        code: ErrorCode.AGE_UNDER_MINIMUM,
        message: `You must be at least ${policy.minAge} years old to use LawBid.`,
      });
    }
    return new ForbiddenException({
      code: ErrorCode.AGE_ATTESTATION_REQUIRED,
      message: `Confirm that you are ${policy.minAge} or older to create an account.`,
      details: {
        reason: verdict.reason,
        textVersion: policy.textVersion,
        minAge: policy.minAge,
        birthDateRequired: policy.requireBirthDate,
      },
    });
  }
}
