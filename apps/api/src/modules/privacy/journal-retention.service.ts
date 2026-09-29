import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '@prisma/client';
import { PinoLogger } from 'nestjs-pino';
import { PrismaService } from '../../prisma/prisma.service';

/** Rows per statement: short transactions, no long locks. */
const BATCH = 5000;
const MAX_PER_RUN = 2_000_000;

/**
 * docs/06 §5.3 / docs/02 §6.2–6.3: the monthly physical removal of
 * `case_journal` rows past `retain_until`, under the `lawbid_retention`
 * role (RETENTION_DATABASE_URL — the app role has no such right on the
 * table). The predicate is the only one this service ever issues: a row
 * that is not yet past `retain_until` cannot be removed through it.
 */
@Injectable()
export class JournalRetentionService implements OnModuleDestroy {
  private retention?: PrismaClient;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(JournalRetentionService.name);
  }

  private client(): PrismaClient | PrismaService {
    const url = this.config.get<string>('RETENTION_DATABASE_URL');
    if (!url) {
      this.logger.warn(
        'RETENTION_DATABASE_URL is not set: journal retention runs on the app connection',
      );
      return this.prisma;
    }
    this.retention ??= new PrismaClient({ datasourceUrl: url });
    return this.retention;
  }

  async run(now: Date = new Date()): Promise<{ deleted: number }> {
    const db = this.client();
    let deleted = 0;
    while (deleted < MAX_PER_RUN) {
      const n = await db.$executeRaw`
        DELETE FROM case_journal
        WHERE retain_until < ${now}
        ORDER BY retain_until
        LIMIT ${BATCH}`;
      deleted += n;
      if (n < BATCH) break;
      await new Promise((r) => setTimeout(r, 200));
    }
    if (deleted > 0) this.logger.info({ deleted }, 'case_journal retention');
    return { deleted };
  }

  async onModuleDestroy(): Promise<void> {
    await this.retention?.$disconnect();
  }
}
