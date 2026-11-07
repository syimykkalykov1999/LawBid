import {
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AppSettingsService } from '../../../common/app-settings/app-settings.service';
import { demoContext } from '../../../common/demo/demo-context';
import { ErrorCode } from '../../../common/errors/error-code.enum';
import { PrismaService } from '../../../prisma/prisma.service';
import { withTxRetry } from '../../../prisma/tx-retry.util';
import { forEachDatabase } from '../../../sharding/for-each-database';
import {
  AUTH_EVENT_TYPES,
  AuthEventService,
  SessionRevocationService,
  type RequestMeta,
} from '../../auth/auth.public';
import { FeatureFlagsService } from '../../feature-flags/feature-flags.public';
import { EntitlementsService } from '../../plans/entitlements.service';
import { OnboardingService, type MeView } from './onboarding.service';

export type SwitchableRole = 'client' | 'attorney';

/** What must be finished in the current profile before switching. */
export type RoleSwitchBlocker =
  | 'active_cases'
  | 'active_bids'
  | 'open_disputes'
  | 'upcoming_consultations'
  | 'paid_subscription'
  | 'assistants'
  | 'firm';

export const ROLE_SWITCH_FLAG = 'role_switch';
const DAY_MS = 24 * 60 * 60 * 1000;

/** A case that is not finished yet (closed / archived are finished). */
const LIVE_CASE = [
  'open',
  'in_progress',
  'pending_completion',
  'disputed',
] as const;

export interface RoleSwitchPreview {
  from: SwitchableRole;
  to: SwitchableRole;
  allowed: boolean;
  blockers: RoleSwitchBlocker[];
  /** The other profile is missing or unfinished: after the switch the app
   * opens the usual onboarding (and the attorney verification). */
  needsOnboarding: boolean;
  /** Seconds until the daily limit lets another switch through; 0 = now. */
  retryAfterSeconds: number;
}

/**
 * Owner 2026-11-05 (Settings → Account «Сменить профиль»; decision
 * confirmed by the owner 05.11): one account — same phone, same password,
 * no SMS — switches between the attorney and the client profile.
 *
 * - Both profiles are KEPT; only `users.role` (the active profile) changes.
 *   Search, feed, the public profile and the directory already list only
 *   `role = 'attorney'`, so an attorney profile is hidden while the client
 *   profile is active and comes back, with its verification, on the way
 *   back.
 * - The other profile missing or unfinished → onboarding reopens at the
 *   profile step (attorney: the usual licence + verification; until the
 *   admin approves, attorney features stay closed as for any unverified
 *   attorney — nothing is copied or skipped).
 * - Blocked while the current profile has live work: unfinished cases,
 *   active / accepted bids, open disputes, upcoming consultations, a paid
 *   subscription of either side (Stripe; none exist while payments are
 *   off), assistants on the attorney's team, or membership in a firm. An
 *   assistant account never switches.
 * - Confirmed with the account password or a passkey (X-Reauth-Token, no
 *   SMS path in the app); at most `account.role_switch_per_day` switches
 *   per 24 h; every switch is an auth event (admin user card) and ends the
 *   account's other sessions (their tokens carry the old role), the
 *   caller refreshes its own token.
 * - Behind the `role_switch` flag (on by default): 404 while off.
 */
