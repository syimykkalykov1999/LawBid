import { ConfigService } from '@nestjs/config';
import { attorneyPublicUrl } from '../../../common/utils/public-urls';
import { AttorneyAdvertisingService } from '../../countries/attorney-advertising.service';
import { AttorneyAdsService } from '../../attorney-ads/attorney-ads.service';
import { UsernamePolicyService } from '../../usernames/username-policy.service';
import { AttorneyStatsDto } from '../dto/attorney-stats.dto';
import {
  HttpException,
  HttpStatus,
  Injectable,
  OnApplicationShutdown,
  Optional,
} from '@nestjs/common';
import { WriteBehindCounter } from '../../../common/batch/write-behind-counter';
import { PrivacySettingsService } from '../../privacy-settings/privacy-settings.service';
import { ConsultationsService } from '../../consultations/consultations.service';
import { Prisma } from '@prisma/client';
import { CounterAggregator } from '../../counters/counter-aggregator.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { weakEtag } from '../../../common/sync/cheap-etag';

/** The public profile ETag rotates at least this often (see publicEtag). */
export const PUBLIC_PROFILE_ETAG_BUCKET_MS = 600_000;
import { withTxRetry } from '../../../prisma/tx-retry.util';
import { AppSettingsService } from '../../../common/app-settings/app-settings.service';
import { ErrorCode } from '../../../common/errors/error-code.enum';
import { startNameRecheckIfVerified } from '../../users/services/attorney-name-recheck';
import { isValidUsername } from '../../users/services/username.util';
import { UsernameRegistry } from '../../users/services/username-registry.service';
import { BlocksService } from '../../blocks/blocks.service';
import type {
  OwnAttorneyProfileDto,
  PublicAttorneyProfileDto,
  UpdateAttorneyProfileDto,
  UsernameAvailabilityDto,
} from '../dto/attorney-profile.dto';
import { FilesService } from '../../files/files.service';
import { PracticeAreasService } from './practice-areas.service';
import { notFound, requireOwnAttorney } from './profile-access';

const DAY_MS = 24 * 60 * 60 * 1000;

/** OQ-030: the firm list, falling back to the legacy single column. */
function firmsOf(row: {
  firm_name: string | null;
  firm_names?: string[];
}): string[] {
  if (row.firm_names && row.firm_names.length > 0) return row.firm_names;
  return row.firm_name ? [row.firm_name] : [];
}

/** When a username changed at [changedAt] may change again, or null if
 * it may change now (never changed = the onboarding-generated one). */
export function nextUsernameChangeAt(
  changedAt: Date | null,
  cooldownDays: number,
  now: Date,
): Date | null {
  if (!changedAt || cooldownDays <= 0) return null;
  const next = new Date(changedAt.getTime() + cooldownDays * DAY_MS);
  return next > now ? next : null;
}

function usernameError(
  code: ErrorCode,
  status: HttpStatus,
  message: string,
  details?: Record<string, unknown>,
): HttpException {
  return new HttpException({ code, message, details }, status);
}

const LICENSE_SELECT = {
  id: true,
  state_code: true,
  bar_number: true,
  license_status: true,
  expires_at: true,
  rejection_code: true,
  state: { select: { code: true, name: true } },
} satisfies Prisma.AttorneyLicenseSelect;

/**
 * Attorney profile (docs/03 §4): the own editable profile, the public
 * profile by @username and the username availability check.
 *
 * Privacy (§6.2): the public view is built field by field from a
 * narrow select — bar numbers, documents and contacts are never read for
 * it, so they cannot leak through a later refactor of the DTO.
 */
