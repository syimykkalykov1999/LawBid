import { NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { ErrorCode } from '../../common/errors/error-code.enum';

/**
 * Owner 2026-10-05: an employee assigned to some countries (or working
 * in one country tab) sees only those countries' people, cases and
 * tickets. `null` / `undefined` = every country (the owner, or staff with
 * no countries assigned). See AdminAuthGuard → `admin.countries`.
 */
export type CountryScope = string[] | null | undefined;

/** A `users` filter for the scope (empty object = no limit). */
export function userInScope(scope: CountryScope): Prisma.UserWhereInput {
  return scope ? { country_code: { in: scope } } : {};
}

/** True when a person of [countryCode] is visible in the scope. */
export function countryInScope(
  scope: CountryScope,
  countryCode: string | null | undefined,
): boolean {
  return !scope || (!!countryCode && scope.includes(countryCode));
}

/** 404 (like a missing record) when [userId] is outside the scope. */
export async function assertUserInScope(
  db: {
    user: { count(args: { where: Prisma.UserWhereInput }): Promise<number> };
  },
  userId: string,
  scope: CountryScope,
): Promise<void> {
  if (!scope) return;
  const n = await db.user.count({
    where: { id: userId, country_code: { in: scope } },
  });
  if (n === 0) {
    throw new NotFoundException({
      code: ErrorCode.NOT_FOUND,
      message: 'Not found.',
    });
  }
}
