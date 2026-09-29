import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { AppSettingsService } from '../../../common/app-settings/app-settings.service';
import { ErrorCode } from '../../../common/errors/error-code.enum';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  pickUsernameFrom,
  randomSuffixCandidates,
  sequentialCandidates,
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
  constructor(private readonly settings: AppSettingsService) {}

  /** Lower-cased reserved handles (`profile.reserved_usernames`). */
  async reserved(): Promise<Set<string>> {
    const list = await this.settings.stringList('profile.reserved_usernames');
    return new Set(list.map((r) => r.toLowerCase()));
  }

  /** Which of [lowers] are held by anyone other than [exceptUserId]. */
  async taken(
    db: Db,
    lowers: readonly string[],
    exceptUserId?: string,
  ): Promise<Set<string>> {
    if (lowers.length === 0) return new Set();
    const [a, c] = await Promise.all([
      db.attorneyProfile.findMany({
        where: { username_lower: { in: [...lowers] } },
        select: { user_id: true, username_lower: true },
      }),
      db.clientProfile.findMany({
        where: { username_lower: { in: [...lowers] } },
        select: { user_id: true, username_lower: true },
      }),
    ]);
    const out = new Set<string>();
    for (const row of [...a, ...c]) {
      if (row.username_lower && row.user_id !== exceptUserId) {
        out.add(row.username_lower);
      }
    }
    return out;
  }

  async isTaken(
    db: Db,
    lower: string,
    exceptUserId?: string,
  ): Promise<boolean> {
    return (await this.taken(db, [lower], exceptUserId)).has(lower);
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
