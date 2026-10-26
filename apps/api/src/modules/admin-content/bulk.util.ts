import { HttpException } from '@nestjs/common';
import type { AdminBulkResultDto } from './admin-content.dto';

/**
 * Owner 2026-10-04 (bulk moderation): runs [fn] for every distinct id, one
 * at a time, and sorts the outcome like the client-badge bulk endpoints —
 * a missing row is `not_found`, a row already in the target state (or one
 * that can't change) is `invalid_state`, anything else `failed`. One bad
 * id never stops the batch.
 */
export async function eachId(
  ids: string[],
  fn: (id: string) => Promise<unknown>,
): Promise<AdminBulkResultDto> {
  const done: string[] = [];
  const skipped: AdminBulkResultDto['skipped'] = [];
  for (const id of [...new Set(ids)]) {
    try {
      await fn(id);
      done.push(id);
    } catch (e) {
      skipped.push({
        id,
        reason: !(e instanceof HttpException)
          ? 'failed'
          : e.getStatus() === 409
            ? 'invalid_state'
            : e.getStatus() === 404
              ? 'not_found'
              : 'failed',
      });
    }
  }
  return { done, skipped };
}
