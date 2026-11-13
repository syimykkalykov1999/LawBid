import { Injectable, Logger } from '@nestjs/common';
import { AppSettingsService } from '../../common/app-settings/app-settings.service';
import { PrismaService } from '../../prisma/prisma.service';
import { FileReleaseService } from '../files/files.public';
import {
  AI_FEEDBACK_KEEP,
  TASK_OPEN_MAX_DAYS,
  UNATTACHED_GRACE_HOURS,
  retentionDays,
  type AiAttachmentKind,
} from './ai-attachments.logic';

/** Rows per DELETE: small transactions, no long locks (as DataRetention). */
const BATCH = 500;
/** One run stops after this many rows per step; the next night continues. */
const MAX_PER_STEP = 200_000;
const DAY_MS = 24 * 3600 * 1000;

/** Item statuses that wait for nobody: decided by the owner or finished. */
export const FINISHED_ITEM_STATUSES = [
  'approved',
  'rejected',
  'failed',
  'skipped',
] as const;
/** Run statuses that are over. */
export const FINISHED_RUN_STATUSES = ['done', 'failed', 'canceled'] as const;

export interface AiRetentionResult {
  items: number;
  runs: number;
  images: number;
  closedTasks: number;
  unattached: number;
}

export type AiRetentionScope = 'worker' | 'technician' | 'all';

const KINDS: Record<AiRetentionScope, AiAttachmentKind[]> = {
  worker: ['role', 'note'],
  technician: ['task'],
  all: ['task', 'role', 'note'],
};

/**
 * Owner 2026-11-12 (row 49): nothing the AI makes piles up on our servers,
 * database or storage. Nightly (`ai.retention`) and on «Очистить сейчас»:
 * - «ИИ-сотрудник» records: finished runs (done / failed / canceled, no batch
 *   in flight) older than `ai.retention_records_days` lose their finished
 *   items, in batches of 500, then the empty run goes. The owner's newest
 *   AI_FEEDBACK_KEEP decided items per role (the learning examples) and the
 *   roles always stay; pending / sent / proposed items are never touched;
 * - images (both AIs): `ai.retention_images_days` after the task / item
 *   closed, the files row is released (object removed by FileReleaseService)
 *   and the ai_attachments row deleted. Uploads never attached go after a
 *   day; a technician task the API never saw closed counts as closed after
 *   TASK_OPEN_MAX_DAYS.
 * 0 days = keep forever (the owner's choice, no other cap).
 */
