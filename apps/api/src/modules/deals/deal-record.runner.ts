import { createHash } from 'node:crypto';
import {
  Inject,
  Injectable,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Prisma } from '@prisma/client';
import { Queue, Worker, type Job } from 'bullmq';
import { PinoLogger } from 'nestjs-pino';
import {
  closeWorker,
  isStalledFailure,
  workerTuning,
} from '../../common/queues/queue-hardening';
import { PrismaService } from '../../prisma/prisma.service';
import { withTxRetry } from '../../prisma/tx-retry.util';
import { bullOptions } from '../../redis/redis-connection';
import { shardContext } from '../../sharding/shard-context';
import { FilesService } from '../files/files.service';
import { CaseJournalService } from '../journal/case-journal.service';
import { NotificationsService } from '../notifications/notifications.service';
import { renderDealRecordPdf, type RecordSignature } from './deal-record.pdf';
import type { DealRecordSnapshot } from './deal-record.snapshot';
import { DealRecordTexts } from './deal-record-texts';

export const DEAL_RECORD_QUEUE = 'deal-record';
export const DEAL_RECORD_OPTIONS = Symbol('DEAL_RECORD_OPTIONS');

export interface DealRecordRunnerOptions {
  mode: 'api' | 'worker';
}

export type DealRecordStage = 'unsigned' | 'sealed';

interface RenderJob {
  recordId: string;
  /** The case's id: the job runs in that case's shard context. */
  caseId: string;
  stage: DealRecordStage;
}

const sha256 = (data: Buffer): string =>
  createHash('sha256').update(data).digest('hex');

/**
 * Deal record 2026-10-27 (plan §5): the `deal-record` BullMQ queue. The
 * request path never renders a PDF; this worker does, twice per record:
 *  - `unsigned`: the record without signatures → a case file + the
 *    case_sign_requests row the two signatures attach to → status
 *    awaiting_signatures.
 *  - `sealed`: both signatures → the final PDF (initials in every footer)
 *    → sealed_sha256, the sign request's final file, both files linked in
 *    the case's Files/Docs, journal `signature_completed`, pushes.
 * jobId = `<recordId>-<stage>` makes every enqueue idempotent; a stage
 * that already happened is a no-op. After the last attempt the record is
 * marked `failed` (the apps show it; "Decline" stays available).
 */
