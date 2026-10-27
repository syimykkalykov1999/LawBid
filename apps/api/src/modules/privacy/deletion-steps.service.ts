import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { PrismaService } from '../../prisma/prisma.service';

export type StepStatus = 'ok' | 'failed' | 'retained' | 'skipped' | 'pending';

export interface StepOutcome {
  status: StepStatus;
  detail?: string;
}

/**
 * Owner 2026-10-25 (privacy round 13, S13-10/11): one `deletion_steps` row
 * per account and step (a vendor, a notice, the search index, the final
 * completion proof). It is the evidence a regulator can be shown and the
 * list of what failed and must be retried.
 */
@Injectable()
export class DeletionStepsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(DeletionStepsService.name);
  }

  async record(
    userId: string,
    step: string,
    status: StepStatus,
    detail?: string,
  ): Promise<void> {
    const text = detail?.slice(0, 500) ?? null;
    await this.prisma.deletionStep.upsert({
      where: { user_id_step: { user_id: userId, step } },
      create: { user_id: userId, step, status, detail: text },
      update: { status, detail: text, attempts: { increment: 1 } },
    });
  }

  /** Runs one step, records its outcome and never throws: a vendor outage
   * must not stop the erasure, it shows up as `failed` for the retry. */
  async run(
    userId: string,
    step: string,
    fn: () => Promise<StepOutcome>,
  ): Promise<StepStatus> {
    let outcome: StepOutcome;
    try {
      outcome = await fn();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn({ userId, step, err: message }, 'deletion step failed');
      outcome = { status: 'failed', detail: message };
    }
    await this.record(userId, step, outcome.status, outcome.detail);
    return outcome.status;
  }

  async has(userId: string, step: string): Promise<boolean> {
    const row = await this.prisma.deletionStep.findUnique({
      where: { user_id_step: { user_id: userId, step } },
      select: { status: true },
    });
    return row !== null && row.status !== 'failed';
  }

  /** What the nightly job should look at again. */
  failed(limit = 200): Promise<{ user_id: string; step: string }[]> {
    return this.prisma.deletionStep.findMany({
      where: { status: 'failed' },
      select: { user_id: true, step: true },
      orderBy: { updated_at: 'asc' },
      take: limit,
    });
  }
}
