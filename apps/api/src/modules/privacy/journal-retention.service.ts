import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, PrismaClient } from '@prisma/client';
import { heldSql } from '../../common/privacy/legal-hold';
import { PinoLogger } from 'nestjs-pino';
import { PrismaService } from '../../prisma/prisma.service';
import { forEachDatabase } from '../../sharding/for-each-database';

/** Rows per statement: short transactions, no long locks. */
const BATCH = 5000;
const MAX_PER_RUN = 2_000_000;

/**
 * docs/06 §5.3 / docs/02 §6.2–6.3: the monthly physical removal of
 * `case_journal` rows past `retain_until`, under the `lawbid_retention`
 * role (RETENTION_DATABASE_URL — the app role has no such right on the
 * table). The predicate is the only one this service ever issues: a row
 * that is not yet past `retain_until` cannot be removed through it, and a
 * row of a case or a person under a legal hold stays (round 13, S13-6).
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
    // Shard-ready step 8: the journal sits on the case-family databases, one
    // sweep per database. A dedicated retention connection (one URL) is
    // used as it is and covers its own database only.
    const parts =
      db === this.prisma
        ? await forEachDatabase(this.prisma, () => this.sweep(db, now))
        : [await this.sweep(db, now)];
    const deleted = parts.reduce((n, d) => n + d, 0);
    if (deleted > 0) this.logger.info({ deleted }, 'case_journal retention');
    return { deleted };
  }

  private async sweep(
    db: PrismaClient | PrismaService,
    now: Date,
  ): Promise<number> {
    // Owner 2026-10-28: a hold on a case or on either side keeps its journal.
    let deleted = 0;
    while (deleted < MAX_PER_RUN) {
      const n = await db.$executeRaw`
        DELETE FROM case_journal
        WHERE ctid IN (
          SELECT ctid FROM case_journal
          WHERE retain_until < ${now}
            AND NOT ${heldSql('case', Prisma.sql`case_id`)}
            AND NOT ${heldSql('user', Prisma.sql`client_id`)}
            AND (attorney_id IS NULL OR NOT ${heldSql('user', Prisma.sql`attorney_id`)})
            AND NOT ${heldSql('user', Prisma.sql`actor_user_id`)}
          ORDER BY retain_until
          LIMIT ${BATCH})`;
      deleted += n;
      if (n < BATCH) break;
      await new Promise((r) => setTimeout(r, 200));
    }
    return deleted;
  }

  async onModuleDestroy(): Promise<void> {
    await this.retention?.$disconnect();
  }
}
