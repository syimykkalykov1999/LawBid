import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PgBackfillStore } from '../../common/backfill/backfill.store';
import type { BackfillRow } from '../../common/backfill/backfill.types';
import type { BackfillRunDto } from './admin-ops.dto';

const STALLED_MS = 2 * 60_000;

export function toBackfillDto(
  r: BackfillRow,
  now = Date.now(),
): BackfillRunDto {
  const percent =
    r.status === 'done'
      ? 100
      : r.total_estimate && r.total_estimate > 0
        ? Math.min(99, Math.floor((r.processed / r.total_estimate) * 100))
        : null;
  return {
    name: r.name,
    status: r.status,
    tableName: r.table_name,
    processed: r.processed,
    totalEstimate: r.total_estimate,
    percent,
    batchSize: r.batch_size,
    maxRowsPerSec: r.max_rows_per_sec,
    pauseReason: r.pause_reason,
    lastError: r.last_error,
    stalled:
      r.status === 'running' && now - r.heartbeat_at.getTime() > STALLED_MS,
    startedAt: r.started_at.toISOString(),
    updatedAt: r.updated_at.toISOString(),
  };
}

/** Admin side of the batched backfills (src/common/backfill): list + buttons. */
@Injectable()
export class BackfillsService {
  private readonly store: PgBackfillStore;

  constructor(prisma: PrismaService) {
    this.store = new PgBackfillStore(prisma);
  }

  async list(): Promise<BackfillRunDto[]> {
    const now = Date.now();
    return (await this.store.list()).map((r) => toBackfillDto(r, now));
  }

  /** Returns false when the run is not in a state that allows the button. */
  async act(
    name: string,
    action: 'pause' | 'resume' | 'abort',
  ): Promise<boolean> {
    const to =
      action === 'pause'
        ? 'paused'
        : action === 'resume'
          ? 'running'
          : 'aborted';
    return (await this.store.setStatus(name, to)) !== null;
  }
}
