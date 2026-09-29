import { Injectable } from '@nestjs/common';
import * as Sentry from '@sentry/nestjs';
import { PinoLogger } from 'nestjs-pino';
import { PrismaService } from '../../prisma/prisma.service';
import {
  CaseJournalService,
  type ChainVerification,
} from '../journal/case-journal.service';

/** Random cases checked on top of the day's changed ones. */
const SAMPLE = 200;

export interface IntegrityRunResult {
  checked: number;
  broken: { caseId: string; brokenAt: ChainVerification['brokenAt'] }[];
}

/**
 * docs/06 §5.3 "ежедневная проверка цепочки хэшей case_journal": every case
 * with journal rows written in the last 24 hours plus a random sample of
 * the rest. A break is a critical alert (Sentry fatal + fatal log) and
 * comes back in the result so the job's return value carries it too.
 */
@Injectable()
export class JournalIntegrityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly journal: CaseJournalService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(JournalIntegrityService.name);
  }

  async run(now: Date = new Date()): Promise<IntegrityRunResult> {
    const since = new Date(now.getTime() - 24 * 3600 * 1000);
    const changed = await this.prisma.caseJournal.findMany({
      where: { created_at: { gte: since } },
      select: { case_id: true },
      distinct: ['case_id'],
    });
    const sample = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT id::STRING AS id FROM cases ORDER BY random() LIMIT ${SAMPLE}`;
    const ids = new Set<string>([
      ...changed.map((r) => r.case_id),
      ...sample.map((r) => r.id),
    ]);
    const result: IntegrityRunResult = { checked: 0, broken: [] };
    for (const caseId of ids) {
      const v = await this.journal.verifyChain(caseId, this.prisma, { now });
      result.checked += 1;
      if (!v.valid) {
        result.broken.push({ caseId, brokenAt: v.brokenAt });
        this.alert(caseId, v);
      }
    }
    return result;
  }

  private alert(caseId: string, v: ChainVerification): void {
    this.logger.fatal(
      { caseId, brokenAt: v.brokenAt, checked: v.checked },
      'case_journal hash chain broken',
    );
    Sentry.captureMessage('case_journal hash chain broken', {
      level: 'fatal',
      extra: { caseId, brokenAt: v.brokenAt, checked: v.checked },
    });
  }
}
