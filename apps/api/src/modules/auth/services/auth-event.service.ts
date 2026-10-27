import { Injectable, Optional } from '@nestjs/common';
import { createHmac } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import type { Prisma, PrismaClient } from '@prisma/client';
import {
  SloMetricsService,
  type SloCounter,
} from '../../../common/ops/slo-metrics.service';
import { PrismaService } from '../../../prisma/prisma.service';

/**
 * docs/02_DATABASE.md §4.A: auth_events is append-only (no update/delete
 * for the lawbid_app DB role — that grant itself is stage 2.6 raw SQL,
 * not yet applied, but this service only ever INSERTs regardless).
 * event_type is free text in the schema (not a DB enum) — this file is
 * the single place the vocabulary is defined, so it can't drift.
 */
export const AUTH_EVENT_TYPES = {
  OTP_REQUESTED: 'otp_requested',
  OTP_VERIFY_SUCCESS: 'otp_verify_success',
  OTP_VERIFY_FAILED: 'otp_verify_failed',
  OTP_LOCKED: 'otp_locked',
  SOCIAL_LOGIN_SUCCESS: 'social_login_success',
  SOCIAL_LOGIN_FAILED: 'social_login_failed',
  // Owner 2026-10-04: an assistant signed in with the attorney's code.
  ASSISTANT_CODE_LOGIN: 'assistant_code_login',
  ASSISTANT_CODE_FAILED: 'assistant_code_failed',
  // Owner 2026-10-13: sign-in with a password (no SMS), password set,
  // changed or reset.
  PASSWORD_LOGIN_SUCCESS: 'password_login_success',
  PASSWORD_LOGIN_FAILED: 'password_login_failed',
  PASSWORD_SET: 'password_set',
  PASSWORD_RESET_REQUESTED: 'password_reset_requested',
  PASSWORD_RESET_DONE: 'password_reset_done',
  PASSWORD_RESET_BY_ADMIN: 'password_reset_by_admin',
  // Owner 2026-10-20: sign-in to the website by scanning its QR code with
  // the phone (approved / refused on the phone, signed in on the web).
  QR_LOGIN_APPROVED: 'qr_login_approved',
  QR_LOGIN_REJECTED: 'qr_login_rejected',
  QR_LOGIN_SUCCESS: 'qr_login_success',
  // Owner 2026-10-22: passkeys (WebAuthn) — enrolled / removed on the
  // account, signed in with one, a failed assertion at sign-in.
  PASSKEY_ADDED: 'passkey_added',
  PASSKEY_REMOVED: 'passkey_removed',
  PASSKEY_LOGIN_SUCCESS: 'passkey_login_success',
  PASSKEY_LOGIN_FAILED: 'passkey_login_failed',
  TOKEN_REFRESHED: 'token_refreshed',
  REFRESH_REUSE_DETECTED: 'refresh_reuse_detected',
  SESSION_REVOKED: 'session_revoked',
  LOGOUT: 'logout',
  LOGOUT_ALL: 'logout_all',
  IDENTIFIER_LINKED: 'identifier_linked',
  CONTACT_VERIFIED: 'contact_verified',
  REAUTH_SUCCESS: 'reauth_success',
  REAUTH_FAILED: 'reauth_failed',
  ACCOUNT_DELETION_REQUESTED: 'account_deletion_requested',
  ACCOUNT_DELETION_CANCELLED: 'account_deletion_cancelled',
  LOGIN_BLOCKED_SUSPENDED: 'login_blocked_suspended',
  LOGIN_BLOCKED_DELETED: 'login_blocked_deleted',
  // docs/01 §10.6: a login created a session on a device_id this existing
  // user never used before (NewDeviceNotifier).
  NEW_DEVICE: 'new_device',
  // Refresh-token rotation hit the per-session-chain limit.
  REFRESH_RATE_LIMITED: 'refresh_rate_limited',
  // docs/04 §12: every entry into "История кейсов" (docs/02 §4.A list).
  HISTORY_VIEWED: 'history_viewed',
} as const;
export type AuthEventType =
  (typeof AUTH_EVENT_TYPES)[keyof typeof AUTH_EVENT_TYPES];