@Injectable()
export class AiRetentionService {
  private readonly log = new Logger('AiRetention');

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: AppSettingsService,
    private readonly release: FileReleaseService,
  ) {}

  async days(): Promise<{ recordsDays: number; imagesDays: number }> {
    const [records, images] = await Promise.all([
      this.settings.number('ai.retention_records_days'),
      this.settings.number('ai.retention_images_days'),
    ]);
    return {
      recordsDays: retentionDays(records),
      imagesDays: retentionDays(images),
    };
  }

  /** The nightly sweep with the owner's days. */
  async run(now: Date = new Date()): Promise<AiRetentionResult> {
    const { recordsDays, imagesDays } = await this.days();
    const result = await this.sweep({
      now,
      recordsBefore: recordsDays > 0 ? before(now, recordsDays) : null,
      imagesBefore: imagesDays > 0 ? before(now, imagesDays) : null,
      scope: 'all',
    });
    if (Object.values(result).some((n) => n > 0)) {
      this.log.log(`ai retention ${JSON.stringify(result)}`);
    }
    return result;
  }

  /**
   * «Очистить сейчас» (the controller checked the owner and his 2FA):
   * `older` = what the chosen days allow right now; `all` = every finished
   * record and every closed / unused image now. Open tasks, the roles'
   * current pictures and undecided items stay in both.
   */
  async purgeNow(
    mode: 'older' | 'all',
    scope: AiRetentionScope,
    now: Date = new Date(),
  ): Promise<AiRetentionResult> {
    const { recordsDays, imagesDays } = await this.days();
    const recordsBefore =
      mode === 'all' ? now : recordsDays > 0 ? before(now, recordsDays) : null;
    const imagesBefore =
      mode === 'all' ? now : imagesDays > 0 ? before(now, imagesDays) : null;
    return this.sweep({
      now,
      recordsBefore: scope === 'technician' ? null : recordsBefore,
      imagesBefore,
      scope,
    });
  }

  private async sweep(o: {
    now: Date;
    recordsBefore: Date | null;
    imagesBefore: Date | null;
    scope: AiRetentionScope;
  }): Promise<AiRetentionResult> {
    const out: AiRetentionResult = {
      items: 0,
      runs: 0,
      images: 0,
      closedTasks: 0,
      unattached: 0,
    };
    if (o.recordsBefore) {
      out.items = await this.items(o.recordsBefore, o.now);
      out.runs = await this.runs(o.recordsBefore);
    }
    const kinds = KINDS[o.scope];
    if (kinds.includes('task')) {
      out.closedTasks = (
        await this.prisma.aiAttachment.updateMany({
          where: {
            kind: 'task',
            closed_at: null,
            created_at: { lt: before(o.now, TASK_OPEN_MAX_DAYS) },
          },
          data: { closed_at: o.now },
        })
      ).count;
    }
    out.unattached = await this.unattached(o.now);
    if (o.imagesBefore)
      out.images = await this.images(o.imagesBefore, kinds, o.now);
    return out;
  }

  /** Finished items of finished runs older than [cutoff], minus the kept
   * learning examples; their correction pictures close with them. */
  private async items(cutoff: Date, now: Date): Promise<number> {
    const runDone = [...FINISHED_RUN_STATUSES];
    const itemDone = [...FINISHED_ITEM_STATUSES];
    return this.batched(async (limit) => {
      const rows = await this.prisma.$queryRaw<{ n: number }[]>`
        WITH kept AS (
          SELECT k.id FROM (
            SELECT i.id, ROW_NUMBER() OVER (
              PARTITION BY r.role_id
              ORDER BY i.reviewed_at DESC NULLS LAST, i.id) AS n
            FROM ai_run_items i JOIN ai_runs r ON r.id = i.run_id
            WHERE i.status IN ('approved', 'rejected')
          ) k WHERE k.n <= ${AI_FEEDBACK_KEEP}
        ),
        gone AS (
          DELETE FROM ai_run_items
          WHERE id IN (
            SELECT i.id FROM ai_run_items i JOIN ai_runs r ON r.id = i.run_id
            WHERE r.status = ANY(${runDone}::TEXT[])
              AND r.batch_id IS NULL
              AND COALESCE(r.finished_at, r.updated_at) < ${cutoff}
              AND i.status = ANY(${itemDone}::TEXT[])
              AND (i.reviewed_at IS NULL OR i.reviewed_at < ${cutoff})
              AND i.id NOT IN (SELECT id FROM kept)
            LIMIT ${limit})
          RETURNING id
        ),
        closed AS (
          UPDATE ai_attachments SET closed_at = ${now}
          WHERE kind = 'note' AND closed_at IS NULL
            AND run_item_id IN (SELECT id FROM gone)
          RETURNING 1
        )
        SELECT (SELECT COUNT(*) FROM gone)::INT AS n`;
      return rows[0]?.n ?? 0;
    });
  }

  /** Finished runs older than [cutoff] with no item left. */
  private async runs(cutoff: Date): Promise<number> {
    const runDone = [...FINISHED_RUN_STATUSES];
    return this.batched(
      (limit) => this.prisma.$executeRaw`
        DELETE FROM ai_runs WHERE id IN (
          SELECT r.id FROM ai_runs r
          WHERE r.status = ANY(${runDone}::TEXT[])
            AND r.batch_id IS NULL
            AND COALESCE(r.finished_at, r.updated_at) < ${cutoff}
            AND NOT EXISTS (SELECT 1 FROM ai_run_items i WHERE i.run_id = r.id)
          LIMIT ${limit})`,
    );
  }

  /** Uploads never attached to a task / role / note (older than a day). */
  private async unattached(now: Date): Promise<number> {
    const cutoff = new Date(now.getTime() - UNATTACHED_GRACE_HOURS * 3600_000);
    let total = 0;
    while (total < MAX_PER_STEP) {
      const files = await this.prisma.file.findMany({
        where: {
          purpose: 'ai_attachment',
          deleted_at: null,
          created_at: { lt: cutoff },
          ai_attachments: { none: {} },
        },
        select: { id: true },
        take: BATCH,
      });
      if (files.length === 0) break;
      await this.release.release(
        files.map((f) => f.id),
        'orphan',
        now,
      );
      total += files.length;
      if (files.length < BATCH) break;
    }
    return total;
  }

  /** Images closed before [cutoff]: the row goes; the file goes when no
   * other open row (the same picture on another note) still uses it. */
  private async images(
    cutoff: Date,
    kinds: AiAttachmentKind[],
    now: Date,
  ): Promise<number> {
    let total = 0;
    while (total < MAX_PER_STEP) {
      const rows = await this.prisma.aiAttachment.findMany({
        where: { kind: { in: kinds }, closed_at: { not: null, lte: cutoff } },
        select: { id: true, file_id: true },
        take: BATCH,
      });
      if (rows.length === 0) break;
      await this.prisma.aiAttachment.deleteMany({
        where: { id: { in: rows.map((r) => r.id) } },
      });
      const fileIds = [...new Set(rows.map((r) => r.file_id))];
      const still = await this.prisma.aiAttachment.findMany({
        where: { file_id: { in: fileIds } },
        select: { file_id: true },
      });
      const used = new Set(still.map((s) => s.file_id));
      await this.release.release(
        fileIds.filter((id) => !used.has(id)),
        'expired',
        now,
      );
      total += rows.length;
      if (rows.length < BATCH) break;
    }
    return total;
  }

  private async batched(
    step: (limit: number) => Promise<number>,
  ): Promise<number> {
    let deleted = 0;
    while (deleted < MAX_PER_STEP) {
      const n = await step(BATCH);
      deleted += n;
      if (n < BATCH) break;
    }
    return deleted;
  }
}

function before(now: Date, days: number): Date {
  return new Date(now.getTime() - days * DAY_MS);
}
