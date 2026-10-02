import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, type AdminRole } from '@prisma/client';
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
  AdminChangeOwnCredentialsDto,
  AdminLoginVerifyResultDto,
  AdminMeDto,
  AdminSessionDto,
  TotpEnrollmentDto,
} from './admin-auth.dto';
import {
  dummyHash,
  hashSecret,
  LOGIN_PATTERN,
  normalizeAnswer,
  normalizeLogin,
  passwordProblem,
  verifySecret,
} from './admin-password.util';
import { parsePermissions, readManageAdmins } from './admin-permissions';
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
const LOGIN_PASSWORD_PER_LOGIN_PER_HOUR = 10;
const NEUTRAL_QUESTION = 'Secret question';
const TOTP_ISSUER = 'LawBid Admin';

export const ADMIN_AUDIT = {
  login: 'admin.login',
  logout: 'admin.logout',
  totpEnrolled: 'admin.totp_enrolled',
  totpDisabled: 'admin.totp_disabled',
  recoveryUsed: 'admin.recovery_code_used',
  passwordLogin: 'admin.login_password',
  credentialsChanged: 'admin.credentials_changed',
  securityQuestionSet: 'admin.security_question_set',
  passwordRecovered: 'admin.password_recovered',
} as const;

interface AdminRow {
  id: string;
  email: string;
  admin_role: AdminRole;
}

