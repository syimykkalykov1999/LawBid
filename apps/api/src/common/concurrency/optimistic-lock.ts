import {
  BadRequestException,
  ConflictException,
  createParamDecorator,
  ExecutionContext,
} from '@nestjs/common';
import { ApiHeader } from '@nestjs/swagger';
import type { Request } from 'express';
import { ErrorCode } from '../errors/error-code.enum';

/**
 * Optimistic concurrency (day-one foundations, 2026-10-24). Pattern: HTTP
 * conditional requests (RFC 9110 §13.1.1 If-Match) with a per-row version
 * counter instead of a hash, as in Azure Cosmos DB / Microsoft REST API
 * guidelines and the JSON:API "lost update" advice. A client that sends
 * nothing keeps the old last-write-wins behaviour (the shipped mobile app).
 */

/** Parses `If-Match: 3`, `"3"` or `W/"3"`. `*` and a missing header mean "no check". */
export function parseIfMatch(
  raw: string | string[] | undefined,
): number | undefined {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  if (trimmed === '' || trimmed === '*') return undefined;
  const m = /^(?:W\/)?"?(\d{1,9})"?$/.exec(trimmed);
  if (!m) {
    throw new BadRequestException({
      code: ErrorCode.VALIDATION_ERROR,
      message: 'If-Match must be the integer version of the row.',
    });
  }
  return Number(m[1]);
}

/** `@ExpectedVersion()` – the version the client read, or undefined. */
export const ExpectedVersion = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): number | undefined =>
    parseIfMatch(ctx.switchToHttp().getRequest<Request>().headers['if-match']),
);

/** Documents the optional header in OpenAPI (additive, not breaking). */
export const ApiIfMatchVersion = () =>
  ApiHeader({
    name: 'If-Match',
    required: false,
    description:
      'Optional. The `version` you last read. If the row was saved by someone else since, the call fails with 409 STALE_VERSION. Omit it to overwrite.',
    schema: { type: 'integer', minimum: 0 },
  });

export function staleVersion(currentVersion: number): ConflictException {
  return new ConflictException({
    code: ErrorCode.STALE_VERSION,
    message: 'This item was changed by someone else. Reload and try again.',
    details: { currentVersion },
  });
}

/** Throws 409 STALE_VERSION when the client sent a version that is not the stored one. */
export function assertExpectedVersion(
  currentVersion: number,
  expected: number | undefined,
): void {
  if (expected !== undefined && expected !== currentVersion) {
    throw staleVersion(currentVersion);
  }
}

/** Prisma `data` fragment: every user edit bumps the counter. */
export const BUMP_VERSION = { version: { increment: 1 } } as const;