@Injectable()
export class RoleSwitchService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly onboarding: OnboardingService,
    private readonly events: AuthEventService,
    private readonly revocation: SessionRevocationService,
    private readonly flags: FeatureFlagsService,
    private readonly settings: AppSettingsService,
    private readonly entitlements: EntitlementsService,
  ) {}

  /** 404 while the admin switch is off: the route does not exist yet. */
  async assertEnabled(): Promise<void> {
    if (!(await this.flags.isEnabled(ROLE_SWITCH_FLAG, true))) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'Not found.',
      });
    }
  }

  async preview(userId: string): Promise<RoleSwitchPreview> {
    const from = await this.currentRole(userId);
    const to = other(from);
    const [blockers, retryAfterSeconds, needsOnboarding] = await Promise.all([
      this.blockers(userId, from),
      this.retryAfter(userId),
      this.needsOnboarding(userId, to),
    ]);
    return {
      from,
      to,
      allowed: blockers.length === 0 && retryAfterSeconds === 0,
      blockers,
      needsOnboarding,
      retryAfterSeconds,
    };
  }

  /** The switch itself. The caller has already consumed a reauth token. */
  async switchTo(
    userId: string,
    to: SwitchableRole,
    meta: RequestMeta & { sessionChainId?: string },
  ): Promise<MeView> {
    const from = await this.currentRole(userId);
    if (from === to) return this.onboarding.getMe(userId);
    const blockers = await this.blockers(userId, from);
    if (blockers.length > 0) throw blocked(blockers);
    const retryAfterSeconds = await this.retryAfter(userId);
    if (retryAfterSeconds > 0) {
      throw new HttpException(
        {
          code: ErrorCode.RATE_LIMITED,
          message: 'The profile was switched too often. Try again later.',
          details: { retryAfterSeconds },
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    await this.apply(userId, from, to, meta, AUTH_EVENT_TYPES.ROLE_SWITCHED);
    await this.revocation.revokeOtherChainsForUser(
      userId,
      meta.sessionChainId,
      'role_switched',
    );
    return this.settleOnboarding(userId);
  }

  /**
   * The onboarding role screen of an account that has switched before
   * (`POST /users/me/role` while the new profile's onboarding is not
   * finished): picking the other role goes back WITHOUT deleting anything
   * (the first-time picker drops the half-made profile; here that would
   * be a finished profile). Returns false when the normal picker applies.
   */
  async pickDuringOnboarding(
    userId: string,
    role: 'client' | 'attorney' | 'assistant',
    meta: RequestMeta,
  ): Promise<boolean> {
    if (role === 'assistant') return false;
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        role: true,
        onboarding_state: { select: { completed_at: true } },
      },
    });
    if (
      !user ||
      (user.role !== 'client' && user.role !== 'attorney') ||
      user.role === role ||
      user.onboarding_state?.completed_at
    ) {
      return false;
    }
    const switched = await this.prisma.authEvent.findFirst({
      where: {
        user_id: userId,
        event_type: AUTH_EVENT_TYPES.ROLE_SWITCHED,
        success: true,
      },
      select: { id: true },
    });
    if (!switched) return false;
    const blockers = await this.blockers(userId, user.role);
    if (blockers.length > 0) throw blocked(blockers);
    await this.apply(
      userId,
      user.role,
      role,
      meta,
      AUTH_EVENT_TYPES.ROLE_SWITCH_REVERTED,
    );
    await this.settleOnboarding(userId);
    return true;
  }

  private async currentRole(userId: string): Promise<SwitchableRole> {
    if (demoContext.isDemo()) throw notAllowed('Demo accounts cannot switch.');
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { role: true, status: true, deleted_at: true },
    });
    if (!user) {
      throw new NotFoundException({ code: ErrorCode.NOT_FOUND });
    }
    if (user.status !== 'active' || user.deleted_at !== null) {
      throw notAllowed('This account cannot switch profiles.');
    }
    if (user.role !== 'client' && user.role !== 'attorney') {
      // An assistant works inside an attorney's account; no role yet =
      // onboarding, which has its own role screen.
      throw notAllowed('Only a client or an attorney can switch profiles.');
    }
    return user.role;
  }

  /** Live work of the profile being LEFT (case data lives on the case
   * shards: counted database by database). */
  async blockers(
    userId: string,
    from: SwitchableRole,
  ): Promise<RoleSwitchBlocker[]> {
    const now = new Date();
    const perDb = await forEachDatabase(this.prisma, async () => {
      const [cases, accepted, bids, disputes, consultations] =
        await Promise.all([
          from === 'client'
            ? this.prisma.case.count({
                where: {
                  client_id: userId,
                  deleted_at: null,
                  status: { in: [...LIVE_CASE] },
                },
              })
            : Promise.resolve(0),
          from === 'attorney'
            ? this.prisma.bid.count({
                where: {
                  attorney_id: userId,
                  status: 'accepted',
                  case: { status: { in: [...LIVE_CASE] } },
                },
              })
            : Promise.resolve(0),
          from === 'attorney'
            ? this.prisma.bid.count({
                where: {
                  attorney_id: userId,
                  status: 'active',
                  case: { status: { in: [...LIVE_CASE] } },
                },
              })
            : Promise.resolve(0),
          this.prisma.caseDispute.count({
            where: { opened_by: userId, status: 'open' },
          }),
          this.prisma.consultation.count({
            where: {
              ...(from === 'client'
                ? { client_id: userId }
                : { attorney_id: userId }),
              status: { in: ['pending', 'confirmed'] },
              ends_at: { gt: now },
            },
          }),
        ]);
      return { cases: cases + accepted, bids, disputes, consultations };
    });
    const sum = (k: 'cases' | 'bids' | 'disputes' | 'consultations') =>
      perDb.reduce((n, r) => n + r[k], 0);
    const out: RoleSwitchBlocker[] = [];
    if (sum('cases') > 0) out.push('active_cases');
    if (sum('bids') > 0) out.push('active_bids');
    if (sum('disputes') > 0) out.push('open_disputes');
    if (sum('consultations') > 0) out.push('upcoming_consultations');
    if (from === 'client') {
      const paid = await this.prisma.clientSubscription.findUnique({
        where: { user_id: userId },
        select: {
          status: true,
          stripe_subscription_id: true,
          cancel_at_period_end: true,
        },
      });
      if (paidAndRenewing(paid)) out.push('paid_subscription');
    }
    if (from === 'attorney') {
      const [subscription, assistants, firm] = await Promise.all([
        this.prisma.subscription.findUnique({
          where: { user_id: userId },
          select: {
            status: true,
            stripe_subscription_id: true,
            cancel_at_period_end: true,
          },
        }),
        this.prisma.assistantMembership.count({
          where: { attorney_id: userId, status: { in: ['invited', 'active'] } },
        }),
        this.prisma.firmMember.count({
          where: { attorney_id: userId, status: 'active' },
        }),
      ]);
      if (paidAndRenewing(subscription)) out.push('paid_subscription');
      if (assistants > 0) out.push('assistants');
      if (firm > 0) out.push('firm');
    }
    return out;
  }

  /** 0 when another switch is allowed now. */
  private async retryAfter(userId: string): Promise<number> {
    const limit = Math.max(
      1,
      Math.floor(await this.settings.number('account.role_switch_per_day')),
    );
    const since = new Date(Date.now() - DAY_MS);
    const recent = await this.prisma.authEvent.findMany({
      where: {
        user_id: userId,
        event_type: AUTH_EVENT_TYPES.ROLE_SWITCHED,
        success: true,
        created_at: { gt: since },
      },
      orderBy: { created_at: 'desc' },
      take: limit,
      select: { created_at: true },
    });
    if (recent.length < limit) return 0;
    const oldest = recent[recent.length - 1].created_at.getTime();
    return Math.max(1, Math.ceil((oldest + DAY_MS - Date.now()) / 1000));
  }

  private async needsOnboarding(
    userId: string,
    to: SwitchableRole,
  ): Promise<boolean> {
    const profile =
      to === 'client'
        ? await this.prisma.clientProfile.findUnique({
            where: { user_id: userId },
            select: { user_id: true },
          })
        : await this.prisma.attorneyProfile.findUnique({
            where: { user_id: userId },
            select: { user_id: true },
          });
    return profile === null;
  }

  private async apply(
    userId: string,
    from: SwitchableRole,
    to: SwitchableRole,
    meta: RequestMeta,
    eventType:
      | typeof AUTH_EVENT_TYPES.ROLE_SWITCHED
      | typeof AUTH_EVENT_TYPES.ROLE_SWITCH_REVERTED,
  ): Promise<void> {
    await withTxRetry(this.prisma, async (tx) => {
      // Compare-and-set: a second tap (or another device) that already
      // switched loses here instead of switching twice.
      const changed = await tx.user.updateMany({
        where: { id: userId, role: from },
        data: { role: to },
      });
      if (changed.count !== 1) {
        throw new ConflictException({
          code: ErrorCode.ROLE_ALREADY_SET,
          message: 'The profile has just been switched.',
        });
      }
      await this.events.record(
        {
          userId,
          eventType,
          success: true,
          ip: meta.ip,
          userAgent: meta.userAgent,
          meta: { from, to },
        },
        tx,
      );
    });
    // What the plan allows is computed per role and cached for a minute.
    await this.entitlements.invalidateUser(userId);
  }

  /** The new profile complete → onboarding stays (or becomes) finished;
   * otherwise it reopens at the profile step and the app's guard leads
   * the person through the usual screens of that role. */
  private async settleOnboarding(userId: string): Promise<MeView> {
    const me = await this.onboarding.getMe(userId);
    const unfinished = me.missing.filter((m) => m !== 'consents');
    if (unfinished.length > 0) {
      await this.prisma.onboardingState.upsert({
        where: { user_id: userId },
        create: { user_id: userId, current_step: 'profile' },
        update: { current_step: 'profile', completed_at: null },
      });
      return this.onboarding.getMe(userId);
    }
    if (me.onboarding.completedAt === null) {
      await this.prisma.onboardingState.upsert({
        where: { user_id: userId },
        create: {
          user_id: userId,
          current_step: 'tour',
          completed_at: new Date(),
        },
        update: { completed_at: new Date() },
      });
      return this.onboarding.getMe(userId);
    }
    return me;
  }
}

/** A paid plan renews on the profile being left; cancelling it (it then
 * runs to the end of the period) unblocks. Trials and free plans without a
 * Stripe subscription never block (payments are off today). */
function paidAndRenewing(
  row: {
    status: string;
    stripe_subscription_id: string | null;
    cancel_at_period_end: boolean;
  } | null,
): boolean {
  return (
    row !== null &&
    row.stripe_subscription_id !== null &&
    ['active', 'trialing', 'past_due'].includes(row.status) &&
    !row.cancel_at_period_end
  );
}

function other(role: SwitchableRole): SwitchableRole {
  return role === 'client' ? 'attorney' : 'client';
}

function notAllowed(message: string): ForbiddenException {
  return new ForbiddenException({
    code: ErrorCode.ROLE_SWITCH_NOT_ALLOWED,
    message,
  });
}

function blocked(blockers: RoleSwitchBlocker[]): ConflictException {
  return new ConflictException({
    code: ErrorCode.ROLE_SWITCH_BLOCKED,
    message: 'Finish the current work of this profile first.',
    details: { blockers },
  });
}
