import {
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AdminRole } from '@prisma/client';
import type Redis from 'ioredis';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { ErrorCode } from '../../common/errors/error-code.enum';
import { PrismaService } from '../../prisma/prisma.service';
import { REDIS_CLIENT } from '../../redis/redis.constants';
import { AuditLogService } from '../admin-access/audit-log.service';
import { OtpService } from '../auth/services/otp.service';
import { RateLimitService } from '../auth/services/rate-limit.service';
import { TokenService } from '../auth/services/token.service';
import type { AdminActor } from './admin-auth.decorators';
import type {
  AdminLoginVerifyResultDto,
  AdminMeDto,
  AdminSessionDto,
} from './admin-auth.dto';
import {
  ADMIN_SESSION_TTL_SECONDS,
  AdminSessionService,
} from './admin-session.service';
import { SecretCipher } from './secret-cipher';
import {
  base32Encode,
  generateTotpSecret,
  otpauthUri,
  verifyTotp,
} from './totp.util';

const TICKET_TTL_SECONDS = 5 * 60;
const TICKET_MAX_ATTEMPTS = 5;
/** A TOTP code stays unusable for the whole ±1-step window it is valid in. */
const TOTP_REPLAY_WINDOW_SECONDS = 95;
const RECOVERY_CODES = 10;
const LOGIN_START_PER_EMAIL_PER_HOUR = 5;
const LOGIN_VERIFY_PER_EMAIL_PER_HOUR = 10;
const TOTP_ISSUER = 'LawBid Admin';

export const ADMIN_AUDIT = {
  login: 'admin.login',
  logout: 'admin.logout',
  totpEnrolled: 'admin.totp_enrolled',
  recoveryUsed: 'admin.recovery_code_used',
} as const;

interface AdminRow {
  id: string;
  email: string;
  admin_role: AdminRole;
}

/**
 * docs/06 §2.1 admin sign-in: email + emailed code + mandatory TOTP; the
 * first sign-in binds the authenticator and hands out recovery codes
 * (`admin_credentials`). No registration — accounts come from the
 * "Администраторы" section. Every successful step that matters is an
 * audit_log row; the mobile session/refresh machinery is not involved
 * (admin JWT + Redis session only, AdminSessionService).
 */
