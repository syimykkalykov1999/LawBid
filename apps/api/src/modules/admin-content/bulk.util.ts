import { HttpException } from '@nestjs/common';
import { BULK_CHUNK, chunks } from '../../common/admin-bulk/admin-bulk';
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

/**
 * Owner 2026-11-12: [eachId] over any number of ids (the owner has no cap),
 * BULK_CHUNK at a time. [afterChunk] runs after each chunk — the batch audit
 * row goes there, so one row never lists more than a chunk's ids. A list
 * that fits one chunk behaves exactly like [eachId] plus one call.
 */
export async function eachIdInChunks(
  ids: string[],
  fn: (id: string) => Promise<unknown>,
  afterChunk?: (
    part: AdminBulkResultDto,
    chunk: { index: number; of: number },
  ) => Promise<unknown>,
): Promise<AdminBulkResultDto> {
  const parts = chunks([...new Set(ids)], BULK_CHUNK);
  const out: AdminBulkResultDto = { done: [], skipped: [] };
  for (const [index, part] of parts.entries()) {
    const r = await eachId(part, fn);
    out.done.push(...r.done);
    out.skipped.push(...r.skipped);
    await afterChunk?.(r, { index: index + 1, of: parts.length });
  }
  return out;
}