/**
 * S12-3 / S12-13: how an auth event counts in the SLO line. A sign-in that
 * worked or failed feeds the login SLI; failures, lockouts and a refresh
 * token replay feed `authFailed` (credential-stuffing anomaly alarm); every
 * code request feeds `otpRequested`.
 */
const LOGIN_OK: readonly AuthEventType[] = [
  AUTH_EVENT_TYPES.OTP_VERIFY_SUCCESS,
  AUTH_EVENT_TYPES.SOCIAL_LOGIN_SUCCESS,
  AUTH_EVENT_TYPES.PASSWORD_LOGIN_SUCCESS,
  AUTH_EVENT_TYPES.PASSKEY_LOGIN_SUCCESS,
  AUTH_EVENT_TYPES.QR_LOGIN_SUCCESS,
  AUTH_EVENT_TYPES.ASSISTANT_CODE_LOGIN,
];
const LOGIN_FAIL: readonly AuthEventType[] = [
  AUTH_EVENT_TYPES.OTP_VERIFY_FAILED,
  AUTH_EVENT_TYPES.SOCIAL_LOGIN_FAILED,
  AUTH_EVENT_TYPES.PASSWORD_LOGIN_FAILED,
  AUTH_EVENT_TYPES.PASSKEY_LOGIN_FAILED,
  AUTH_EVENT_TYPES.ASSISTANT_CODE_FAILED,
];
const AUTH_ABUSE: readonly AuthEventType[] = [
  ...LOGIN_FAIL,
  AUTH_EVENT_TYPES.OTP_LOCKED,
  AUTH_EVENT_TYPES.REAUTH_FAILED,
  AUTH_EVENT_TYPES.REFRESH_REUSE_DETECTED,
];

/** The SLO counters one auth event adds to (exported for the spec). */
export function sloCountersFor(
  eventType: AuthEventType,
  success: boolean,
): SloCounter[] {
  const out: SloCounter[] = [];
  if (success && LOGIN_OK.includes(eventType)) out.push('loginOk');
  if (!success && LOGIN_FAIL.includes(eventType)) out.push('loginFail');
  if (!success && AUTH_ABUSE.includes(eventType)) out.push('authFailed');
  if (eventType === AUTH_EVENT_TYPES.OTP_REQUESTED) out.push('otpRequested');
  return out;
}

export interface RecordAuthEventInput {
  userId?: string;
  eventType: AuthEventType;
  success: boolean;
  identifier?: string;
  ip?: string;
  deviceId?: string;
  userAgent?: string;
  meta?: Record<string, unknown>;
}

@Injectable()
export class AuthEventService {
  private readonly pepper: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    @Optional() private readonly slo?: SloMetricsService,
  ) {
    // Separate from OTP_KEY_PEPPER/OTP_CODE_SECRET on purpose: a leaked
    // Redis dump (OTP keys) must not help correlate rows in the audit
    // journal, and vice versa.
    this.pepper = this.config.getOrThrow<string>('AUTH_EVENT_PEPPER');
  }

  /** Pass `tx` to write inside an existing withTxRetry() transaction
   * (e.g. alongside the Session insert on login) — falls back to a
   * standalone write otherwise. */
  async record(
    input: RecordAuthEventInput,
    tx?: Prisma.TransactionClient | PrismaClient,
  ): Promise<void> {
    const client = tx ?? this.prisma;
    await client.authEvent.create({
      data: {
        user_id: input.userId,
        event_type: input.eventType,
        success: input.success,
        identifier_hash: input.identifier
          ? this.hashIdentifier(input.identifier)
          : undefined,
        ip: input.ip,
        device_id: input.deviceId,
        user_agent: input.userAgent,
        meta: input.meta as Prisma.InputJsonValue | undefined,
      },
    });
    for (const c of sloCountersFor(input.eventType, input.success)) {
      this.slo?.count(c);
    }
  }

  private hashIdentifier(identifier: string): string {
    return createHmac('sha256', this.pepper)
      .update(identifier.trim().toLowerCase())
      .digest('hex');
  }
}
