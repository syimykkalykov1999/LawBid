import { randomUUID } from 'node:crypto';
import {
  Inject,
  Injectable,
  NotFoundException,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue, Worker, type Job } from 'bullmq';
import type Redis from 'ioredis';
import { PinoLogger } from 'nestjs-pino';
import { ErrorCode } from '../../common/errors/error-code.enum';
import { REDIS_CLIENT } from '../../redis/redis.constants';
import type { RequestUser } from '../auth/decorators/current-user.decorator';
import { S3StorageService } from '../files/storage/s3-storage.service';
import { renderCaseHistoryPdf } from './case-history-pdf';
import { CaseHistoryService } from './case-history.service';
import type {
  CaseHistoryExportDto,
  HistoryExportStatus,
} from './dto/case-history.dto';

export const HISTORY_EXPORT_QUEUE = 'case-history-export';
export const HISTORY_EXPORT_OPTIONS = Symbol('HISTORY_EXPORT_OPTIONS');
/** docs/04 §12: the download link lives 10 minutes. */
export const HISTORY_LINK_TTL_SEC = 10 * 60;
/** Export state kept in Redis for a day; the PDF itself stays private. */
const STATE_TTL_SEC = 24 * 60 * 60;
/** Upper bound of cases per PDF (memory/time of one worker job). */
export const HISTORY_EXPORT_MAX_CASES = 1000;

export interface HistoryExportOptions {
  mode: 'api' | 'worker';
}

interface ExportState {
  userId: string;
  status: HistoryExportStatus;
  key: string | null;
}

interface ExportJob {
  exportId: string;
  userId: string;
  role: RequestUser['role'];
}

const stateKey = (id: string) => `chx:${id}`;

/**
 * docs/04 §12 "Скачать PDF": `POST /users/me/case-history/export` queues a
 * background job (BullMQ); the worker renders the PDF into the private
 * documents bucket; the owner fetches a 10-minute signed link with a fresh
 * reauth. jobId = exportId, so a retry never renders twice.
 */
@Injectable()
export class CaseHistoryExportRunner
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private queue?: Queue;
  private worker?: Worker;

  constructor(
    @Inject(HISTORY_EXPORT_OPTIONS)
    private readonly options: HistoryExportOptions,
    private readonly config: ConfigService,
    private readonly history: CaseHistoryService,
    private readonly storage: S3StorageService,
    private readonly logger: PinoLogger,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {
    this.logger.setContext(CaseHistoryExportRunner.name);
  }

  get workerEnabled(): boolean {
    return (
      this.options.mode === 'worker' ||
      this.config.get<boolean>('JOBS_ENABLED') !== false
    );
  }

  onApplicationBootstrap(): void {
    const url = this.config.getOrThrow<string>('REDIS_URL');
    this.queue = new Queue(HISTORY_EXPORT_QUEUE, { connection: { url } });
    if (!this.workerEnabled) return;
    this.worker = new Worker(
      HISTORY_EXPORT_QUEUE,
      (job: Job<ExportJob>) => this.process(job.data),
      { connection: { url, maxRetriesPerRequest: null }, concurrency: 2 },
    );
    this.worker.on('failed', (job: Job<ExportJob> | undefined, error) => {
      if (!job) return;
      const { exportId, userId } = job.data;
      this.logger.error(
        { exportId, err: error.message },
        'case history export failed',
      );
      if (job.attemptsMade >= (job.opts.attempts ?? 1)) {
        void this.setState(exportId, { userId, status: 'failed', key: null });
      }
    });
  }

  async enqueue(user: RequestUser): Promise<CaseHistoryExportDto> {
    if (!this.queue) throw new Error('case history export queue not started');
    const exportId = randomUUID();
    await this.setState(exportId, {
      userId: user.sub,
      status: 'queued',
      key: null,
    });
    await this.queue.add(
      'case-history.export',
      { exportId, userId: user.sub, role: user.role },
      {
        jobId: exportId,
        attempts: 3,
        backoff: { type: 'exponential', delay: 5_000 },
        removeOnComplete: { count: 200 },
        removeOnFail: { count: 500 },
      },
    );
    return { exportId, status: 'queued', url: null, expiresAt: null };
  }

  /** Status for the owner; `ready` → a fresh 10-minute signed link. */
  async status(
    user: RequestUser,
    exportId: string,
    opts: { withLink: boolean } = { withLink: true },
  ): Promise<CaseHistoryExportDto> {
    const state = await this.getState(exportId);
    if (!state || state.userId !== user.sub) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'Export not found.',
      });
    }
    if (state.status !== 'ready' || !state.key || !opts.withLink) {
      return { exportId, status: state.status, url: null, expiresAt: null };
    }
    const url = await this.storage.signedGetUrl(
      this.storage.bucket('documents'),
      state.key,
      HISTORY_LINK_TTL_SEC,
    );
    return {
      exportId,
      status: 'ready',
      url,
      expiresAt: new Date(
        Date.now() + HISTORY_LINK_TTL_SEC * 1000,
      ).toISOString(),
    };
  }

  async process(data: ExportJob): Promise<{ cases: number }> {
    const user = { sub: data.userId, role: data.role } as RequestUser;
    const { cases, truncated } = await this.history.collectForExport(
      user,
      HISTORY_EXPORT_MAX_CASES,
    );
    const pdf = await renderCaseHistoryPdf({
      generatedAt: new Date(),
      cases,
      truncated,
    });
    const key = `exports/case-history/${data.userId}/${data.exportId}.pdf`;
    await this.storage.put(
      this.storage.bucket('documents'),
      key,
      pdf,
      'application/pdf',
    );
    await this.setState(data.exportId, {
      userId: data.userId,
      status: 'ready',
      key,
    });
    // TODO(docs/05 stage 5.x): push "PDF is ready" once file 05 adds a
    // notification type for it (docs/04 §12); until then the app polls
    // GET /users/me/case-history/export/:exportId.
    return { cases: cases.length };
  }

  private async setState(id: string, state: ExportState): Promise<void> {
    await this.redis.set(
      stateKey(id),
      JSON.stringify(state),
      'EX',
      STATE_TTL_SEC,
    );
  }

  private async getState(id: string): Promise<ExportState | null> {
    const raw = await this.redis.get(stateKey(id));
    return raw ? (JSON.parse(raw) as ExportState) : null;
  }

  async onApplicationShutdown(): Promise<void> {
    await this.worker?.close();
    await this.queue?.close();
  }
}
