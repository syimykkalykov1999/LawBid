import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppSettingsService } from '../../common/app-settings/app-settings.service';
import { Prisma, type AdminRole } from '@prisma/client';
import type Redis from 'ioredis';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { ErrorCode } from '../../common/errors/error-code.enum';
import { PrismaService } from '../../prisma/prisma.service';
import { REDIS_CLIENT } from '../../redis/redis.constants';
import { AuditLogService } from '../admin-access/audit-log.service';
import type {
  AuthenticationResponseJSON,
  RegistrationResponseJSON,
} from '@simplewebauthn/server';
import { PasskeyService } from '../auth/passkeys/passkey.service';
import type {
  AuthenticationChallenge,
  PasskeyView,
} from '../auth/passkeys/passkey.service';
import { RateLimitService } from '../auth/services/rate-limit.service';
import { TokenService } from '../auth/services/token.service';
import type { AdminActor } from './admin-auth.decorators';
import type {
  AdminChangeOwnCredentialsDto,
  AdminLoginVerifyResultDto,
  AdminMeDto,
  AdminSessionDto,
  AdminTotpSetupResultDto,
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
import {
  parsePermissions,
  readCountries,
  readManageAdmins,
  readNoPii,
  readPartner,
} from './admin-permissions';
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
/** Installing an authenticator app takes longer than typing a code. */
const SETUP_TICKET_TTL_SECONDS = 15 * 60;
const TICKET_MAX_ATTEMPTS = 5;
/** A TOTP code stays unusable for the whole ±1-step window it is valid in. */
const TOTP_REPLAY_WINDOW_SECONDS = 95;
const RECOVERY_CODES = 10;
const LOGIN_PASSWORD_PER_LOGIN_PER_HOUR = 10;
const NEUTRAL_QUESTION = 'Secret question';
const TOTP_ISSUER = 'LawBid Admin';
/** Owner 2026-10-01: a step-up stays valid for 5 minutes of the session. */
export const STEP_UP_TTL_SECONDS = 300;

export const ADMIN_AUDIT = {
  login: 'admin.login',
  logout: 'admin.logout',
  totpEnrolled: 'admin.totp_enrolled',
  recoveryUsed: 'admin.recovery_code_used',
  stepUp: 'admin.step_up',
  stepUpFailed: 'admin.step_up_failed',
  passkeyAdded: 'admin.passkey_added',
  passkeyRemoved: 'admin.passkey_removed',
  passwordLogin: 'admin.login_password',
  credentialsChanged: 'admin.credentials_changed',
  securityQuestionSet: 'admin.security_question_set',
  passwordRecovered: 'admin.password_recovered',
  inviteCreated: 'admin.invite_created',
  inviteAccepted: 'admin.invite_accepted',
} as const;

/** Owner 2026-10-16: an invite link is valid for 72 hours, once. */
export const INVITE_TTL_SECONDS = 72 * 3600;
const INVITE_PER_IP_PER_HOUR = 30;
const inviteKey = (hash: string) => `adm:invite:${hash}`;
const inviteForKey = (adminId: string) => `adm:invite-for:${adminId}`;
const hashInviteToken = (token: string) =>
  createHash('sha256').update(token).digest('hex');

export interface AdminInviteIssued {
  token: string;
  /** Absolute link when ADMIN_PANEL_URL is configured, else null (the
   * panel builds it from its own address). */
  url: string | null;
  expiresAt: string;
}

interface AdminRow {
  id: string;
  email: string;
  admin_role: AdminRole;
}

/**
 * docs/06 §2.1 admin sign-in. Owner 2026-10-22 (system audit #2, item 1):
 * login + password, THEN the authenticator (TOTP) code — for every admin
 * role, no exceptions. The old "emailed code alone" sign-in is gone: whoever
 * held an admin's mailbox held the panel. An admin without an authenticator
 * yet is sent through its setup (QR + ten recovery codes) right after the
 * password, before any session exists.
 *
 * Why (cited in docs/runbooks/OWNER.md as well):
 *  - Stripe makes two-step authentication mandatory for every Dashboard
 *    user and asks for it again before sensitive changes
 *    (https://docs.stripe.com/get-started/account/teams/roles);
 *  - Slack lets workspace owners require 2FA for every member
 *    (https://slack.com/help/articles/205138367);
 *  - OWASP ASVS / the MFA cheat sheet and CISA: privileged accounts must
 *    use MFA (https://cheatsheetseries.owasp.org/cheatsheets/Multifactor_Authentication_Cheat_Sheet.html).
 *
 * No registration — accounts come from the "Администраторы" section. Every
 * step that matters is an audit_log row; the mobile session/refresh
 * machinery is not involved (admin JWT + Redis session only).
 */
@Injectable()
export class AdminAuthService {
  private readonly cipher: SecretCipher | null;
  private readonly loginStartPerIpPerHour: number;
  private readonly panelUrl: string | null;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly tokens: TokenService,
    private readonly sessions: AdminSessionService,
    private readonly rateLimit: RateLimitService,
    private readonly audit: AuditLogService,
    config: ConfigService,
    @Optional() private readonly settings?: AppSettingsService,
    // Owner 2026-10-22: passkeys as a second factor next to the
    // authenticator code (recovery codes stay valid) and for the step-up.
    @Optional() private readonly passkeys?: PasskeyService,
  ) {
    const key = config.get<string>('ADMIN_TOTP_ENC_KEY');
    this.cipher = key ? new SecretCipher(key) : null;
    this.panelUrl =
      config.get<string>('ADMIN_PANEL_URL')?.replace(/\/$/, '') ?? null;
    this.loginStartPerIpPerHour = config.getOrThrow<number>(
      'ADMIN_LOGIN_LIMIT_PER_IP_PER_HOUR',
    );
  }

  /**
   * Step 1, login + password. Never a session: always a short ticket for
   * step 2 — the authenticator code, or (no authenticator yet) its setup.
   */
  async loginPassword(
    login: string,
    password: string,
    ip: string | null,
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
    return this.secondFactorTicket(u.id);
  }

  /**
   * The first factor passed: a ticket for step 2. `totpSetupRequired` tells
   * the panel which step 2 it is — the code, or the forced first setup.
   */
  private async secondFactorTicket(
    adminId: string,
  ): Promise<AdminLoginVerifyResultDto> {
    const cred = await this.prisma.adminCredential.findUnique({
      where: { user_id: adminId },
      select: { totp_enabled_at: true },
    });
    const setup = !cred?.totp_enabled_at;
    const ttl = setup ? SETUP_TICKET_TTL_SECONDS : TICKET_TTL_SECONDS;
    const jti = randomUUID();
    await this.redis.set(this.ticketKey(jti), '0', 'EX', ttl);
    const ticket = this.tokens.signAdminTicket({ sub: adminId, jti }, ttl);
    const passkeyAvailable =
      !setup && ((await this.passkeys?.count(adminId, 'admin')) ?? 0) > 0;
    return {
      ticket,
      session: null,
      totpSetupRequired: setup,
      passkeyAvailable,
    };
  }

  // ---- passkeys (owner 2026-10-22) -------------------------------------

  /** Step 2 with a passkey instead of the code: the assertion options,
   * bound to this ticket. Only once the authenticator is set up (the
   * recovery codes come from that setup). */
  async passkeyLoginOptions(ticket: string): Promise<AuthenticationChallenge> {
    this.assertConfigured();
    const passkeys = this.requirePasskeys();
    const { admin, jti, cred } = await this.openTicket(ticket);
    if (!cred.totp_enabled_at) throw ticketInvalid();
    return passkeys.authenticationOptions('admin', admin.id, jti);
  }

  async passkeyLogin(
    ticket: string,
    challengeId: string,
    response: AuthenticationResponseJSON,
    ip: string | null,
    userAgent: string | null = null,
  ): Promise<AdminSessionDto> {
    this.assertConfigured();
    const passkeys = this.requirePasskeys();
    const { admin, jti, cred } = await this.openTicket(ticket);
    if (!cred.totp_enabled_at) throw ticketInvalid();
    try {
      await passkeys.verifyAuthentication('admin', challengeId, response, {
        userId: admin.id,
        bind: jti,
      });
    } catch (err) {
      if (err instanceof UnauthorizedException) {
        await this.failAttempt(jti, ErrorCode.PASSKEY_INVALID);
      }
      throw err;
    }
    await this.consumeTicket(jti);
    await this.prisma.adminCredential.update({
      where: { user_id: admin.id },
      data: { last_login_at: new Date() },
    });
    return this.issueSession(admin, ip, userAgent, 'passkey');
  }

  /** Step-up with a passkey: options bound to this admin session. */
  async stepUpPasskeyOptions(
    adminId: string,
    sessionId: string,
  ): Promise<AuthenticationChallenge> {
    return this.requirePasskeys().authenticationOptions(
      'admin',
      adminId,
      sessionId,
    );
  }

  async stepUpPasskey(
    adminId: string,
    sessionId: string,
    challengeId: string,
    response: AuthenticationResponseJSON,
    ip: string | null = null,
  ): Promise<{ validForSeconds: number }> {
    const passkeys = this.requirePasskeys();
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
    let ok = true;
    try {
      await passkeys.verifyAuthentication('admin', challengeId, response, {
        userId: adminId,
        bind: sessionId,
      });
    } catch (err) {
      if (!(err instanceof UnauthorizedException)) throw err;
      ok = false;
    }
    await this.audit.record({
      adminId,
      action: ok ? ADMIN_AUDIT.stepUp : ADMIN_AUDIT.stepUpFailed,
      targetType: 'admin',
      targetId: adminId,
      after: ok
        ? { validForSeconds: STEP_UP_TTL_SECONDS, method: 'passkey' }
        : { method: 'passkey' },
      ip,
    });
    if (!ok) {
      throw new ForbiddenException({
        code: ErrorCode.PASSKEY_INVALID,
        message: 'The passkey could not be verified.',
      });
    }
    await this.redis.set(stepUpKey(sessionId), '1', 'EX', STEP_UP_TTL_SECONDS);
    return { validForSeconds: STEP_UP_TTL_SECONDS };
  }

  async passkeyRegistrationOptions(
    adminId: string,
  ): Promise<Record<string, unknown>> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: adminId },
      select: { email: true },
    });
    const options = await this.requirePasskeys().registrationOptions(
      adminId,
      'admin',
      { userName: user.email ?? adminId, displayName: 'LawBid Admin' },
    );
    return options as unknown as Record<string, unknown>;
  }

  async passkeyRegister(
    adminId: string,
    response: RegistrationResponseJSON,
    name: string | undefined,
    ip: string | null,
  ): Promise<PasskeyView> {
    const view = await this.requirePasskeys().verifyRegistration(
      adminId,
      'admin',
      response,
      name,
    );
    await this.audit.record({
      adminId,
      action: ADMIN_AUDIT.passkeyAdded,
      targetType: 'admin',
      targetId: adminId,
      after: { passkeyId: view.id, name: view.name },
      ip,
    });
    return view;
  }

  passkeyList(adminId: string): Promise<PasskeyView[]> {
    return this.requirePasskeys().list(adminId, 'admin');
  }

  async passkeyRemove(
    adminId: string,
    id: string,
    ip: string | null,
  ): Promise<void> {
    await this.requirePasskeys().remove(adminId, 'admin', id);
    await this.audit.record({
      adminId,
      action: ADMIN_AUDIT.passkeyRemoved,
      targetType: 'admin',
      targetId: adminId,
      after: { passkeyId: id },
      ip,
    });
  }

  private requirePasskeys(): PasskeyService {
    if (!this.passkeys) {
      throw new ServiceUnavailableException({
        code: ErrorCode.ADMIN_AUTH_NOT_CONFIGURED,
        message: 'Passkeys are not available here.',
      });
    }
    return this.passkeys;
  }

  /**
   * Forced enrolment, step A (owner 2026-10-22): an admin without an
   * authenticator gets a fresh secret for the QR code. Only with a valid
   * password ticket; nothing is switched on until a code confirms it.
   */
  async totpSetupBegin(ticket: string): Promise<TotpEnrollmentDto> {
    const cipher = this.assertConfigured();
    const { admin, cred } = await this.openTicket(ticket);
    if (cred?.totp_enabled_at) throw ticketInvalid();
    const secret = generateTotpSecret();
    await this.prisma.adminCredential.upsert({
      where: { user_id: admin.id },
      create: { user_id: admin.id, totp_secret_enc: cipher.encrypt(secret) },
      update: { totp_secret_enc: cipher.encrypt(secret) },
    });
    return {
      secret,
      otpauthUri: otpauthUri({
        issuer: TOTP_ISSUER,
        account: admin.email,
        secretBase32: secret,
      }),
    };
  }

  /**
   * Forced enrolment, step B: the first code from the app switches the
   * authenticator on, returns the ten recovery codes (shown once) and only
   * then signs in. The ticket is spent.
   */
  async totpSetupFinish(
    ticket: string,
    code: string,
    ip: string | null,
    userAgent: string | null = null,
  ): Promise<AdminTotpSetupResultDto> {
    const cipher = this.assertConfigured();
    const { admin, jti, cred } = await this.openTicket(ticket);
    if (!cred || cred.totp_enabled_at) throw ticketInvalid();
    const fresh =
      verifyTotp(cipher.decrypt(cred.totp_secret_enc), code) &&
      (await this.redis.set(
        `adm:totp:used:${admin.id}:${code}`,
        '1',
        'EX',
        TOTP_REPLAY_WINDOW_SECONDS,
        'NX',
      )) === 'OK';
    if (!fresh) await this.failAttempt(jti, ErrorCode.ADMIN_TOTP_INVALID);
    await this.consumeTicket(jti);
    const recoveryCodes = Array.from(
      { length: RECOVERY_CODES },
      newRecoveryCode,
    );
    // Conditional: two parallel confirmations cannot both enrol.
    const { count } = await this.prisma.adminCredential.updateMany({
      where: { user_id: admin.id, totp_enabled_at: null },
      data: {
        totp_enabled_at: new Date(),
        recovery_codes_hash: recoveryCodes.map(hashRecoveryCode),
        last_login_at: new Date(),
      },
    });
    if (count === 0) throw ticketInvalid();
    await this.audit.record({
      adminId: admin.id,
      action: ADMIN_AUDIT.totpEnrolled,
      targetType: 'admin',
      targetId: admin.id,
      after: { at: 'sign_in' },
      ip,
    });
    return {
      recoveryCodes,
      session: await this.issueSession(admin, ip, userAgent, 'totp_setup'),
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
    if (!cred?.totp_enabled_at) throw ticketInvalid();
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
    const assigned =
      role === 'super_admin'
        ? []
        : readCountries(user.admin_profile?.permissions);
    const partner =
      role === 'super_admin'
        ? null
        : readPartner(user.admin_profile?.permissions);
    return {
      id: user.id,
      email: user.email ?? '',
      role,
      totpEnabled: Boolean(c?.totp_enabled_at),
      passkeyCount: (await this.passkeys?.count(user.id, 'admin')) ?? 0,
      lastLoginAt: c?.last_login_at?.toISOString() ?? null,
      login: c?.login ?? null,
      hasPassword: Boolean(c?.password_hash),
      permissions:
        role === 'super_admin'
          ? {}
          : parsePermissions(user.admin_profile?.permissions),
      canManageAdmins:
        role === 'super_admin' ||
        (!partner && readManageAdmins(user.admin_profile?.permissions)),
      noPii:
        role !== 'super_admin' && readNoPii(user.admin_profile?.permissions),
      countryPartnerId: partner?.partnerId ?? null,
      partnerLead: partner?.lead ?? false,
      countries: assigned,
      countryTabs: await this.prisma.country.findMany({
        where:
          assigned.length > 0
            ? { code: { in: assigned } }
            : { is_enabled: true },
        orderBy: { sort: 'asc' },
        select: { code: true, name: true },
      }),
      reasonRequiredAreas:
        role === 'super_admin' || !this.settings
          ? []
          : await this.settings.stringList('admin.reason_required_areas'),
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
    // The console is also the way back for an owner who lost the phone and
    // the recovery codes: the old authenticator binding is cleared, so the
    // next sign-in walks through the forced authenticator setup again.
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
   * used on the next sign-in, always followed by the authenticator code),
   * ends every session and is audited.
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
    // Owner 2026-10-02: the secret answer is enough to set a new password —
    // it never signs in: the authenticator is still asked at the next
    // sign-in (owner 2026-10-22). Rate limited (5/h per login, 10/h per
    // IP), 4-character minimum answer, every session ends, audited.
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
    method: 'totp' | 'totp_setup' | 'recovery_code' | 'passkey',
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

  /**
   * Owner 2026-10-01 / 2026-10-22: a fresh authenticator code before a
   * sensitive action (money out, someone's phone or password, keys, admin
   * 2FA resets…). The authenticator is mandatory now, so there is no
   * password fallback any more. Valid STEP_UP_TTL_SECONDS (5 min) for this
   * admin session only; 5 tries / 15 min; every try is an audit row.
   * Stripe asks for the 2FA code again before sensitive Dashboard actions
   * the same way (https://docs.stripe.com/get-started/account/teams/roles).
   */
  async stepUp(
    adminId: string,
    sessionId: string,
    code: string | undefined,
    ip: string | null = null,
  ): Promise<{ validForSeconds: number }> {
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
    if (!cred?.totp_enabled_at) {
      // Unreachable through the guard (no session without an
      // authenticator); kept so the rule never depends on the caller.
      throw new ForbiddenException({
        code: ErrorCode.ADMIN_TOTP_SETUP_REQUIRED,
        message: 'Set up the authenticator first (sign in again).',
      });
    }
    const value = code ?? '';
    // Same single-use rule as the sign-in step (RFC 6238 §5.2).
    const ok =
      /^\d{6}$/.test(value) &&
      verifyTotp(cipher.decrypt(cred.totp_secret_enc), value) &&
      (await this.redis.set(
        `adm:totp:used:${adminId}:${value}`,
        '1',
        'EX',
        TOTP_REPLAY_WINDOW_SECONDS,
        'NX',
      )) === 'OK';
    await this.audit.record({
      adminId,
      action: ok ? ADMIN_AUDIT.stepUp : ADMIN_AUDIT.stepUpFailed,
      targetType: 'admin',
      targetId: adminId,
      after: ok ? { validForSeconds: STEP_UP_TTL_SECONDS } : undefined,
      ip,
    });
    if (!ok) {
      throw new ForbiddenException({
        code: ErrorCode.ADMIN_TOTP_INVALID,
        message: 'Wrong code.',
      });
    }
    await this.redis.set(stepUpKey(sessionId), '1', 'EX', STEP_UP_TTL_SECONDS);
    return { validForSeconds: STEP_UP_TTL_SECONDS };
  }

  /** Throws unless [sessionId] passed a step-up in the last 5 minutes. */
  async assertStepUp(sessionId: string): Promise<void> {
    if (!(await this.redis.exists(stepUpKey(sessionId)))) {
      throw new ForbiddenException({
        code: ErrorCode.ADMIN_STEP_UP_REQUIRED,
        message: 'Confirm with a fresh authenticator code first.',
      });
    }
  }

  /**
   * Owner 2026-10-16: a one-time link (72 h) for a new administrator. No
   * email provider exists, so the link is handed to the owner to send
   * himself. A new link ends the previous one. The caller has already
   * checked who may touch [targetId].
   */
  async createInvite(
    actor: AdminActor,
    targetId: string,
  ): Promise<AdminInviteIssued> {
    const target = await this.prisma.user.findFirst({
      where: { id: targetId, role: 'admin', deleted_at: null },
      select: { id: true, status: true },
    });
    if (!target) throw invalid('Administrator not found.');
    if (target.status !== 'active') throw invalid('The account is disabled.');
    const previous = await this.redis.get(inviteForKey(targetId));
    if (previous) await this.redis.del(inviteKey(previous));
    const token = randomBytes(32).toString('base64url');
    const hash = hashInviteToken(token);
    await this.redis.set(
      inviteKey(hash),
      JSON.stringify({ adminId: targetId, by: actor.id }),
      'EX',
      INVITE_TTL_SECONDS,
    );
    await this.redis.set(
      inviteForKey(targetId),
      hash,
      'EX',
      INVITE_TTL_SECONDS,
    );
    await this.audit.record({
      adminId: actor.id,
      action: ADMIN_AUDIT.inviteCreated,
      targetType: 'admin',
      targetId,
      after: { expiresInHours: INVITE_TTL_SECONDS / 3600 },
      ip: actor.ip,
    });
    return {
      token,
      url: this.panelUrl ? `${this.panelUrl}/invite/${token}` : null,
      expiresAt: new Date(Date.now() + INVITE_TTL_SECONDS * 1000).toISOString(),
    };
  }

  /** Who the link is for (the invitee sees the address before choosing a
   * password). Unknown, used or expired links answer the same 404. */
  async previewInvite(
    token: string,
    ip: string | null,
  ): Promise<{ email: string }> {
    if (ip)
      await this.limit(['admin-invite', 'ip', ip], INVITE_PER_IP_PER_HOUR);
    const raw = await this.redis.get(inviteKey(hashInviteToken(token)));
    const adminId = raw
      ? (JSON.parse(raw) as { adminId: string }).adminId
      : null;
    const user = adminId
      ? await this.prisma.user.findFirst({
          where: {
            id: adminId,
            role: 'admin',
            status: 'active',
            deleted_at: null,
          },
          select: { email: true },
        })
      : null;
    if (!user?.email) throw inviteGone();
    return { email: user.email };
  }

  /** The invitee picks a login and password; the link is spent. The
   * authenticator is set up at the first sign-in (forced, owner 2026-10-22). */
  async acceptInvite(
    token: string,
    input: { login: string; password: string },
    ip: string | null,
  ): Promise<{ login: string }> {
    const cipher = this.assertConfigured();
    if (ip)
      await this.limit(['admin-invite', 'ip', ip], INVITE_PER_IP_PER_HOUR);
    const hash = hashInviteToken(token);
    const raw = await this.redis.get(inviteKey(hash));
    if (!raw) throw inviteGone();
    const { adminId, by } = JSON.parse(raw) as { adminId: string; by: string };
    const user = await this.prisma.user.findFirst({
      where: { id: adminId, role: 'admin', status: 'active', deleted_at: null },
      select: { id: true },
    });
    if (!user) throw inviteGone();
    const login = this.checkLogin(input.login);
    const problem = passwordProblem(input.password, login);
    if (problem) throw invalid(problem);
    // Spend the link first: two parallel requests cannot both succeed.
    const spent = await this.redis.del(inviteKey(hash));
    if (spent !== 1) throw inviteGone();
    await this.redis.del(inviteForKey(adminId));
    try {
      await this.writeCredentials(adminId, cipher, {
        login,
        password: input.password,
      });
    } catch (e) {
      // A taken login: give the link back so the invitee can choose another.
      await this.redis.set(inviteKey(hash), raw, 'EX', INVITE_TTL_SECONDS);
      await this.redis.set(
        inviteForKey(adminId),
        hash,
        'EX',
        INVITE_TTL_SECONDS,
      );
      throw e;
    }
    await this.audit.record({
      adminId,
      action: ADMIN_AUDIT.inviteAccepted,
      targetType: 'admin',
      targetId: adminId,
      after: { invitedBy: by },
      ip,
    });
    await this.sessions.revokeAllForUser(adminId);
    return { login };
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

/** Redis flag of a passed step-up, per admin session. */
export const stepUpKey = (sessionId: string) => `adm:stepup:${sessionId}`;

const inviteGone = () =>
  new NotFoundException({
    code: ErrorCode.NOT_FOUND,
    message: 'This invite link is not valid any more.',
  });

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