@Injectable()
export class AdminAuthService {
  private readonly cipher: SecretCipher | null;
  private readonly loginStartPerIpPerHour: number;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly otp: OtpService,
    private readonly tokens: TokenService,
    private readonly sessions: AdminSessionService,
    private readonly rateLimit: RateLimitService,
    private readonly audit: AuditLogService,
    config: ConfigService,
  ) {
    const key = config.get<string>('ADMIN_TOTP_ENC_KEY');
    this.cipher = key ? new SecretCipher(key) : null;
    this.loginStartPerIpPerHour = config.getOrThrow<number>(
      'ADMIN_LOGIN_LIMIT_PER_IP_PER_HOUR',
    );
  }

  /** Always 200 (anti-enumeration): a code is sent only to an active admin. */
  async loginStart(email: string, ip: string | null): Promise<void> {
    this.assertConfigured();
    const normalized = email.trim().toLowerCase();
    await this.limit(
      ['admin-login', 'email', this.rateLimit.hashIdentifier(normalized)],
      LOGIN_START_PER_EMAIL_PER_HOUR,
    );
    if (ip) {
      await this.limit(['admin-login', 'ip', ip], this.loginStartPerIpPerHour);
    }
    const admin = await this.findAdmin(normalized);
    if (!admin) return;
    await this.otp.requestOtp('email', normalized, 'admin');
  }

  async loginVerify(
    email: string,
    code: string,
  ): Promise<AdminLoginVerifyResultDto> {
    const cipher = this.assertConfigured();
    const normalized = email.trim().toLowerCase();
    await this.limit(
      ['admin-verify', 'email', this.rateLimit.hashIdentifier(normalized)],
      LOGIN_VERIFY_PER_EMAIL_PER_HOUR,
    );
    const admin = await this.findAdmin(normalized);
    // A non-admin email gets the same answer as a wrong code.
    const result = admin
      ? await this.otp.verifyOtp('email', normalized, code, 'admin')
      : 'invalid';
    if (result !== 'ok' || !admin) {
      throw new UnauthorizedException({
        code:
          result === 'expired'
            ? ErrorCode.AUTH_OTP_EXPIRED
            : result === 'locked'
              ? ErrorCode.AUTH_OTP_LOCKED
              : ErrorCode.AUTH_OTP_INVALID,
        message: 'The code is not valid.',
      });
    }

    const cred = await this.prisma.adminCredential.findUnique({
      where: { user_id: admin.id },
    });
    let enrollment: AdminLoginVerifyResultDto['totpEnrollment'] = null;
    if (!cred?.totp_enabled_at) {
      // First sign-in (or after a 2FA reset): a fresh secret each time the
      // email step is passed, until one is confirmed by a valid code.
      const secret = generateTotpSecret();
      await this.prisma.adminCredential.upsert({
        where: { user_id: admin.id },
        create: { user_id: admin.id, totp_secret_enc: cipher.encrypt(secret) },
        update: { totp_secret_enc: cipher.encrypt(secret) },
      });
      enrollment = {
        secret,
        otpauthUri: otpauthUri({
          issuer: TOTP_ISSUER,
          account: admin.email,
          secretBase32: secret,
        }),
      };
    }

    const jti = randomUUID();
    await this.redis.set(this.ticketKey(jti), '0', 'EX', TICKET_TTL_SECONDS);
    const ticket = this.tokens.signAdminTicket(
      { sub: admin.id, jti },
      TICKET_TTL_SECONDS,
    );
    return { ticket, totpEnrollment: enrollment };
  }

  async totpVerify(
    ticket: string,
    code: string,
    ip: string | null,
  ): Promise<AdminSessionDto> {
    const cipher = this.assertConfigured();
    const { admin, jti, cred } = await this.openTicket(ticket);
    const secret = cipher.decrypt(cred.totp_secret_enc);
    if (!verifyTotp(secret, code)) {
      await this.failAttempt(jti, ErrorCode.ADMIN_TOTP_INVALID);
    }
    // Security review: a code is single-use inside its ±1-step window
    // (RFC 6238 §5.2), and the ticket is consumed atomically so two
    // parallel requests cannot both turn into sessions.
    const fresh = await this.redis.set(
      `adm:totp:used:${admin.id}:${code}`,
      '1',
      'EX',
      TOTP_REPLAY_WINDOW_SECONDS,
      'NX',
    );
    if (fresh !== 'OK') {
      await this.failAttempt(jti, ErrorCode.ADMIN_TOTP_INVALID);
    }
    await this.consumeTicket(jti);

    let recoveryCodes: string[] | undefined;
    if (!cred.totp_enabled_at) {
      recoveryCodes = Array.from({ length: RECOVERY_CODES }, newRecoveryCode);
      await this.prisma.adminCredential.update({
        where: { user_id: admin.id },
        data: {
          totp_enabled_at: new Date(),
          recovery_codes_hash: recoveryCodes.map(hashRecoveryCode),
          last_login_at: new Date(),
        },
      });
      await this.audit.record({
        adminId: admin.id,
        action: ADMIN_AUDIT.totpEnrolled,
        targetType: 'admin',
        targetId: admin.id,
        ip,
      });
    } else {
      await this.prisma.adminCredential.update({
        where: { user_id: admin.id },
        data: { last_login_at: new Date() },
      });
    }
    return this.issueSession(admin, ip, recoveryCodes);
  }

  async recovery(
    ticket: string,
    recoveryCode: string,
    ip: string | null,
  ): Promise<AdminSessionDto> {
    this.assertConfigured();
    const { admin, jti, cred } = await this.openTicket(ticket);
    const hash = hashRecoveryCode(recoveryCode);
    if (!cred.totp_enabled_at || !cred.recovery_codes_hash.includes(hash)) {
      await this.failAttempt(jti, ErrorCode.ADMIN_RECOVERY_CODE_INVALID);
    }
    await this.consumeTicket(jti);
    const remaining = cred.recovery_codes_hash.filter((h) => h !== hash);
    // Conditional: the code must still be in the list when we remove it, so
    // two concurrent requests with one code cannot both succeed.
    const { count } = await this.prisma.adminCredential.updateMany({
      where: { user_id: admin.id, recovery_codes_hash: { has: hash } },
      data: { recovery_codes_hash: remaining, last_login_at: new Date() },
    });
    if (count === 0) throw ticketInvalid();
    await this.audit.record({
      adminId: admin.id,
      action: ADMIN_AUDIT.recoveryUsed,
      targetType: 'admin',
      targetId: admin.id,
      after: { remainingCodes: remaining.length },
      ip,
    });
    return this.issueSession(admin, ip);
  }

  async logout(actor: AdminActor): Promise<void> {
    await this.sessions.revoke(actor.sessionId, actor.id);
  }

  async me(actor: AdminActor): Promise<AdminMeDto> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: actor.id },
      select: {
        id: true,
        email: true,
        admin_profile: { select: { admin_role: true } },
        admin_credential: {
          select: { totp_enabled_at: true, last_login_at: true },
        },
      },
    });
    return {
      id: user.id,
      email: user.email ?? '',
      role: user.admin_profile?.admin_role ?? actor.adminRole,
      totpEnabled: Boolean(user.admin_credential?.totp_enabled_at),
      lastLoginAt: user.admin_credential?.last_login_at?.toISOString() ?? null,
    };
  }

  // ---------------------------------------------------------------------

  private async issueSession(
    admin: AdminRow,
    ip: string | null,
    recoveryCodes?: string[],
  ): Promise<AdminSessionDto> {
    const jti = randomUUID();
    await this.sessions.create(admin.id, jti);
    const accessToken = this.tokens.signAdminToken(
      { sub: admin.id, jti, role: admin.admin_role },
      ADMIN_SESSION_TTL_SECONDS,
    );
    await this.audit.record({
      adminId: admin.id,
      action: ADMIN_AUDIT.login,
      targetType: 'admin',
      targetId: admin.id,
      after: { method: recoveryCodes ? 'totp_enrolled' : 'totp' },
      ip,
    });
    const cred = await this.prisma.adminCredential.findUnique({
      where: { user_id: admin.id },
      select: { last_login_at: true },
    });
    return {
      accessToken,
      expiresAt: new Date(
        Date.now() + ADMIN_SESSION_TTL_SECONDS * 1000,
      ).toISOString(),
      admin: {
        id: admin.id,
        email: admin.email,
        role: admin.admin_role,
        totpEnabled: true,
        lastLoginAt: cred?.last_login_at?.toISOString() ?? null,
      },
      ...(recoveryCodes ? { recoveryCodes } : {}),
    };
  }

  private async openTicket(ticket: string) {
    let claims;
    try {
      claims = this.tokens.verifyAdminTicket(ticket);
    } catch {
      throw ticketInvalid();
    }
    if (!(await this.redis.exists(this.ticketKey(claims.jti)))) {
      throw ticketInvalid();
    }
    const user = await this.prisma.user.findUnique({
      where: { id: claims.sub },
      select: {
        id: true,
        email: true,
        role: true,
        status: true,
        deleted_at: true,
        admin_profile: { select: { admin_role: true } },
        admin_credential: true,
      },
    });
    if (
      !user?.email ||
      user.role !== 'admin' ||
      user.status !== 'active' ||
      user.deleted_at ||
      !user.admin_profile ||
      !user.admin_credential
    ) {
      throw ticketInvalid();
    }
    return {
      jti: claims.jti,
      cred: user.admin_credential,
      admin: {
        id: user.id,
        email: user.email,
        admin_role: user.admin_profile.admin_role,
      } satisfies AdminRow,
    };
  }

  /** Consumes the ticket exactly once (DEL returns 0 for a lost race). */
  private async consumeTicket(jti: string): Promise<void> {
    if ((await this.redis.del(this.ticketKey(jti))) === 0)
      throw ticketInvalid();
  }

  /** Counts a wrong second factor; the 5th burns the ticket. */
  private async failAttempt(jti: string, code: ErrorCode): Promise<never> {
    const attempts = await this.redis.incr(this.ticketKey(jti));
    if (attempts >= TICKET_MAX_ATTEMPTS) {
      await this.redis.del(this.ticketKey(jti));
      throw ticketInvalid();
    }
    throw new UnauthorizedException({
      code,
      message: 'The code is not valid.',
      details: { remainingAttempts: TICKET_MAX_ATTEMPTS - attempts },
    });
  }

  private async findAdmin(email: string): Promise<AdminRow | null> {
    const user = await this.prisma.user.findFirst({
      where: {
        email,
        role: 'admin',
        status: 'active',
        deleted_at: null,
        admin_profile: { isNot: null },
      },
      select: { id: true, email: true, admin_profile: true },
    });
    if (!user?.email || !user.admin_profile) return null;
    return {
      id: user.id,
      email: user.email,
      admin_role: user.admin_profile.admin_role,
    };
  }

  private async limit(parts: string[], perHour: number): Promise<void> {
    const r = await this.rateLimit.consumeFixedWindow(parts, perHour, 3600);
    if (!r.allowed) {
      throw new HttpException(
        {
          code: ErrorCode.AUTH_OTP_REQUEST_LIMIT,
          message: 'Too many attempts. Try again later.',
          details: { retryAfterSeconds: r.retryAfterSeconds },
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  private assertConfigured(): SecretCipher {
    if (!this.cipher) {
      throw new ServiceUnavailableException({
        code: ErrorCode.ADMIN_AUTH_NOT_CONFIGURED,
        message: 'Admin sign-in is not configured (ADMIN_TOTP_ENC_KEY).',
      });
    }
    return this.cipher;
  }

  private ticketKey(jti: string): string {
    return `adm:ticket:${jti}`;
  }
}

const ticketInvalid = () =>
  new UnauthorizedException({
    code: ErrorCode.ADMIN_TICKET_INVALID,
    message: 'Start the sign-in again.',
  });

/** `XXXXX-XXXXX`, 50 bits of entropy; SHA-256 at rest (no pepper needed
 * at this entropy — brute force is infeasible even with the hash). */
function newRecoveryCode(): string {
  const raw = base32Encode(randomBytes(7)).slice(0, 10);
  return `${raw.slice(0, 5)}-${raw.slice(5)}`;
}

export function hashRecoveryCode(code: string): string {
  const normalized = code.toUpperCase().replace(/[^A-Z2-7]/g, '');
  return createHash('sha256').update(normalized).digest('hex');
}