/**
 * docs/06 §2.1 admin sign-in (owner 2026-10-02): login + password, or an
 * emailed code, signs in on its own. The authenticator (TOTP) is optional
 * and off by default: an admin who turns it on in the profile is asked for
 * its code after the first factor (`admin_credentials`). No registration —
 * accounts come from the "Администраторы" section. Every successful step that matters is an
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
    ip: string | null = null,
    userAgent: string | null = null,
  ): Promise<AdminLoginVerifyResultDto> {
    this.assertConfigured();
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

    return this.afterFirstFactor(admin, ip, userAgent, 'email_code');
  }

  /** Password first factor → the same 2FA ticket the emailed code gives. */
  async loginPassword(
    login: string,
    password: string,
    ip: string | null,
    userAgent: string | null = null,
  ): Promise<AdminLoginVerifyResultDto> {
    this.assertConfigured();
    const normalized = normalizeLogin(login);
    await this.limit(
      ['admin-pw', 'login', this.rateLimit.hashIdentifier(normalized)],
      LOGIN_PASSWORD_PER_LOGIN_PER_HOUR,
    );
    if (ip)
      await this.limit(['admin-pw', 'ip', ip], this.loginStartPerIpPerHour);
    const cred = await this.prisma.adminCredential.findUnique({
      where: { login: normalized },
      select: {
        password_hash: true,
        user: {
          select: {
            id: true,
            email: true,
            role: true,
            status: true,
            deleted_at: true,
            admin_profile: { select: { admin_role: true } },
          },
        },
      },
    });
    // Always hash-compare, so an unknown login costs the same as a wrong
    // password.
    const ok = await verifySecret(
      password,
      cred?.password_hash ?? (await dummyHash()),
    );
    const u = cred?.user;
    if (
      !ok ||
      !cred?.password_hash ||
      !u?.email ||
      u.role !== 'admin' ||
      u.status !== 'active' ||
      u.deleted_at ||
      !u.admin_profile
    ) {
      throw new UnauthorizedException({
        code: ErrorCode.ADMIN_CREDENTIALS_INVALID,
        message: 'Wrong login or password.',
      });
    }
    return this.afterFirstFactor(
      { id: u.id, email: u.email, admin_role: u.admin_profile.admin_role },
      ip,
      userAgent,
      'password',
    );
  }

  /**
   * The first factor passed. An admin who turned on the authenticator gets
   * a 2FA ticket to exchange with a code; everyone else is signed in now.
   */
  private async afterFirstFactor(
    admin: AdminRow,
    ip: string | null,
    userAgent: string | null,
    method: 'password' | 'email_code',
  ): Promise<AdminLoginVerifyResultDto> {
    const cipher = this.assertConfigured();
    const cred = await this.prisma.adminCredential.findUnique({
      where: { user_id: admin.id },
      select: { totp_enabled_at: true },
    });
    if (cred?.totp_enabled_at) {
      const jti = randomUUID();
      await this.redis.set(this.ticketKey(jti), '0', 'EX', TICKET_TTL_SECONDS);
      const ticket = this.tokens.signAdminTicket(
        { sub: admin.id, jti },
        TICKET_TTL_SECONDS,
      );
      return { ticket, session: null };
    }
    await this.prisma.adminCredential.upsert({
      where: { user_id: admin.id },
      create: {
        user_id: admin.id,
        totp_secret_enc: cipher.encrypt(generateTotpSecret()),
        last_login_at: new Date(),
      },
      update: { last_login_at: new Date() },
    });
    return {
      ticket: null,
      session: await this.issueSession(admin, ip, userAgent, method),
    };
  }

  async totpVerify(
    ticket: string,
    code: string,
    ip: string | null,
    userAgent: string | null = null,
  ): Promise<AdminSessionDto> {
    const cipher = this.assertConfigured();
    const { admin, jti, cred } = await this.openTicket(ticket);
    if (!cred.totp_enabled_at) throw ticketInvalid();
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

    await this.prisma.adminCredential.update({
      where: { user_id: admin.id },
      data: { last_login_at: new Date() },
    });
    return this.issueSession(admin, ip, userAgent, 'totp');
  }

  async recovery(
    ticket: string,
    recoveryCode: string,
    ip: string | null,
    userAgent: string | null = null,
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
    return this.issueSession(admin, ip, userAgent, 'recovery_code');
  }

  async logout(actor: AdminActor): Promise<void> {
    await this.sessions.revoke(actor.sessionId, actor.id);
  }

  async me(actor: AdminActor): Promise<AdminMeDto> {
    return this.buildMe(actor.id, actor.adminRole);
  }

  private async buildMe(
    userId: string,
    fallbackRole: AdminRole,
  ): Promise<AdminMeDto> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        admin_profile: { select: { admin_role: true, permissions: true } },
        admin_credential: {
          select: {
            totp_enabled_at: true,
            last_login_at: true,
            login: true,
            password_hash: true,
            security_question: true,
            security_answer_hash: true,
          },
        },
      },
    });
    const role = user.admin_profile?.admin_role ?? fallbackRole;
    const c = user.admin_credential;
    return {
      id: user.id,
      email: user.email ?? '',
      role,
      totpEnabled: Boolean(c?.totp_enabled_at),
      lastLoginAt: c?.last_login_at?.toISOString() ?? null,
      login: c?.login ?? null,
      hasPassword: Boolean(c?.password_hash),
      permissions:
        role === 'super_admin'
          ? {}
          : parsePermissions(user.admin_profile?.permissions),
      canManageAdmins:
        role === 'super_admin' ||
        readManageAdmins(user.admin_profile?.permissions),
      hasSecurityQuestion: Boolean(c?.security_answer_hash),
      securityQuestion:
        role === 'super_admin' ? (c?.security_question ?? null) : null,
    };
  }

  // ---- login + password management -------------------------------------

  /** The super admin changes their own login and/or password. */
  async changeOwnCredentials(
    actor: AdminActor,
    dto: AdminChangeOwnCredentialsDto,
  ): Promise<void> {
    const cipher = this.assertConfigured();
    // Owner 2026-10-02: only the super admin changes their own login and
    // password; everyone else gets theirs from the super admin or an admin
    // manager.
    if (actor.adminRole !== 'super_admin') {
      throw new ForbiddenException({
        code: ErrorCode.FORBIDDEN,
        message:
          'Only the super admin can change their own login and password.',
      });
    }
    if (!dto.newLogin && !dto.newPassword) {
      throw invalid('Nothing to change.');
    }
    await this.limit(['admin-own-cred', actor.id], 10);
    const cred = await this.prisma.adminCredential.findUnique({
      where: { user_id: actor.id },
    });
    if (cred?.password_hash) {
      const ok = await verifySecret(
        dto.currentPassword ?? '',
        cred.password_hash,
      );
      if (!ok) {
        // 403, not 401: the panel treats 401 as "session over".
        throw new ForbiddenException({
          code: ErrorCode.ADMIN_CREDENTIALS_INVALID,
          message: 'The current password is wrong.',
        });
      }
    }
    const login = dto.newLogin ? this.checkLogin(dto.newLogin) : undefined;
    const effectiveLogin = login ?? cred?.login ?? null;
    if (dto.newPassword) {
      const problem = passwordProblem(dto.newPassword, effectiveLogin);
      if (problem) throw invalid(problem);
    }
    await this.writeCredentials(actor.id, cipher, {
      login,
      password: dto.newPassword,
    });
    await this.audit.record({
      adminId: actor.id,
      action: ADMIN_AUDIT.credentialsChanged,
      targetType: 'admin',
      targetId: actor.id,
      after: {
        by: 'self',
        loginChanged: Boolean(login),
        passwordChanged: Boolean(dto.newPassword),
      },
      ip: actor.ip,
    });
    if (dto.newPassword)
      await this.revokeOtherSessions(actor.id, actor.sessionId);
  }

  /**
   * Super admin or an admin manager sets another admin's login and/or
   * password (the caller checks who may touch the target, and step-up). Their sessions end; the authenticator stays.
   */
  async setCredentialsFor(
    actor: AdminActor,
    targetId: string,
    input: { login?: string; password?: string },
  ): Promise<void> {
    const cipher = this.assertConfigured();
    if (!input.login && !input.password) throw invalid('Nothing to change.');
    const target = await this.prisma.user.findFirst({
      where: { id: targetId, role: 'admin', deleted_at: null },
      select: {
        id: true,
        admin_profile: { select: { admin_role: true } },
        admin_credential: { select: { login: true } },
      },
    });
    if (!target?.admin_profile) {
      throw invalid('Administrator not found.');
    }
    const login = input.login ? this.checkLogin(input.login) : undefined;
    const effectiveLogin = login ?? target.admin_credential?.login ?? null;
    if (input.password) {
      const problem = passwordProblem(input.password, effectiveLogin);
      if (problem) throw invalid(problem);
    }
    await this.writeCredentials(targetId, cipher, {
      login,
      password: input.password,
    });
    await this.audit.record({
      adminId: actor.id,
      action: ADMIN_AUDIT.credentialsChanged,
      targetType: 'admin',
      targetId,
      after: {
        by: actor.adminRole === 'super_admin' ? 'super_admin' : 'admin_manager',
        loginChanged: Boolean(login),
        passwordChanged: Boolean(input.password),
      },
      ip: actor.ip,
    });
    if (input.password || login) await this.sessions.revokeAllForUser(targetId);
  }

  /**
   * One-time setup from the server console (`npm run admin:set-credentials`):
   * sets the login/password (and optionally the security question) of an
   * existing super admin. Values come from environment variables, never
   * from the repository.
   */
  async bootstrapSuperAdmin(input: {
    email?: string;
    login: string;
    password: string;
    question?: string;
    answer?: string;
  }): Promise<{ userId: string; login: string }> {
    const cipher = this.assertConfigured();
    const email = input.email?.trim().toLowerCase();
    const admins = await this.prisma.user.findMany({
      where: {
        role: 'admin',
        deleted_at: null,
        ...(email ? { email } : {}),
        admin_profile: { admin_role: 'super_admin' },
      },
      select: { id: true },
      take: 2,
    });
    if (admins.length !== 1) {
      throw invalid(
        email
          ? 'No super admin with this email.'
          : 'Set SEED_ADMIN_EMAIL: there is not exactly one super admin.',
      );
    }
    const userId = admins[0].id;
    const login = this.checkLogin(input.login);
    const problem = passwordProblem(input.password, login);
    if (problem) throw invalid(problem);
    await this.writeCredentials(userId, cipher, {
      login,
      password: input.password,
    });
    if (input.question && input.answer) {
      const answer = normalizeAnswer(input.answer);
      if (input.question.trim().length < 3 || answer.length < 4) {
        throw invalid('Question or answer too short.');
      }
      await this.prisma.adminCredential.update({
        where: { user_id: userId },
        data: {
          security_question: input.question.trim(),
          security_answer_hash: await hashSecret(answer),
        },
      });
    }
    // The owner signs in with login + password alone; a binding left over
    // from the old sign-in flow would still ask for a code, so the console
    // setup clears it (two-factor can be turned on again in the profile).
    await this.prisma.adminCredential.update({
      where: { user_id: userId },
      data: { totp_enabled_at: null, recovery_codes_hash: [] },
    });
    await this.sessions.revokeAllForUser(userId);
    await this.audit.record({
      adminId: userId,
      action: ADMIN_AUDIT.credentialsChanged,
      targetType: 'admin',
      targetId: userId,
      after: { by: 'console', loginChanged: true, passwordChanged: true },
    });
    return { userId, login };
  }

  /** Super admin only: the question and (hashed) answer used to recover. */
  async setSecurityQuestion(
    actor: AdminActor,
    question: string,
    answer: string,
  ): Promise<void> {
    const cipher = this.assertConfigured();
    if (actor.adminRole !== 'super_admin') {
      throw new ForbiddenException({
        code: ErrorCode.FORBIDDEN,
        message: 'Only the super admin can set a security question.',
      });
    }
    const q = question.trim();
    const a = normalizeAnswer(answer);
    if (q.length < 3 || a.length < 4)
      throw invalid(
        'Question or answer too short (answer: at least 4 characters).',
      );
    const answerHash = await hashSecret(a);
    await this.ensureCredential(actor.id, cipher);
    await this.prisma.adminCredential.update({
      where: { user_id: actor.id },
      data: { security_question: q, security_answer_hash: answerHash },
    });
    await this.audit.record({
      adminId: actor.id,
      action: ADMIN_AUDIT.securityQuestionSet,
      targetType: 'admin',
      targetId: actor.id,
      ip: actor.ip,
    });
  }

  /** The question to show on the recovery form. */
  async recoverQuestion(login: string, ip: string | null): Promise<string> {
    const normalized = normalizeLogin(login);
    await this.limit(
      ['admin-recover-q', 'login', this.rateLimit.hashIdentifier(normalized)],
      10,
    );
    if (ip) await this.limit(['admin-recover-q', 'ip', ip], 20);
    const cred = await this.findSuperCredential(normalized);
    return cred?.security_question ?? NEUTRAL_QUESTION;
  }

  /**
   * Forgot the password: the super admin answers the security question and
   * picks a new password. It does NOT sign anyone in (the new password is
   * used on the next sign-in, with the authenticator when it is on), ends
   * every session and is audited.
   */
  async recoverPassword(
    login: string,
    answer: string,
    newPassword: string,
    ip: string | null,
  ): Promise<void> {
    this.assertConfigured();
    const normalized = normalizeLogin(login);
    await this.limit(
      ['admin-recover', 'login', this.rateLimit.hashIdentifier(normalized)],
      5,
    );
    if (ip) await this.limit(['admin-recover', 'ip', ip], 10);
    const cred = await this.findSuperCredential(normalized);
    const ok = await verifySecret(
      normalizeAnswer(answer),
      cred?.security_answer_hash ?? (await dummyHash()),
    );
    // Owner 2026-10-02: the secret answer is enough to set a new password
    // (the authenticator is optional now). It is rate limited (5/h per
    // login, 10/h per IP), the answer has a 4-character minimum, every
    // session ends and the change is audited.
    if (!ok || !cred?.security_answer_hash) {
      throw new UnauthorizedException({
        code: ErrorCode.ADMIN_RECOVERY_FAILED,
        message: 'The answer is not right.',
      });
    }
    const problem = passwordProblem(newPassword, normalized);
    if (problem) throw invalid(problem);
    await this.prisma.adminCredential.update({
      where: { user_id: cred.user_id },
      data: {
        password_hash: await hashSecret(newPassword),
        password_changed_at: new Date(),
      },
    });
    await this.sessions.revokeAllForUser(cred.user_id);
    await this.audit.record({
      adminId: cred.user_id,
      action: ADMIN_AUDIT.passwordRecovered,
      targetType: 'admin',
      targetId: cred.user_id,
      ip,
    });
  }

  private async findSuperCredential(login: string) {
    const cred = await this.prisma.adminCredential.findUnique({
      where: { login },
      select: {
        user_id: true,
        security_question: true,
        security_answer_hash: true,
        totp_enabled_at: true,
        user: {
          select: {
            role: true,
            status: true,
            deleted_at: true,
            admin_profile: { select: { admin_role: true } },
          },
        },
      },
    });
    const u = cred?.user;
    if (
      !cred ||
      u?.role !== 'admin' ||
      u.status !== 'active' ||
      u.deleted_at ||
      u.admin_profile?.admin_role !== 'super_admin'
    ) {
      return null;
    }
    return cred;
  }

  private checkLogin(raw: string): string {
    const login = normalizeLogin(raw);
    if (!LOGIN_PATTERN.test(login)) {
      throw invalid(
        'Login: 4-40 characters, letters, digits, dot, dash or underscore.',
      );
    }
    return login;
  }

  /** The row needs an authenticator secret from the start; sign-in
   * replaces it with a fresh one until a code confirms it. */
  private async ensureCredential(
    userId: string,
    cipher: SecretCipher,
  ): Promise<void> {
    await this.prisma.adminCredential.upsert({
      where: { user_id: userId },
      create: {
        user_id: userId,
        totp_secret_enc: cipher.encrypt(generateTotpSecret()),
      },
      update: {},
    });
  }

  private async writeCredentials(
    userId: string,
    cipher: SecretCipher,
    change: { login?: string; password?: string },
  ): Promise<void> {
    await this.ensureCredential(userId, cipher);
    try {
      await this.prisma.adminCredential.update({
        where: { user_id: userId },
        data: {
          ...(change.login ? { login: change.login } : {}),
          ...(change.password
            ? {
                password_hash: await hashSecret(change.password),
                password_changed_at: new Date(),
              }
            : {}),
        },
      });
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      ) {
        throw new ConflictException({
          code: ErrorCode.ADMIN_LOGIN_TAKEN,
          message: 'This login is already used by another administrator.',
        });
      }
      throw e;
    }
  }

  private async revokeOtherSessions(
    userId: string,
    keepSessionId: string,
  ): Promise<void> {
    const live = await this.sessions.listForUsers([userId]);
    for (const s of live) {
      if (s.sessionId !== keepSessionId) {
        await this.sessions.revoke(s.sessionId, userId);
      }
    }
  }

  // ---------------------------------------------------------------------

  private async issueSession(
    admin: AdminRow,
    ip: string | null,
    userAgent: string | null,
    method: 'password' | 'email_code' | 'totp' | 'recovery_code',
  ): Promise<AdminSessionDto> {
    const jti = randomUUID();
    await this.sessions.create(admin.id, jti, { ip, userAgent });
    const accessToken = this.tokens.signAdminToken(
      { sub: admin.id, jti, role: admin.admin_role },
      ADMIN_SESSION_TTL_SECONDS,
    );
    await this.audit.record({
      adminId: admin.id,
      action: ADMIN_AUDIT.login,
      targetType: 'admin',
      targetId: admin.id,
      after: { method },
      ip,
    });
    return {
      accessToken,
      expiresAt: new Date(
        Date.now() + ADMIN_SESSION_TTL_SECONDS * 1000,
      ).toISOString(),
      admin: await this.buildMe(admin.id, admin.admin_role),
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

  /**
   * Owner 2026-10-01: a fresh confirmation before a sensitive action (API
   * keys, setting someone's password). With the authenticator on it is a
   * fresh code; without it (2FA is optional) the admin's own password.
   * Valid 5 minutes for this admin session; 5 tries / 15 min.
   */
  async stepUp(
    adminId: string,
    sessionId: string,
    proof: { code?: string; password?: string },
  ) {
    const cipher = this.assertConfigured();
    const r = await this.rateLimit.consumeFixedWindow(
      ['admin-stepup', adminId],
      5,
      900,
    );
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
    const cred = await this.prisma.adminCredential.findUnique({
      where: { user_id: adminId },
    });
    let ok = false;
    if (cred?.totp_enabled_at) {
      const code = proof.code ?? '';
      ok =
        verifyTotp(cipher.decrypt(cred.totp_secret_enc), code) &&
        (await this.redis.set(
          `adm:totp:used:${adminId}:${code}`,
          '1',
          'EX',
          TOTP_REPLAY_WINDOW_SECONDS,
          'NX',
        )) === 'OK';
    } else if (cred?.password_hash) {
      ok = await verifySecret(proof.password ?? '', cred.password_hash);
    } else {
      throw new ForbiddenException({
        code: ErrorCode.ADMIN_STEP_UP_REQUIRED,
        message: 'Set a password or turn on two-factor first.',
      });
    }
    if (!ok) {
      throw new ForbiddenException({
        code: ErrorCode.ADMIN_TOTP_INVALID,
        message: cred?.totp_enabled_at ? 'Wrong code.' : 'Wrong password.',
      });
    }
    const ttl = 300;
    await this.redis.set(`adm:stepup:${sessionId}`, '1', 'EX', ttl);
    return { validForSeconds: ttl };
  }

  // ---- optional two-factor (authenticator) ---------------------------------

  /** Step 1: a fresh secret to put into the authenticator app. Two-factor
   * stays off until a code from the app confirms it. */
  async twoFactorBegin(actor: AdminActor): Promise<TotpEnrollmentDto> {
    const cipher = this.assertConfigured();
    await this.limit(['admin-2fa-begin', actor.id], 10);
    await this.ensureCredential(actor.id, cipher);
    const cred = await this.prisma.adminCredential.findUniqueOrThrow({
      where: { user_id: actor.id },
      select: { totp_enabled_at: true },
    });
    if (cred.totp_enabled_at) throw invalid('Two-factor is already on.');
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: actor.id },
      select: { email: true },
    });
    const secret = generateTotpSecret();
    await this.prisma.adminCredential.update({
      where: { user_id: actor.id },
      data: { totp_secret_enc: cipher.encrypt(secret) },
    });
    return {
      secret,
      otpauthUri: otpauthUri({
        issuer: TOTP_ISSUER,
        account: user.email ?? actor.id,
        secretBase32: secret,
      }),
    };
  }

  /** Step 2: the app's code turns two-factor on and returns the one-time
   * recovery codes (shown once). */
  async twoFactorEnable(actor: AdminActor, code: string): Promise<string[]> {
    const cipher = this.assertConfigured();
    await this.limit(['admin-2fa-enable', actor.id], 10);
    const cred = await this.prisma.adminCredential.findUnique({
      where: { user_id: actor.id },
    });
    if (!cred) throw invalid('Start two-factor setup first.');
    if (cred.totp_enabled_at) throw invalid('Two-factor is already on.');
    // Same single-use rule as the sign-in step (RFC 6238 §5.2).
    const fresh =
      verifyTotp(cipher.decrypt(cred.totp_secret_enc), code) &&
      (await this.redis.set(
        `adm:totp:used:${actor.id}:${code}`,
        '1',
        'EX',
        TOTP_REPLAY_WINDOW_SECONDS,
        'NX',
      )) === 'OK';
    if (!fresh) {
      throw new ForbiddenException({
        code: ErrorCode.ADMIN_TOTP_INVALID,
        message: 'Wrong code.',
      });
    }
    const recoveryCodes = Array.from(
      { length: RECOVERY_CODES },
      newRecoveryCode,
    );
    await this.prisma.adminCredential.update({
      where: { user_id: actor.id },
      data: {
        totp_enabled_at: new Date(),
        recovery_codes_hash: recoveryCodes.map(hashRecoveryCode),
      },
    });
    await this.audit.record({
      adminId: actor.id,
      action: ADMIN_AUDIT.totpEnrolled,
      targetType: 'admin',
      targetId: actor.id,
      ip: actor.ip,
    });
    return recoveryCodes;
  }

  /** Turns two-factor off again; needs a current code (or a recovery code). */
  async twoFactorDisable(actor: AdminActor, code: string): Promise<void> {
    const cipher = this.assertConfigured();
    await this.limit(['admin-2fa-disable', actor.id], 10);
    const cred = await this.prisma.adminCredential.findUnique({
      where: { user_id: actor.id },
    });
    if (!cred?.totp_enabled_at) throw invalid('Two-factor is already off.');
    const viaApp = verifyTotp(cipher.decrypt(cred.totp_secret_enc), code);
    const viaRecovery = cred.recovery_codes_hash.includes(
      hashRecoveryCode(code),
    );
    if (!viaApp && !viaRecovery) {
      throw new ForbiddenException({
        code: ErrorCode.ADMIN_TOTP_INVALID,
        message: 'Wrong code.',
      });
    }
    await this.prisma.adminCredential.update({
      where: { user_id: actor.id },
      data: { totp_enabled_at: null, recovery_codes_hash: [] },
    });
    await this.audit.record({
      adminId: actor.id,
      action: ADMIN_AUDIT.totpDisabled,
      targetType: 'admin',
      targetId: actor.id,
      ip: actor.ip,
    });
  }

  /** Throws unless [sessionId] passed a step-up in the last 5 minutes. */
  async assertStepUp(sessionId: string): Promise<void> {
    if (!(await this.redis.exists(`adm:stepup:${sessionId}`))) {
      throw new ForbiddenException({
        code: ErrorCode.ADMIN_STEP_UP_REQUIRED,
        message: 'Confirm with your 2FA code or password first.',
      });
    }
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

const invalid = (message: string) =>
  new BadRequestException({ code: ErrorCode.VALIDATION_ERROR, message });

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
