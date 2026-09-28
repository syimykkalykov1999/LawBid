import { HttpException, HttpStatus } from '@nestjs/common';
import { ErrorCode } from '../errors/error-code.enum';

/**
 * Keyset cursor for lists ordered by (created_at DESC, id DESC)
 * (.cursorrules: "Пагинация только cursor-based, offset запрещён"). The
 * cursor is opaque to clients: base64url of `{t: ISO timestamp, id}` of
 * the last row of the previous page.
 */
export interface CreatedAtCursor {
  createdAt: Date;
  id: string;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function encodeCursor(cursor: CreatedAtCursor): string {
  return Buffer.from(
    JSON.stringify({ t: cursor.createdAt.toISOString(), id: cursor.id }),
  ).toString('base64url');
}

/** Throws 400 VALIDATION_ERROR (details.field = 'cursor') for anything
 * that is not a cursor this API issued. */
export function decodeCursor(raw: string): CreatedAtCursor {
  try {
    const parsed = JSON.parse(
      Buffer.from(raw, 'base64url').toString('utf8'),
    ) as unknown;
    if (parsed !== null && typeof parsed === 'object') {
      const { t, id } = parsed as { t?: unknown; id?: unknown };
      const createdAt = typeof t === 'string' ? new Date(t) : undefined;
      if (
        createdAt &&
        !Number.isNaN(createdAt.getTime()) &&
        typeof id === 'string' &&
        UUID_RE.test(id)
      ) {
        return { createdAt, id };
      }
    }
  } catch {
    // Fall through to the validation error below.
  }
  throw new HttpException(
    {
      code: ErrorCode.VALIDATION_ERROR,
      message: 'Invalid cursor.',
      details: { field: 'cursor' },
    },
    HttpStatus.BAD_REQUEST,
  );
}