@Injectable()
export class DealRecordRunner
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private queue?: Queue;
  private worker?: Worker;

  constructor(
    @Inject(DEAL_RECORD_OPTIONS)
    private readonly options: DealRecordRunnerOptions,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly files: FilesService,
    private readonly journal: CaseJournalService,
    private readonly notifications: NotificationsService,
    private readonly texts: DealRecordTexts,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(DealRecordRunner.name);
  }

  get workerEnabled(): boolean {
    return (
      this.options.mode === 'worker' ||
      this.config.get<boolean>('JOBS_ENABLED') !== false
    );
  }

  onApplicationBootstrap(): void {
    const url = this.config.getOrThrow<string>('REDIS_URL');
    this.queue = new Queue(
      DEAL_RECORD_QUEUE,
      bullOptions(DEAL_RECORD_QUEUE, url),
    );
    if (!this.workerEnabled) return;
    this.worker = new Worker(
      DEAL_RECORD_QUEUE,
      (job: Job<RenderJob>) => this.process(job.data),
      {
        ...bullOptions(DEAL_RECORD_QUEUE, url, { worker: true }),
        ...workerTuning(DEAL_RECORD_QUEUE),
        concurrency: 2,
      },
    );
    this.worker.on('failed', (job: Job<RenderJob> | undefined, error) => {
      if (!job) return;
      const { recordId, caseId, stage } = job.data;
      this.logger.error(
        { recordId, stage, err: error.message },
        'deal record render failed',
      );
      if (
        job.attemptsMade >= (job.opts.attempts ?? 1) ||
        isStalledFailure(error)
      ) {
        void shardContext.runForCase(caseId, () =>
          this.prisma.dealRecord.updateMany({
            where: {
              id: recordId,
              status: stage === 'unsigned' ? 'preparing' : 'sealing',
            },
            data: {
              status: 'failed',
              failed_reason: `${stage}: ${error.message}`.slice(0, 300),
            },
          }),
        );
      }
    });
  }

  async onApplicationShutdown(): Promise<void> {
    await closeWorker(this.worker);
    await this.queue?.close();
  }

  async enqueue(
    recordId: string,
    caseId: string,
    stage: DealRecordStage,
  ): Promise<void> {
    if (!this.queue) throw new Error('deal record queue not started');
    await this.queue.add(
      `deal-record.${stage}`,
      { recordId, caseId, stage } satisfies RenderJob,
      {
        // BullMQ custom ids may not contain ':'.
        jobId: `${recordId}-${stage}`,
        attempts: 3,
        backoff: { type: 'exponential', delay: 5_000 },
        removeOnComplete: { count: 500 },
        removeOnFail: { count: 500 },
      },
    );
  }

  /** Exposed for the e2e tests (the worker runs in-process there too). */
  async process(data: RenderJob): Promise<void> {
    await shardContext.runForCase(data.caseId, async () => {
      if (data.stage === 'unsigned') await this.renderUnsigned(data.recordId);
      else await this.renderSealed(data.recordId);
    });
  }

  /** The next free position in the case's Files tab (CasePhoto). */
  async linkFile(
    tx: Prisma.TransactionClient,
    caseId: string,
    fileId: string,
    userId: string,
    description: string,
  ): Promise<void> {
    const last = await tx.casePhoto.aggregate({
      where: { case_id: caseId },
      _max: { position: true },
    });
    await tx.casePhoto.create({
      data: {
        case_id: caseId,
        file_id: fileId,
        position: (last._max.position ?? -1) + 1,
        description: description.slice(0, 500),
        source: 'case',
        added_by: userId,
      },
    });
  }

  private async renderUnsigned(recordId: string): Promise<void> {
    const row = await this.prisma.dealRecord.findUnique({
      where: { id: recordId },
    });
    if (!row || row.status !== 'preparing') return; // already done / declined
    const pdf = await renderDealRecordPdf({
      snapshot: row.snapshot as unknown as DealRecordSnapshot,
      recordCode: row.record_code,
      snapshotSha256: row.snapshot_sha256,
      signatures: [],
      generatedAt: row.created_at,
      title: (await this.texts.pdf()).title,
    });
    const file = await this.files.storeGenerated(
      row.initiator_id,
      'case_attachment',
      pdf,
      'application/pdf',
    );
    await withTxRetry(this.prisma, async (tx) => {
      const still = await tx.dealRecord.findUnique({
        where: { id: recordId },
        select: { status: true },
      });
      if (still?.status !== 'preparing') return;
      const request = await tx.caseSignRequest.create({
        data: {
          case_id: row.case_id,
          created_by: row.initiator_id,
          title: 'Deal record',
          source_file_id: file.id,
          source_sha256: sha256(pdf),
          status: 'pending',
        },
        select: { id: true },
      });
      await tx.dealRecord.update({
        where: { id: recordId },
        data: {
          status: 'awaiting_signatures',
          sign_request_id: request.id,
          unsigned_file_id: file.id,
        },
      });
    });
  }

  private async renderSealed(recordId: string): Promise<void> {
    const row = await this.prisma.dealRecord.findUnique({
      where: { id: recordId },
      include: {
        case: { select: { client_id: true } },
        bid: { select: { attorney_id: true } },
        sign_request: {
          include: { signatures: { orderBy: { signed_at: 'asc' } } },
        },
      },
    });
    if (!row || row.status !== 'sealing' || !row.sign_request) return;
    const signatures: RecordSignature[] = row.sign_request.signatures.map(
      (x) => ({
        role: x.signer_role as 'client' | 'attorney',
        name: x.signed_name,
        image: x.image_png ? Buffer.from(x.image_png) : null,
        signedAt: x.signed_at,
        ip: x.ip,
      }),
    );
    if (signatures.length < 2) {
      throw new Error(
        `deal record ${recordId}: sealing with ${signatures.length} signature(s)`,
      );
    }
    const sealedAt = signatures[signatures.length - 1].signedAt;
    const pdf = await renderDealRecordPdf({
      snapshot: row.snapshot as unknown as DealRecordSnapshot,
      recordCode: row.record_code,
      snapshotSha256: row.snapshot_sha256,
      signatures,
      generatedAt: sealedAt,
      title: (await this.texts.pdf()).title,
    });
    const hash = sha256(pdf);
    const file = await this.files.storeGenerated(
      row.initiator_id,
      'case_attachment',
      pdf,
      'application/pdf',
    );
    const requestId = row.sign_request.id;
    await withTxRetry(this.prisma, async (tx) => {
      const won = await tx.dealRecord.updateMany({
        where: { id: recordId, status: 'sealing' },
        data: {
          status: 'sealed',
          sealed_file_id: file.id,
          sealed_sha256: hash,
          sealed_at: sealedAt,
        },
      });
      if (won.count === 0) return;
      await tx.caseSignRequest.updateMany({
        where: { id: requestId, final_file_id: null },
        data: { final_file_id: file.id, final_sha256: hash },
      });
      // Both files in the case's Files/Docs (the case is in_progress now,
      // so a client edit can no longer unlink them).
      if (row.unsigned_file_id) {
        await this.linkFile(
          tx,
          row.case_id,
          row.unsigned_file_id,
          row.initiator_id,
          `Deal record ${row.record_code} (unsigned)`,
        );
      }
      await this.linkFile(
        tx,
        row.case_id,
        file.id,
        row.initiator_id,
        `Deal record ${row.record_code} (sealed)`,
      );
      await this.journal.append(tx, {
        caseId: row.case_id,
        clientId: row.case.client_id,
        actor: { userId: null, role: null },
        attorneyId: row.bid.attorney_id,
        event: 'signature_completed',
        payload: {
          dealRecordId: recordId,
          requestId,
          sealedFileId: file.id,
          sealedSha256: hash,
          snapshotSha256: row.snapshot_sha256,
          recordCode: row.record_code,
        },
      });
      for (const recipientId of [row.case.client_id, row.bid.attorney_id]) {
        await this.notifications.emit(
          {
            type: 'case_workspace_activity',
            recipientId,
            payload: {
              caseId: row.case_id,
              actorId: row.initiator_id,
              kind: 'deal_record_sealed',
              dealRecordId: recordId,
            },
          },
          tx,
        );
      }
    });
  }
}
