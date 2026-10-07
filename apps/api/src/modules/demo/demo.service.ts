import {
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { DemoAccount, Prisma } from '@prisma/client';
import type Redis from 'ioredis';
import { createHash, randomInt, randomUUID } from 'node:crypto';
import { PinoLogger } from 'nestjs-pino';
import { demoContext } from '../../common/demo/demo-context';
import { ErrorCode } from '../../common/errors/error-code.enum';
import { PrismaService } from '../../prisma/prisma.service';
import { REDIS_CLIENT } from '../../redis/redis.constants';
import type { AdminActor } from '../admin-auth/admin-auth.decorators';
import type { DeviceInfo, RequestMeta } from '../auth/services/session.service';
import { RateLimitService } from '../auth/services/rate-limit.service';
import { SessionRevocationService } from '../auth/services/session-revocation.service';
import { TokenService } from '../auth/services/token.service';
import { PartnersService } from '../partners/partners.service';
import { DemoDatabaseService } from './demo-database.service';
import { createDemoUser } from './demo-seed';
import type {
  AdminCreateDemoAccountDto,
  AdminDemoAccountCreatedDto,
  AdminDemoAccountDto,
  AdminDemoAccountsPageDto,
  AdminDemoAccountsQueryDto,
  AdminDemoInviteDto,
  CreateDemoAccountDto,
  DemoAccountDto,
  DemoCurrentDto,
  DemoMeDto,
  DemoSessionDto,
  DemoSettingsDto,
  DemoStatusDto,
} from './demo.dto';
import {
  DEMO_INVITE_ALPHABET,
  DEMO_INVITE_LENGTH,
  DEMO_INVITE_TTL_DAYS,
  DEMO_SETTINGS_KEY,
  type DemoProgramSettings,
  type DemoRole,
  parseDemoSettings,
} from './demo.settings';

const DAY_MS = 86_400_000;
const SEEN_THROTTLE_SECONDS = 600;
/** Shown on the admin status card while the world is truncated, mirrored
 * and seeded (the first boot on CockroachDB Cloud takes several minutes). */
const SEEDING_REASON =
  'Демо-мир заполняется (первый раз несколько минут). Попробуйте позже.';

/**
 * Owner 2026-10-05 («Продвижение»): demo accounts for bloggers.
 *
 * Two databases meet here. The REGISTRY (`demo_accounts`: who created
 * what, last activity, invite code) lives in the real database and is
 * read through `this.real`, which never follows the demo context. The
 * demo USER and all its data live in the demo database and are touched
 * only inside `demoContext.runDemo(...)` or through the raw demo client.
 * Nothing in the demo world can reach a real person: it has no real
 * users, and Stripe/Bunny/SMS/e-mail/push refuse to run in demo context
 * (src/common/demo).
 */
@Injectable()
export class DemoService {
  private lastSweepAt: Date | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly db: DemoDatabaseService,
    private readonly partners: PartnersService,
    private readonly tokens: TokenService,
    private readonly revocation: SessionRevocationService,
    private readonly rateLimit: RateLimitService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(DemoService.name);
  }

  /** The real database, whatever the current context. */
  private get real(): PrismaService {
    return this.db.realClient();
  }

  // ---- settings ----------------------------------------------------------

  async settings(): Promise<DemoProgramSettings> {
    const row = await this.real.appConfig.findUnique({
      where: { key: DEMO_SETTINGS_KEY },
    });
    return parseDemoSettings(row?.value);
  }

  async updateSettings(
    admin: AdminActor,
    dto: DemoSettingsDto,
  ): Promise<DemoProgramSettings> {
    const next = parseDemoSettings(dto);
    await this.real.appConfig.upsert({
      where: { key: DEMO_SETTINGS_KEY },
      create: {
        key: DEMO_SETTINGS_KEY,
        value: next as unknown as Prisma.InputJsonValue,
      },
      update: { value: next as unknown as Prisma.InputJsonValue },
    });
    await this.audit(admin, 'demo.settings.update', null, next);
    return next;
  }

  // ---- app: the partner's own demo accounts -------------------------------

  async me(userId: string): Promise<DemoMeDto> {
    const settings = await this.settings();
    const partner = await this.partners.activePartnerOf(userId);
    const allowed = settings.enabled && !!partner?.demo_access;
    const rows = allowed
      ? await this.real.demoAccount.findMany({
          where: { created_by_user_id: userId },
          orderBy: [{ created_at: 'desc' }],
        })
      : [];
    return {
      enabled: allowed,
      canCreate:
        allowed &&
        this.db.isReady() &&
        rows.length < settings.maxAccountsPerPartner,
      maxAccounts: allowed ? settings.maxAccountsPerPartner : 0,
      ttlDays: settings.ttlDays,
      accounts: rows.map((r) => this.toDto(r, settings)),
    };
  }

  async create(
    userId: string,
    dto: CreateDemoAccountDto,
    device: DeviceInfo,
    meta: RequestMeta,
  ): Promise<DemoSessionDto> {
    const settings = await this.assertPartnerAllowed(userId);
    this.assertReady();
    const held = await this.real.demoAccount.count({
      where: { created_by_user_id: userId },
    });
    if (held >= settings.maxAccountsPerPartner) {
      throw new ConflictException({
        code: ErrorCode.DEMO_LIMIT_REACHED,
        message: `You already have ${held} demo accounts; delete one first.`,
        details: { max: settings.maxAccountsPerPartner },
      });
    }
    const row = await this.createAccount({
      role: dto.role,
      firstName: dto.firstName,
      lastName: dto.lastName,
      createdByUserId: userId,
    });
    return this.session(row, settings, device, meta);
  }

  async enter(
    userId: string,
    accountId: string,
    device: DeviceInfo,
    meta: RequestMeta,
  ): Promise<DemoSessionDto> {
    const settings = await this.assertPartnerAllowed(userId);
    this.assertReady();
    const row = await this.real.demoAccount.findFirst({
      where: { id: accountId, created_by_user_id: userId },
    });
    if (!row) throw this.notFound();
    return this.session(row, settings, device, meta);
  }

  async remove(userId: string, accountId: string): Promise<void> {
    const row = await this.real.demoAccount.findFirst({
      where: { id: accountId, created_by_user_id: userId },
    });
    if (!row) throw this.notFound();
    await this.deleteAccount(row);
  }

  /** PUBLIC: a blogger without an app account enters with the admin's code. */
  async redeem(
    rawCode: string,
    device: DeviceInfo,
    meta: RequestMeta,
  ): Promise<DemoSessionDto> {
    const limit = await this.rateLimit.consumeFixedWindow(
      ['demo-redeem', meta.ip ?? meta.deviceId ?? 'anon'],
      10,
      600,
    );
    if (!limit.allowed) {
      throw new HttpException(
        {
          code: ErrorCode.RATE_LIMITED,
          message: 'Too many attempts. Try again later.',
          details: { retryAfterSeconds: limit.retryAfterSeconds },
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    const settings = await this.settings();
    if (!settings.enabled) {
      throw new ForbiddenException({
        code: ErrorCode.DEMO_DISABLED,
        message: 'Demo mode is switched off right now.',
      });
    }
    this.assertReady();
    const row = await this.real.demoAccount.findUnique({
      where: { invite_code_hash: hashCode(rawCode) },
    });
    if (
      !row ||
      (row.invite_expires_at && row.invite_expires_at.getTime() < Date.now())
    ) {
      throw new NotFoundException({
        code: ErrorCode.DEMO_CODE_INVALID,
        message: 'This demo code does not exist or has expired.',
      });
    }
    return this.session(row, settings, device, meta);
  }

  /** GET /demo/session — called WITH the demo header by a demo session. */
  async current(
    demoUserId: string,
    uiLanguage: string,
  ): Promise<DemoCurrentDto> {
    const settings = await this.settings();
    const row = await this.real.demoAccount.findUnique({
      where: { demo_user_id: demoUserId },
    });
    if (!row) throw this.notFound();
    return {
      account: this.toDto(row, settings),
      bannerText:
        uiLanguage === 'ru' ? settings.bannerText.ru : settings.bannerText.en,
    };
  }

  /** Remembers that a demo account is in use (throttled; called by the
   * interceptor on every demo request). */
  async touch(demoUserId: string): Promise<void> {
    try {
      const ok = await this.redis.set(
        `demo:seen:${demoUserId}`,
        '1',
        'EX',
        SEEN_THROTTLE_SECONDS,
        'NX',
      );
      if (ok !== 'OK') return;
      await this.real.demoAccount.updateMany({
        where: { demo_user_id: demoUserId },
        data: { last_seen_at: new Date() },
      });
    } catch (e) {
      this.logger.warn({ err: e }, 'demo touch failed');
    }
  }

  // ---- admin ---------------------------------------------------------------

  async status(): Promise<DemoStatusDto> {
    const s = this.db.snapshot();
    const accounts = await this.real.demoAccount.count();
    const seeding = this.db.isSeeding();
    return {
      ready: s.ready && !seeding,
      reason: seeding ? SEEDING_REASON : s.reason,
      databaseName: s.databaseName,
      accounts,
      lastResetAt: s.lastResetAt?.toISOString() ?? null,
      lastSweepAt: this.lastSweepAt?.toISOString() ?? null,
      migrationsApplied: s.migrationsApplied,
      migrationsPending: s.migrationsPending,
      seedCounts: s.lastSeedCounts,
    };
  }

  async adminList(
    q: AdminDemoAccountsQueryDto,
  ): Promise<AdminDemoAccountsPageDto> {
    const settings = await this.settings();
    const where: Prisma.DemoAccountWhereInput = q.q
      ? {
          OR: [
            { display_name: { contains: q.q, mode: 'insensitive' } },
            { label: { contains: q.q, mode: 'insensitive' } },
          ],
        }
      : {};
    const [rows, total] = await Promise.all([
      this.real.demoAccount.findMany({
        where,
        orderBy: [{ created_at: 'desc' }],
        skip: (q.page - 1) * q.limit,
        take: q.limit,
      }),
      this.real.demoAccount.count({ where }),
    ]);
    const items = await this.toAdminDtos(rows, settings);
    return { items, total };
  }

  async adminCreate(
    admin: AdminActor,
    dto: AdminCreateDemoAccountDto,
  ): Promise<AdminDemoAccountCreatedDto> {
    const settings = await this.settings();
    this.assertReady();
    const row = await this.createAccount({
      role: dto.role,
      firstName: dto.firstName,
      lastName: dto.lastName,
      label: dto.label,
      createdByAdminId: admin.id,
    });
    let inviteCode: string | null = null;
    let final = row;
    if (dto.withInvite !== false) {
      const invite = await this.mintInvite(row.id);
      inviteCode = invite.code;
      final = invite.row;
    }
    await this.audit(admin, 'demo.account.create', final.id, {
      role: final.role,
      label: final.label,
      withInvite: inviteCode !== null,
    });
    const [item] = await this.toAdminDtos([final], settings);
    return { account: item, inviteCode };
  }

  async adminInvite(
    admin: AdminActor,
    accountId: string,
  ): Promise<AdminDemoInviteDto> {
    const row = await this.real.demoAccount.findUnique({
      where: { id: accountId },
    });
    if (!row) throw this.notFound();
    const invite = await this.mintInvite(row.id);
    await this.audit(admin, 'demo.account.invite', row.id, {});
    return {
      inviteCode: invite.code,
      inviteExpiresAt: (
        invite.row.invite_expires_at ?? new Date()
      ).toISOString(),
    };
  }

  async adminRemove(admin: AdminActor, accountId: string): Promise<void> {
    const row = await this.real.demoAccount.findUnique({
      where: { id: accountId },
    });
    if (!row) throw this.notFound();
    await this.deleteAccount(row);
    await this.audit(admin, 'demo.account.delete', row.id, { role: row.role });
  }

  async adminReset(admin: AdminActor): Promise<void> {
    this.assertReady();
    await this.audit(admin, 'demo.world.reset', null, {});
    // Detached: truncating and reseeding takes a while; the status card
    // shows lastResetAt when it is done.
    void this.db
      .resetWorld()
      .catch((e: unknown) =>
        this.logger.error({ err: e }, 'Demo world reset failed'),
      );
  }

  // ---- sweep (hourly, worker) ---------------------------------------------

  /** Deletes demo accounts idle longer than the TTL; when the registry is
   * empty afterwards, reseeds the world so storage stays near zero. */
  async sweep(): Promise<{ deleted: number; reset: boolean }> {
    this.lastSweepAt = new Date();
    const settings = await this.settings();
    if (!settings.autoClean || !this.db.isReady()) {
      return { deleted: 0, reset: false };
    }
    const cutoff = new Date(Date.now() - settings.ttlDays * DAY_MS);
    const stale = await this.real.demoAccount.findMany({
      where: {
        OR: [
          { last_seen_at: { lt: cutoff } },
          { last_seen_at: null, created_at: { lt: cutoff } },
        ],
      },
      take: 200,
    });
    let deleted = 0;
    for (const row of stale) {
      try {
        await this.deleteAccount(row);
        deleted += 1;
      } catch (e) {
        this.logger.warn({ err: e, id: row.id }, 'demo sweep: delete failed');
      }
    }
    let reset = false;
    if (deleted > 0) {
      const left = await this.real.demoAccount.count();
      if (left === 0) {
        await this.db.resetWorld();
        reset = true;
      }
    }
    return { deleted, reset };
  }

  // ---- internals ------------------------------------------------------------

  private async assertPartnerAllowed(
    userId: string,
  ): Promise<DemoProgramSettings> {
    const settings = await this.settings();
    const partner = await this.partners.activePartnerOf(userId);
    if (!settings.enabled || !partner?.demo_access) {
      throw new ForbiddenException({
        code: ErrorCode.DEMO_DISABLED,
        message: 'Demo mode is not available for this account.',
      });
    }
    return settings;
  }

  private assertReady(): void {
    const seeding = this.db.isSeeding();
    if (!this.db.isReady() || seeding) {
      throw new ServiceUnavailableException({
        code: ErrorCode.DEMO_UNAVAILABLE,
        message: 'The demo world is being prepared. Try again in a minute.',
        details: {
          reason: seeding ? SEEDING_REASON : this.db.snapshot().reason,
        },
      });
    }
  }

  private notFound(): NotFoundException {
    return new NotFoundException({
      code: ErrorCode.NOT_FOUND,
      message: 'Demo account not found.',
    });
  }

  private async createAccount(input: {
    role: DemoRole;
    firstName?: string;
    lastName?: string;
    label?: string;
    createdByUserId?: string;
    createdByAdminId?: string;
  }): Promise<DemoAccount> {
    const demo = this.db.rawDemoClient();
    if (!demo) this.assertReady();
    const created = await createDemoUser(demo!, {
      role: input.role,
      firstName: input.firstName || undefined,
      lastName: input.lastName || undefined,
    });
    await this.db.finishUsers(demo!, [created.userId]);
    return this.real.demoAccount.create({
      data: {
        demo_user_id: created.userId,
        role: input.role,
        display_name: created.displayName.slice(0, 120),
        label: input.label?.slice(0, 200) ?? null,
        created_by_user_id: input.createdByUserId ?? null,
        created_by_admin_id: input.createdByAdminId ?? null,
      },
    });
  }

  /** Deletes the demo user (and, through the schema's cascades, its data)
   * and the registry row. Rows a RESTRICT foreign key keeps alive are
   * left for the next world reset: the account itself is gone either way. */
  private async deleteAccount(row: DemoAccount): Promise<void> {
    const demo = this.db.rawDemoClient();
    if (demo && this.db.isReady()) {
      await demoContext
        .runDemo(() =>
          this.revocation.revokeAllChainsForUser(row.demo_user_id, 'logout'),
        )
        .catch(() => undefined);
      try {
        await demo.userConsent.deleteMany({
          where: { user_id: row.demo_user_id },
        });
        await demo.onboardingState.deleteMany({
          where: { user_id: row.demo_user_id },
        });
        await demo.user.delete({ where: { id: row.demo_user_id } });
      } catch {
        await demo.user
          .update({
            where: { id: row.demo_user_id },
            data: {
              status: 'deleted',
              deleted_at: new Date(),
              email: null,
              first_name: 'Deleted',
              last_name: 'demo account',
            },
          })
          .catch(() => undefined);
      }
    }
    await this.real.demoAccount
      .delete({ where: { id: row.id } })
      .catch(() => undefined);
  }

  private async mintInvite(
    accountId: string,
  ): Promise<{ code: string; row: DemoAccount }> {
    let lastError: unknown = null;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const code = generateInviteCode();
      try {
        const row = await this.real.demoAccount.update({
          where: { id: accountId },
          data: {
            invite_code_hash: hashCode(code),
            invite_expires_at: new Date(
              Date.now() + DEMO_INVITE_TTL_DAYS * DAY_MS,
            ),
          },
        });
        return { code, row };
      } catch (e) {
        lastError = e;
      }
    }
    throw lastError instanceof Error ? lastError : new Error('invite failed');
  }

  /** Mints a demo session: a session row in the DEMO database and an
   * access token carrying `demo: true`. Mirrors SessionService.
   * createSession without the other-device checks a demo account does
   * not need. */
  private async session(
    row: DemoAccount,
    settings: DemoProgramSettings,
    device: DeviceInfo,
    meta: RequestMeta,
  ): Promise<DemoSessionDto> {
    const tokens = await demoContext.runDemo(async () => {
      const user = await this.prisma.user.findUnique({
        where: { id: row.demo_user_id },
        select: { id: true, role: true, status: true },
      });
      if (!user || user.status !== 'active') throw this.notFound();
      const { raw, hash } = this.tokens.generateRefreshToken();
      const sessionChainId = randomUUID();
      await this.prisma.session.create({
        data: {
          user_id: user.id,
          session_chain_id: sessionChainId,
          device_id: device.deviceId,
          device_name: device.deviceName,
          platform: device.platform,
          app_version: device.appVersion,
          ip: meta.ip,
          user_agent: meta.userAgent,
          refresh_hash: hash,
          last_used_at: new Date(),
          expires_at: this.tokens.refreshExpiryDate(),
        },
      });
      const accessToken = this.tokens.signAccessToken({
        sub: user.id,
        role: user.role,
        sid: sessionChainId,
        verified: user.role === 'attorney',
        subscriptionStatus: user.role === 'attorney' ? 'active' : 'none',
        demo: true,
      });
      return {
        accessToken,
        refreshToken: raw,
        accessTokenExpiresIn: this.tokens.accessTtlSecondsValue(),
      };
    });
    const touched = await this.real.demoAccount.update({
      where: { id: row.id },
      data: { last_seen_at: new Date() },
    });
    return { account: this.toDto(touched, settings), tokens };
  }

  private toDto(
    row: DemoAccount,
    settings: DemoProgramSettings,
  ): DemoAccountDto {
    const base = row.last_seen_at ?? row.created_at;
    return {
      id: row.id,
      role: row.role as DemoRole,
      displayName: row.display_name,
      createdAt: row.created_at.toISOString(),
      lastSeenAt: row.last_seen_at?.toISOString() ?? null,
      expiresAt: new Date(
        base.getTime() + settings.ttlDays * DAY_MS,
      ).toISOString(),
    };
  }

  private async toAdminDtos(
    rows: DemoAccount[],
    settings: DemoProgramSettings,
  ): Promise<AdminDemoAccountDto[]> {
    const ids = [
      ...new Set(
        rows
          .flatMap((r) => [r.created_by_user_id, r.created_by_admin_id])
          .filter((v): v is string => !!v),
      ),
    ];
    const people = ids.length
      ? await this.real.user.findMany({
          where: { id: { in: ids } },
          select: { id: true, first_name: true, last_name: true },
        })
      : [];
    const nameOf = (id: string): string => {
      const u = people.find((x) => x.id === id);
      return [u?.first_name, u?.last_name].filter(Boolean).join(' ') || '—';
    };
    return rows.map((r) => ({
      ...this.toDto(r, settings),
      createdBy: r.created_by_user_id
        ? {
            kind: 'partner' as const,
            userId: r.created_by_user_id,
            name: nameOf(r.created_by_user_id),
          }
        : {
            kind: 'admin' as const,
            userId: r.created_by_admin_id,
            name: r.created_by_admin_id
              ? nameOf(r.created_by_admin_id)
              : 'LawBid',
          },
      label: r.label,
      hasInvite:
        !!r.invite_code_hash &&
        (!r.invite_expires_at || r.invite_expires_at.getTime() > Date.now()),
      inviteExpiresAt: r.invite_expires_at?.toISOString() ?? null,
    }));
  }

  private async audit(
    admin: AdminActor,
    action: string,
    targetId: string | null,
    after: Record<string, unknown> | DemoProgramSettings,
  ): Promise<void> {
    await this.real.auditLog
      .create({
        data: {
          admin_id: admin.id,
          action,
          target_type: targetId ? 'demo_account' : 'demo',
          target_id: targetId,
          justification: null,
          after: after as unknown as Prisma.InputJsonValue,
          ip: admin.ip,
        },
      })
      .catch((e: unknown) => this.logger.warn({ err: e }, 'demo audit failed'));
  }
}

export function hashCode(code: string): string {
  return createHash('sha256')
    .update(code.replace(/[\s-]/g, '').toUpperCase())
    .digest('hex');
}

export function generateInviteCode(): string {
  let out = '';
  for (let i = 0; i < DEMO_INVITE_LENGTH; i += 1) {
    out += DEMO_INVITE_ALPHABET[randomInt(DEMO_INVITE_ALPHABET.length)];
  }
  return out;
}
