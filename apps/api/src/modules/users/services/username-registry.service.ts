import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { AppSettingsService } from '../../../common/app-settings/app-settings.service';
import { ErrorCode } from '../../../common/errors/error-code.enum';
import { PrismaService } from '../../../prisma/prisma.service';
import { UsernamePolicyService } from '../../usernames/username-policy.service';
import {
  pickUsernameFrom,
  randomSuffixCandidates,
  sequentialCandidates,
  suggestionCandidates,
  type UsernameSeeds,
  usernameBase,
} from './username.util';

type Db = PrismaService | Prisma.TransactionClient;

/**
 * One @username namespace for attorneys AND clients (owner decision
 * 2026-09-29, OQ-026): a handle held by either role is taken for both, so
 * People search and @mentions resolve to exactly one account.
 *
 * Uniqueness inside each table is a DB constraint; across the two tables
 * it is checked here before every write (a concurrent cross-role race is
 * possible in theory and reported as USERNAME_TAKEN on the next edit).
 */
@Injectable()
export class UsernameRegistry {
  constructor(
    private readonly settings: AppSettingsService,
    private readonly policy: UsernamePolicyService,
  ) {}

  /** Lower-cased reserved handles (`profile.reserved_usernames`). */
  async reserved(): Promise<Set<string>> {
    const list = await this.settings.stringList('profile.reserved_usernames');
    return new Set(list.map((r) => r.toLowerCase()));
  }

  /**
   * Reserved words and look-alikes of them or of a brand (owner 2026-10-20),
   * for [lower].
   */
  isReserved(lower: string): Promise<boolean> {
    return this.policy.isReserved(lower);
  }

  /**
   * Owner 2026-10-20: why a free-looking [lower] still cannot be taken —
   * freed lately by someone else («held») or reading like another handle
   * («similar»); null when it can.
   */
  async blocker(
    db: Db,
    lower: string,
    exceptUserId?: string,
  ): Promise<'held' | 'similar' | null> {
    const held = await this.policy.heldAgainst(db, [lower], exceptUserId);
    if (held.has(lower)) return 'held';
    return (await this.policy.isSimilar(db, lower, { userId: exceptUserId }))
      ? 'similar'
      : null;
  }

  /**
   * Which of [lowers] are held by anyone other than [exceptUserId] — a
   * person, a channel or a group (one namespace, owner 2026-10-20).
   */
  async taken(
    db: Db,
    lowers: readonly string[],
    exceptUserId?: string,
  ): Promise<Set<string>> {
    return this.policy.takenBy(db, lowers, { userId: exceptUserId });
  }

  async isTaken(
    db: Db,
    lower: string,
    exceptUserId?: string,
  ): Promise<boolean> {
    return (await this.taken(db, [lower], exceptUserId)).has(lower);
  }

  /**
   * Owner 2026-10-18 ("как в инсте"): up to [count] free handles from the
   * typed text and the name, in offer order. One indexed IN query per
   * table over ~30 candidates; when the plain forms are all taken, one
   * window of random 5-digit suffixes tops the list up.
   */
  async suggest(
    db: Db,
    seeds: UsernameSeeds,
    exceptUserId?: string,
    count = 5,
    now: Date = new Date(),
  ): Promise<string[]> {
    const reserved = await this.reserved();
    const candidates = suggestionCandidates(seeds, now.getFullYear()).filter(
      (c) => !reserved.has(c),
    );
    if (candidates.length === 0) return [];
    const taken = await this.taken(db, candidates, exceptUserId);
    const free = candidates.filter((c) => !taken.has(c));
    if (free.length < count) {
      const extra = randomSuffixCandidates(candidates[0], 20).filter(
        (c) => !reserved.has(c) && !free.includes(c),
      );
      const extraTaken = await this.taken(db, extra, exceptUserId);
      free.push(...extra.filter((c) => !extraTaken.has(c)));
    }
    return free.slice(0, count);
  }

  /**
   * A free handle derived from the name. Bounded reads at any scale (a
   * hot name like "john.smith" can have thousands of holders): a window
   * of sequential candidates (base, base2 … base50) in one indexed IN
   * query per table, then windows of random 5-digit suffixes. Never
   * materializes the whole prefix set.
   */
  async allocate(
    db: Db,
    firstName: string | null,
    lastName: string | null,
    fallback: string,
    reserved?: ReadonlySet<string>,
  ): Promise<string> {
    const reservedSet = reserved ?? (await this.reserved());
    const base = usernameBase(firstName, lastName, fallback);
    const windows: string[][] = [
      [...sequentialCandidates(base, 50)],
      ...[0, 1, 2].map(() => randomSuffixCandidates(base, 20)),
    ];
    for (const window of windows) {
      const free = window.filter((c) => !reservedSet.has(c));
      if (free.length === 0) continue;
      const picked = pickUsernameFrom(free, await this.taken(db, free));
      if (picked) return picked;
    }
    // ~110 candidates all taken is practically impossible; answer
    // "try again" rather than looping without bound.
    throw new HttpException(
      {
        code: ErrorCode.INTERNAL_ERROR,
        message: 'Could not allocate a username, please retry.',
      },
      HttpStatus.SERVICE_UNAVAILABLE,
    );
  }
}
