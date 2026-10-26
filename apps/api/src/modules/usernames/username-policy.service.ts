import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { AppSettingsService } from '../../common/app-settings/app-settings.service';
import { ErrorCode } from '../../common/errors/error-code.enum';
import { PrismaService } from '../../prisma/prisma.service';
import { suggestionCandidates } from '../users/services/username.util';
import {
  editDistanceOne,
  handleSuggestions,
  isValidHandle,
  normalizeHandle,
  skeleton,
  type UsernameKind,
  withinOneEdit,
} from './username-rules';

type Db = PrismaService | Prisma.TransactionClient;

export type UsernameReason =
  'invalid' | 'reserved' | 'taken' | 'held' | 'similar';

export interface UsernameVerdict {
  username: string;
  available: boolean;
  reason: UsernameReason | null;
  suggestions: string[];
}

/** Who is asking: that owner's own handle is never «taken». */
export interface UsernameAsker {
  userId?: string;
  /** The channel or group being renamed. */
  owner?: { type: 'channel' | 'group'; id: string };
}

export interface UsernameSeeds {
  typed?: string | null;
  title?: string | null;
  firstName?: string | null;
  lastName?: string | null;
}

/**
 * Owner 2026-10-20 (Telegram): the one place that decides whether a @username
 * may be taken — by a person, a channel or a group. Order: format, reserved
 * and brand look-alikes, taken (any kind), held for its last owner, look-alike
 * of a taken handle (same skeleton) or one letter away from a big one.
 */
