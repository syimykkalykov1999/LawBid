import { BadRequestException } from '@nestjs/common';
import { ErrorCode } from '../../common/errors/error-code.enum';

/** Opaque offset cursor into a ranked snapshot. 18.11: it also names the
 * pinned copy the offset belongs to ([pin]), so a newer first page of the
 * same viewer (pull to refresh elsewhere, the reels' fresh mix) never
 * moves the list an older scroll is paging. */
export function encodeOffset(offset: number, pin?: string | null): string {
  return Buffer.from(pin ? `o:${offset}:${pin}` : `o:${offset}`).toString(
    'base64url',
  );
}

export function decodeOffsetCursor(cursor?: string): {
  offset: number;
  pin: string | null;
} {
  if (!cursor) return { offset: 0, pin: null };
  const m = /^o:(\d{1,6})(?::([A-Za-z0-9_-]{1,32}))?$/.exec(
    Buffer.from(cursor, 'base64url').toString('utf8'),
  );
  if (!m) {
    throw new BadRequestException({
      code: ErrorCode.VALIDATION_ERROR,
      message: 'Invalid cursor.',
    });
  }
  return { offset: Number(m[1]), pin: m[2] ?? null };
}

export function decodeOffset(cursor?: string): number {
  return decodeOffsetCursor(cursor).offset;
}
