import { applyDecorators, HttpException, HttpStatus } from '@nestjs/common';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsISO8601, IsOptional } from 'class-validator';
import { ErrorCode } from '../errors/error-code.enum';

/**
 * Owner 2026-10-22 (client economy plan §4, Telegram `getDifference`): a
 * list with `updated_at` takes `?updatedSince=<ISO>` and answers with only
 * the rows changed since, plus `meta.deletedIds` (rows that left the list,
 * by id) and `meta.syncedAt` (the newest `updated_at` of the answer — the
 * client passes it back next time; never the phone's clock, so a row saved
 * on the boundary is not lost). A gap older than [SYNC_MAX_AGE_MS] is
 * `409 SYNC_TOO_OLD` → the client reloads the list (`differenceTooLong`).
 */
export const SYNC_MAX_AGE_MS = 7 * 86_400_000;

export const SYNC_TOO_OLD_ERROR = {
  code: ErrorCode.SYNC_TOO_OLD,
  message: 'updatedSince is older than 7 days — reload the list.',
};

/** Validates `updatedSince`: undefined → undefined; a date → Date; an
 * unparsable value → 400; older than 7 days → 409 SYNC_TOO_OLD. */
export function parseUpdatedSince(
  raw: string | undefined,
  now: Date = new Date(),
): Date | undefined {
  if (raw === undefined || raw === null || raw === '') return undefined;
  const at = new Date(raw);
  if (Number.isNaN(at.getTime())) {
    throw new HttpException(
      {
        code: ErrorCode.VALIDATION_ERROR,
        message: 'updatedSince must be an ISO 8601 date-time.',
        details: { field: 'updatedSince' },
      },
      HttpStatus.BAD_REQUEST,
    );
  }
  if (now.getTime() - at.getTime() > SYNC_MAX_AGE_MS) {
    throw new HttpException(
      { ...SYNC_TOO_OLD_ERROR, details: { field: 'updatedSince' } },
      HttpStatus.CONFLICT,
    );
  }
  return at;
}

/** The `syncedAt` of a delta answer: the newest timestamp among [stamps]
 * (the rows' `updated_at`), or [since] when nothing changed (the client
 * keeps its position). Serialised as ISO. */
export function syncedAt(
  stamps: Iterable<Date | null | undefined>,
  since: Date,
): string {
  let max = since.getTime();
  for (const d of stamps) {
    if (d && d.getTime() > max) max = d.getTime();
  }
  return new Date(max).toISOString();
}

/** What a delta-aware list handler returns; ResponseInterceptor moves
 * `deletedIds` and `syncedAt` into `meta`. */
export interface SyncPage<T> {
  items: T[];
  nextCursor: string | null;
  deletedIds?: string[];
  syncedAt?: string;
}

/** Query property decorator: optional ISO date-time `updatedSince`. */
export function UpdatedSinceQuery(description?: string): PropertyDecorator {
  return applyDecorators(
    ApiPropertyOptional({
      format: 'date-time',
      description:
        description ??
        'Only rows changed since this time (ISO); the answer adds meta.deletedIds and meta.syncedAt. Older than 7 days → 409 SYNC_TOO_OLD (reload).',
    }),
    IsOptional(),
    IsISO8601(),
  );
}