@Injectable()
export class AttorneyProfilesService implements OnApplicationShutdown {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: AppSettingsService,
    private readonly practices: PracticeAreasService,
    private readonly files: FilesService,
    private readonly counters: CounterAggregator,
    private readonly usernames: UsernameRegistry,
    private readonly blocks: BlocksService,
    // Owner 2026-10-20: who sees my photo and "about".
    @Optional() private readonly privacy?: PrivacySettingsService,
    @Optional() private readonly consultations?: ConsultationsService,
    private readonly policy: UsernamePolicyService = undefined as never,
    // Owner 2026-10-22 (audit #4 §5, §9): the advertising label and the
    // canonical public link.
    @Optional() private readonly advertising?: AttorneyAdvertisingService,
    @Optional() private readonly config?: ConfigService,
    // Owner 2026-10-28: ad-text checker + archive for the bio.
    @Optional() private readonly ads?: AttorneyAdsService,
  ) {}

  /** «Attorney Advertising» for an attorney licensed in [stateCodes]. */
  private async labelFor(
    attorneyId: string,
    stateCodes: Iterable<string>,
  ): Promise<boolean> {
    return (await this.advertising?.labelFor(attorneyId, stateCodes)) ?? false;
  }

  /** The per-state results disclaimer under the bio (owner 2026-10-28). */
  private async disclaimerFor(
    attorneyId: string,
    bio: string | null,
  ): Promise<string | null> {
    if (!this.advertising || !bio) return null;
    return this.advertising.disclaimerFor(
      await this.advertising.resultsDisclaimers([attorneyId]),
      attorneyId,
      bio,
    );
  }

  private publicUrl(username: string): string {
    return attorneyPublicUrl(
      username,
      this.config?.get<string>('APP_LINK_BASE_URL'),
    );
  }

  async getOwn(
    userId: string,
    now = new Date(),
  ): Promise<OwnAttorneyProfileDto> {
    await requireOwnAttorney(this.prisma, userId);
    const row = await this.prisma.attorneyProfile.findUnique({
      where: { user_id: userId },
      include: {
        user: { select: { first_name: true, last_name: true } },
        licenses: { select: LICENSE_SELECT, orderBy: { state_code: 'asc' } },
      },
    });
    if (!row) throw notFound();
    const cooldown = await this.settings.number(
      'profile.username_change_cooldown_days',
    );
    const next = nextUsernameChangeAt(row.username_changed_at, cooldown, now);
    // Owner 2026-10-07: the own profile showed «1 Посты» next to three
    // posts — it read the stored counters only. Like the public profile,
    // add the deltas not yet flushed (docs/05 §4–§6).
    const [pPosts, pFollowers, pFollowing] = await Promise.all([
      this.counters.pending('attorney', 'posts_count', [userId]),
      this.counters.pending('attorney', 'followers_count', [userId]),
      this.counters.pending('attorney', 'following_count', [userId]),
    ]);
    const plus = (base: number, m: Map<string, number>) =>
      Math.max(0, base + (m.get(userId) ?? 0));
    return {
      id: row.user_id,
      username: row.username,
      firstName: row.user.first_name,
      lastName: row.user.last_name,
      bio: row.bio,
      firmName: row.firm_name,
      firms: firmsOf(row),
      languages: row.languages,
      verificationStatus: row.verification_status,
      // Owner 2026-10-05: the blue check follows the trust level
      // (AttorneyTrustService keeps attorney_profiles.trust_badge).
      verifiedBadge: row.trust_badge,
      advertisingLabel: await this.labelFor(
        row.user_id,
        row.licenses
          .filter((l) => l.license_status === 'verified')
          .map((l) => l.state_code),
      ),
      advertisingDisclaimer: await this.disclaimerFor(row.user_id, row.bio),
      publicUrl: this.publicUrl(row.username),
      trustLevel: row.trust_level,
      nameMismatch: row.name_mismatch,
      usernameChangedAt: row.username_changed_at?.toISOString() ?? null,
      usernameNextChangeAt: next?.toISOString() ?? null,
      licenses: row.licenses.map((l) => ({
        id: l.id,
        state: { code: l.state.code, name: l.state.name },
        barNumber: l.bar_number,
        status: l.license_status,
        expiresAt: l.expires_at?.toISOString().slice(0, 10) ?? null,
        rejectionCode: l.rejection_code,
      })),
      rating: { avg: Number(row.rating_avg), count: row.rating_count },
      counters: {
        posts: plus(row.posts_count, pPosts),
        followers: plus(row.followers_count, pFollowers),
        following: plus(row.following_count, pFollowing),
      },
    };
  }

  /**
   * PATCH /attorneys/me/profile. One transaction: names on users, the
   * profile fields, and — for a changed name of a verified attorney — the
   * §4.1 re-check (profile → pending + verifier queue request).
   * Username: cooldown (profile.username_change_cooldown_days, 409
   * USERNAME_CHANGE_TOO_SOON), reserved list (400 USERNAME_RESERVED),
   * case-insensitive uniqueness (409 USERNAME_TAKEN). The username
   * generated at onboarding counts as never changed.
   */
  async updateOwn(
    userId: string,
    dto: UpdateAttorneyProfileDto,
    now = new Date(),
  ): Promise<OwnAttorneyProfileDto> {
    await requireOwnAttorney(this.prisma, userId);
    const cooldownDays = await this.settings.number(
      'profile.username_change_cooldown_days',
    );
    // Owner 2026-10-28: the bio is attorney advertising — checked per the
    // attorney's states (off by default).
    if (dto.bio) await this.ads?.enforce(userId, [dto.bio]);

    try {
      await withTxRetry(this.prisma, async (tx) => {
        const current = await tx.attorneyProfile.findUnique({
          where: { user_id: userId },
          include: { user: { select: { first_name: true, last_name: true } } },
        });
        if (!current) throw notFound();

        const data: Prisma.AttorneyProfileUpdateInput = {
          ...(dto.bio !== undefined && { bio: dto.bio || null }),
          ...(dto.firmName !== undefined &&
            dto.firms === undefined && {
              firm_name: dto.firmName || null,
              firm_names: dto.firmName ? [dto.firmName] : [],
            }),
          // OQ-030: the list wins; firm_name mirrors the first entry.
          ...(dto.firms !== undefined && {
            firm_names: dto.firms,
            firm_name: dto.firms[0] ?? null,
          }),
          ...(dto.languages !== undefined && { languages: dto.languages }),
        };

        if (dto.username !== undefined && dto.username !== current.username) {
          const lower = dto.username.toLowerCase();
          const next = nextUsernameChangeAt(
            current.username_changed_at,
            cooldownDays,
            now,
          );
          if (next) {
            throw usernameError(
              ErrorCode.USERNAME_CHANGE_TOO_SOON,
              HttpStatus.CONFLICT,
              'Username can be changed once per cooldown period.',
              { nextChangeAt: next.toISOString(), cooldownDays },
            );
          }
          if (await this.usernames.isReserved(lower)) {
            throw usernameError(
              ErrorCode.USERNAME_RESERVED,
              HttpStatus.BAD_REQUEST,
              'This username is reserved.',
            );
          }
          // OQ-026: one namespace with client usernames.
          if (
            lower !== current.username_lower &&
            (await this.usernames.isTaken(tx, lower, userId))
          ) {
            throw usernameTaken();
          }
          // Owner 2026-10-20: freed lately by someone else, or reads like a
          // known handle.
          if (
            lower !== current.username_lower &&
            (await this.usernames.blocker(tx, lower, userId))
          ) {
            throw usernameTaken();
          }
          data.username = dto.username;
          data.username_lower = lower;
          data.username_changed_at = now;
        }

        if (dto.firstName !== undefined || dto.lastName !== undefined) {
          const after = await tx.user.update({
            where: { id: userId },
            data: { first_name: dto.firstName, last_name: dto.lastName },
            select: { first_name: true, last_name: true },
          });
          await startNameRecheckIfVerified(tx, userId, current.user, after);
        }

        if (Object.keys(data).length > 0) {
          await tx.attorneyProfile.update({
            where: { user_id: userId },
            data,
          });
        }
      });
    } catch (error) {
      // A concurrent request took the same username_lower after our read.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw usernameTaken();
      }
      throw error;
    }
    if (dto.bio)
      await this.ads?.archive(userId, 'profile_bio', userId, dto.bio);
    return this.getOwn(userId, now);
  }

  /**
   * GET /attorneys/:username (docs/03 §4.2, §6). 404 NOT_FOUND for an
   * unknown or malformed username, a suspended profile ("Профиль
   * недоступен"), and an account that is not active (blocked, deletion
   * pending, deleted). Clients never have a username, so a client can
   * never be reached here. Unverified/pending/rejected profiles are shown
   * without the blue check.
   */
  /**
   * Load audit 6: one more open of the profile today (statistics only; never
   * blocks). Added up in memory and written as ONE multi-row upsert every
   * 10 s - a profile opened 1 000 times used to be 1 000 writes on one row.
   */
  private readonly views = new WriteBehindCounter(
    async (batch) => {
      const keys = [...batch.keys()].sort();
      const ids: string[] = [];
      const days: string[] = [];
      const counts: number[] = [];
      for (const k of keys) {
        const [id, day] = k.split('|');
        ids.push(id);
        days.push(day);
        counts.push(batch.get(k) ?? 0);
      }
      await this.prisma.$executeRaw`
        INSERT INTO attorney_profile_views (attorney_id, day, views)
        SELECT t.a, t.d::date, t.v
        FROM unnest(${ids}::uuid[], ${days}::text[], ${counts}::int[]) AS t(a, d, v)
        ON CONFLICT (attorney_id, day)
        DO UPDATE SET views = attorney_profile_views.views + EXCLUDED.views`;
    },
    { intervalMs: 10_000 },
  );

  private recordView(attorneyId: string): void {
    this.views.add(`${attorneyId}|${new Date().toISOString().slice(0, 10)}`);
  }

  async onApplicationShutdown(): Promise<void> {
    await this.views.stop();
  }

  /** The attorney's own numbers for the last 30 days (+ clients all time). */
  async stats(attorneyId: string): Promise<AttorneyStatsDto> {
    // Views are counted write-behind (one batch per 10 s); the owner asking
    // for their own numbers is rare, so write the waiting batch first and
    // the answer is exact.
    await this.views.flush();
    const since = new Date(Date.now() - 30 * 24 * 3600 * 1000);
    const [views, sent, accepted, clients] = await Promise.all([
      this.prisma.attorneyProfileView.aggregate({
        where: { attorney_id: attorneyId, day: { gte: since } },
        _sum: { views: true },
      }),
      this.prisma.bid.count({
        where: { attorney_id: attorneyId, created_at: { gte: since } },
      }),
      this.prisma.bid.count({
        where: {
          attorney_id: attorneyId,
          status: 'accepted',
          updated_at: { gte: since },
        },
      }),
      this.prisma.case.groupBy({
        by: ['client_id'],
        where: { accepted_bid: { attorney_id: attorneyId } },
      }),
    ]);
    return {
      profileViews30d: views._sum.views ?? 0,
      bidsSent30d: sent,
      bidsAccepted30d: accepted,
      clientsTotal: clients.length,
    };
  }

  /**
   * Owner 2026-10-22 (client economy plan, package D): the cheap ETag of
   * GET /attorneys/:username — one indexed read of the stamps and counters
   * that move when the public profile moves (profile and user rows,
   * counters incl. pending deltas, the viewer's follow), plus a 10-minute
   * bucket as a safety net for inputs outside those rows (a block, a
   * boost, the trust badge). Null when there is no such attorney (the
   * normal path answers 404).
   */
  async publicEtag(
    username: string,
    viewerId: string,
    now: number = Date.now(),
  ): Promise<string | null> {
    if (!isValidUsername(username)) return null;
    const rows = await this.prisma.$queryRaw<
      {
        user_id: string;
        updated_at: Date;
        user_updated_at: Date;
        posts_count: number;
        followers_count: number;
        rating_count: number;
        verification_status: string;
        trust_level: string | null;
        following: boolean;
      }[]
    >`
      SELECT ap.user_id, ap.updated_at, u.updated_at AS user_updated_at,
             ap.posts_count, ap.followers_count, ap.rating_count,
             ap.verification_status::TEXT AS verification_status,
             ap.trust_level::TEXT AS trust_level,
             EXISTS (SELECT 1 FROM follows f
                     WHERE f.follower_id = ${viewerId}::UUID
                       AND f.followee_id = ap.user_id) AS following
      FROM attorney_profiles ap
      JOIN users u ON u.id = ap.user_id
      WHERE ap.username_lower = ${username.toLowerCase()}
      LIMIT 1`;
    const r = rows[0];
    if (!r) return null;
    const [posts, followers] = await Promise.all([
      this.counters.pending('attorney', 'posts_count', [r.user_id]),
      this.counters.pending('attorney', 'followers_count', [r.user_id]),
    ]);
    return weakEtag(
      'att',
      r.updated_at,
      r.user_updated_at,
      r.posts_count + (posts.get(r.user_id) ?? 0),
      r.followers_count + (followers.get(r.user_id) ?? 0),
      r.rating_count,
      r.verification_status,
      r.trust_level,
      r.following ? 1 : 0,
      Math.floor(now / PUBLIC_PROFILE_ETAG_BUCKET_MS),
    );
  }

  async getPublic(
    username: string,
    viewerId: string,
  ): Promise<PublicAttorneyProfileDto> {
    if (!isValidUsername(username)) throw notFound();
    const row = await this.prisma.attorneyProfile.findUnique({
      where: { username_lower: username.toLowerCase() },
      select: {
        user_id: true,
        username: true,
        bio: true,
        firm_name: true,
        firm_names: true,
        languages: true,
        verification_status: true,
        name_mismatch: true,
        trust_level: true,
        trust_badge: true,
        rating_avg: true,
        rating_count: true,
        posts_count: true,
        followers_count: true,
        following_count: true,
        user: {
          select: {
            role: true,
            status: true,
            deleted_at: true,
            first_name: true,
            last_name: true,
            avatar_file_id: true,
          },
        },
        licenses: {
          where: { license_status: 'verified' },
          select: { state: { select: { code: true, name: true } } },
          orderBy: { state_code: 'asc' },
        },
      },
    });
    if (
      !row ||
      row.verification_status === 'suspended' ||
      row.user.role !== 'attorney' ||
      row.user.status !== 'active' ||
      row.user.deleted_at !== null
    ) {
      throw notFound('Profile is unavailable.');
    }
    if (row.user_id !== viewerId) this.recordView(row.user_id);
    const states = new Map<string, string>();
    for (const l of row.licenses) states.set(l.state.code, l.state.name);
    // Public photo only (a clean `avatar` file); documents never.
    const [
      avatar,
      practiceAreas,
      follow,
      pPosts,
      pFollowers,
      pFollowing,
      membership,
    ] = await Promise.all([
      this.files.avatarUrls(row.user.avatar_file_id),
      this.practices.selectedOf(row.user_id),
      this.prisma.follow.findUnique({
        where: {
          follower_id_followee_id: {
            follower_id: viewerId,
            followee_id: row.user_id,
          },
        },
        select: { follower_id: true },
      }),
      // docs/05 §4–§6: counters shown = DB + not yet flushed deltas.
      this.counters.pending('attorney', 'posts_count', [row.user_id]),
      this.counters.pending('attorney', 'followers_count', [row.user_id]),
      this.counters.pending('attorney', 'following_count', [row.user_id]),
      this.prisma.firmMember.findFirst({
        where: { attorney_id: row.user_id, status: 'active' },
        select: { firm: { select: { id: true, name: true } } },
      }),
    ]);
    const plus = (base: number, m: Map<string, number>) =>
      Math.max(0, base + (m.get(row.user_id) ?? 0));
    const [photoOk, aboutOk] = this.privacy
      ? await Promise.all([
          this.privacy.visibleTo(viewerId, [row.user_id], 'photo_from'),
          this.privacy.visibleTo(viewerId, [row.user_id], 'about_from'),
        ])
      : [new Set([row.user_id]), new Set([row.user_id])];
    return {
      id: row.user_id,
      username: row.username,
      firstName: row.user.first_name,
      lastName: row.user.last_name,
      bio: aboutOk.has(row.user_id) ? row.bio : null,
      firmName: row.firm_name,
      firms: firmsOf(row),
      firm: membership?.firm ?? null,
      avatarUrl: photoOk.has(row.user_id) ? avatar.url : null,
      avatarUrl256: photoOk.has(row.user_id) ? avatar.url256 : null,
      languages: row.languages,
      verifiedBadge: row.trust_badge,
      advertisingLabel: await this.labelFor(row.user_id, states.keys()),
      sponsored:
        (await this.advertising?.sponsored([row.user_id]))?.has(row.user_id) ??
        false,
      advertisingDisclaimer: aboutOk.has(row.user_id)
        ? await this.disclaimerFor(row.user_id, row.bio)
        : null,
      publicUrl: this.publicUrl(row.username),
      trustLevel: row.trust_level,
      licensedStates: [...states].map(([code, name]) => ({ code, name })),
      practiceAreas,
      qa: await this.qaStats(row.user_id),
      rating: { avg: Number(row.rating_avg), count: row.rating_count },
      counters: {
        posts: plus(row.posts_count, pPosts),
        followers: plus(row.followers_count, pFollowers),
        following: plus(row.following_count, pFollowing),
      },
      isSelf: row.user_id === viewerId,
      isFollowing: follow !== null,
      consultationEnabled:
        row.user_id !== viewerId &&
        ((await this.consultations?.isBookable(row.user_id)) ?? false),
      ...(await this.blocks.relation(viewerId, row.user_id)),
    };
  }

  /** Owner 2026-10-20: «Ответов / лучших» in «Вопрос юристу». */
  private async qaStats(
    attorneyId: string,
  ): Promise<{ answers: number; best: number }> {
    const where = {
      attorney_id: attorneyId,
      status: 'published' as const,
      deleted_at: null,
    };
    const [answers, best] = await Promise.all([
      this.prisma.legalAnswer.count({ where }),
      this.prisma.legalAnswer.count({ where: { ...where, is_best: true } }),
    ]);
    return { answers, best };
  }

  /** GET /attorneys/username-available?u= — the shared @username verdict
   * (format, reserved and brand look-alikes, one namespace with clients,
   * channels and groups, held, look-alikes). The caller's own current
   * username is reported available. Reveals nothing but "is this handle
   * free". */
  async availability(
    username: string,
    viewerId: string,
    name: { first?: string; last?: string } = {},
  ): Promise<UsernameAvailabilityDto> {
    const verdict = await this.policy.check(
      username,
      'user',
      { userId: viewerId },
      { firstName: name.first, lastName: name.last },
    );
    return {
      username,
      available: verdict.available,
      reason: verdict.reason,
      suggestions: verdict.suggestions,
    };
  }

  /** GET /attorneys/username-suggestions — up to 5 free handles from the
   * typed text and the name (the saved name when the form sends none). */
  async suggestions(
    viewerId: string,
    seeds: { first?: string; last?: string; typed?: string },
  ): Promise<string[]> {
    let { first, last } = seeds;
    if (!first && !last) {
      const user = await this.prisma.user.findUnique({
        where: { id: viewerId },
        select: { first_name: true, last_name: true },
      });
      first = user?.first_name ?? undefined;
      last = user?.last_name ?? undefined;
    }
    return this.usernames.suggest(
      this.prisma,
      { firstName: first, lastName: last, typed: seeds.typed },
      viewerId,
    );
  }
}

function usernameTaken(): HttpException {
  return usernameError(
    ErrorCode.USERNAME_TAKEN,
    HttpStatus.CONFLICT,
    'This username is already taken.',
  );
}