@Injectable()
export class UsernamePolicyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: AppSettingsService,
  ) {}

  async check(
    raw: string,
    kind: UsernameKind,
    asker: UsernameAsker = {},
    seeds: UsernameSeeds = {},
    db: Db = this.prisma,
  ): Promise<UsernameVerdict> {
    const lower = normalizeHandle(raw);
    const reason = await this.reasonFor(db, lower, kind, asker);
    return {
      username: lower,
      available: reason === null,
      reason,
      suggestions:
        reason === null
          ? []
          : await this.suggest(db, kind, asker, { ...seeds, typed: lower }),
    };
  }

  /**
   * The verdict as an HTTP error for a form that saves: 400 for a bad or
   * reserved handle, 409 [takenCode] for one that is taken, held or looks
   * like another (with ideas in `details.suggestions`). Returns the
   * normalized handle.
   */
  async assertAvailable(
    raw: string,
    kind: UsernameKind,
    asker: UsernameAsker,
    takenCode: ErrorCode,
    seeds: UsernameSeeds = {},
    db: Db = this.prisma,
  ): Promise<string> {
    const lower = normalizeHandle(raw);
    const reason = await this.reasonFor(db, lower, kind, asker);
    if (reason === null) return lower;
    if (reason === 'invalid') {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_ERROR,
        message: 'This @username has an invalid format.',
        details: { field: 'username', reason },
      });
    }
    if (reason === 'reserved') {
      throw new BadRequestException({
        code: ErrorCode.USERNAME_RESERVED,
        message: 'This @username is reserved.',
        details: { field: 'username', reason },
      });
    }
    throw new ConflictException({
      code: takenCode,
      message: 'This @username is taken.',
      details: {
        field: 'username',
        reason,
        suggestions: await this.suggest(db, kind, asker, {
          ...seeds,
          typed: lower,
        }),
      },
    });
  }

  /** When a handle changed at [changedAt] may change again; null = now. */
  async nextChangeAt(
    changedAt: Date | null,
    now: Date = new Date(),
  ): Promise<Date | null> {
    if (!changedAt) return null;
    const days = await this.settings.number(
      'profile.username_change_cooldown_days',
    );
    const next = new Date(changedAt.getTime() + days * 86_400_000);
    return next > now ? next : null;
  }

  /** null = free to take. */
  async reasonFor(
    db: Db,
    lower: string,
    kind: UsernameKind,
    asker: UsernameAsker = {},
  ): Promise<UsernameReason | null> {
    if (!isValidHandle(lower, kind)) return 'invalid';
    if (await this.isReserved(lower)) return 'reserved';
    const [taken, held, similar] = await Promise.all([
      this.takenBy(db, [lower], asker),
      this.heldAgainst(db, [lower], asker.userId),
      this.isSimilar(db, lower, asker),
    ]);
    if (taken.has(lower)) return 'taken';
    if (held.has(lower)) return 'held';
    return similar ? 'similar' : null;
  }

  /** Reserved words and look-alikes of them or of a known brand. */
  async isReserved(lower: string): Promise<boolean> {
    const [reserved, brands] = await Promise.all([
      this.settings.stringList('profile.reserved_usernames'),
      this.settings.stringList('profile.username_brand_list'),
    ]);
    const sk = skeleton(lower);
    if (reserved.some((r) => skeleton(r) === sk)) return true;
    return brands.some((b) => {
      const bs = skeleton(b);
      return sk === bs || (sk.length >= 5 && withinOneEdit(sk, bs));
    });
  }

  /** Handles of [lowers] that exist, except the asker's own. */
  async takenBy(
    db: Db,
    lowers: readonly string[],
    asker: UsernameAsker = {},
  ): Promise<Set<string>> {
    if (lowers.length === 0) return new Set();
    const rows = await db.username.findMany({
      where: { username_lower: { in: [...lowers] } },
    });
    return new Set(
      rows.filter((r) => !isOwn(r, asker)).map((r) => r.username_lower),
    );
  }

  /** Handles of [lowers] freed less than the hold time ago by someone else. */
  async heldAgainst(
    db: Db,
    lowers: readonly string[],
    userId?: string,
  ): Promise<Set<string>> {
    if (lowers.length === 0) return new Set();
    const days = await this.settings.number('profile.username_hold_days');
    const since = new Date(Date.now() - days * 86_400_000);
    const rows = await db.usernameHold.findMany({
      where: {
        username_lower: { in: [...lowers] },
        released_at: { gt: since },
      },
    });
    return new Set(
      rows
        .filter((r) => r.holder_user_id !== userId)
        .map((r) => r.username_lower),
    );
  }

  /** Same skeleton as another owner's handle, or one letter away from a
   * handle with a big audience. */
  async isSimilar(
    db: Db,
    lower: string,
    asker: UsernameAsker,
  ): Promise<boolean> {
    const sameLook = await db.username.findMany({
      where: { skeleton: skeleton(lower), username_lower: { not: lower } },
      take: 20,
    });
    if (sameLook.some((r) => !isOwn(r, asker))) return true;
    const near = await db.username.findMany({
      where: { username_lower: { in: editDistanceOne(lower) } },
      take: 200,
    });
    const others = near.filter((r) => !isOwn(r, asker));
    if (others.length === 0) return false;
    const min = await this.settings.number(
      'profile.username_similar_min_audience',
    );
    const audience = await this.audiences(db, others);
    return audience.some((n) => n >= min);
  }

  private async audiences(
    db: Db,
    rows: readonly { owner_type: string; owner_id: string }[],
  ): Promise<number[]> {
    const ids = (t: string) =>
      rows.filter((r) => r.owner_type === t).map((r) => r.owner_id);
    const [a, c, ch, g] = await Promise.all([
      db.attorneyProfile.findMany({
        where: { user_id: { in: ids('user') } },
        select: { followers_count: true },
      }),
      db.clientProfile.findMany({
        where: { user_id: { in: ids('user') } },
        select: { followers_count: true },
      }),
      db.channel.findMany({
        where: { id: { in: ids('channel') } },
        select: { subscriber_count: true },
      }),
      db.chatGroup.findMany({
        where: { id: { in: ids('group') } },
        select: { member_count: true },
      }),
    ]);
    return [
      ...a.map((x) => x.followers_count),
      ...c.map((x) => x.followers_count),
      ...ch.map((x) => x.subscriber_count),
      ...g.map((x) => x.member_count),
    ];
  }

  /**
   * Up to [count] handles that pass the cheap checks (format, reserved,
   * taken, held, same skeleton); the expensive look-alike query is left to
   * the final check when one is chosen.
   */
  async suggest(
    db: Db,
    kind: UsernameKind,
    asker: UsernameAsker,
    seeds: UsernameSeeds,
    count = 5,
  ): Promise<string[]> {
    const year = new Date().getFullYear();
    const pool =
      kind === 'user'
        ? suggestionCandidates(
            {
              firstName: seeds.firstName,
              lastName: seeds.lastName,
              typed: seeds.typed,
            },
            year,
          )
        : handleSuggestions([seeds.typed, seeds.title], year);
    const candidates = pool
      .map((c) => c.toLowerCase())
      .filter((c) => isValidHandle(c, kind))
      .slice(0, 40);
    if (candidates.length === 0) return [];
    const [taken, held, looks] = await Promise.all([
      this.takenBy(db, candidates, asker),
      this.heldAgainst(db, candidates, asker.userId),
      db.username.findMany({
        where: { skeleton: { in: candidates.map(skeleton) } },
      }),
    ]);
    const lookSkeletons = new Set(
      looks.filter((r) => !isOwn(r, asker)).map((r) => r.skeleton),
    );
    const out: string[] = [];
    for (const c of candidates) {
      if (taken.has(c) || held.has(c) || lookSkeletons.has(skeleton(c))) {
        continue;
      }
      if (await this.isReserved(c)) continue;
      out.push(c);
      if (out.length >= count) break;
    }
    return out;
  }
}

function isOwn(
  row: { owner_type: string; owner_id: string },
  asker: UsernameAsker,
): boolean {
  if (
    asker.userId &&
    row.owner_type === 'user' &&
    row.owner_id === asker.userId
  ) {
    return true;
  }
  return (
    !!asker.owner &&
    row.owner_type === asker.owner.type &&
    row.owner_id === asker.owner.id
  );
}
