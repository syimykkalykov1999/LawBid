import { BadRequestException } from '@nestjs/common';
import { ErrorCode } from '../../common/errors/error-code.enum';

/** Opaque offset cursor into a ranked snapshot. */
export function encodeOffset(offset: number): string {
  return Buffer.from(`o:${offset}`).toString('base64url');
}

export function decodeOffset(cursor?: string): number {
  if (!cursor) return 0;
  const m = /^o:(\d{1,6})$/.exec(
    Buffer.from(cursor, 'base64url').toString('utf8'),
  );
  if (!m) {
    throw new BadRequestException({
      code: ErrorCode.VALIDATION_ERROR,
      message: 'Invalid cursor.',
    });
  }
  return Number(m[1]);
}
