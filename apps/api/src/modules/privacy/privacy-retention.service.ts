import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, PrismaClient } from '@prisma/client';
import { PinoLogger } from 'nestjs-pino';
import { AppSettingsService } from '../../common/app-settings/app-settings.service';
import { heldSql, requestHeldSql } from '../../common/privacy/legal-hold';
import { PrismaService } from '../../prisma/prisma.service';
import { forEachDatabase } from '../../sharding/for-each-database';

const DAY_MS = 24 * 3600 * 1000;
/** Rows per statement: short transactions, no long locks. */
const BATCH = 5000;
/** Rows per table per run; the next night continues. */
const MAX_PER_TABLE = 1_000_000;
/** Primary-key batches of the sessions walk per run. */
const MAX_SESSION_BATCHES = 2000;
const ZERO_UUID = '00000000-0000-0000-0000-000000000000';

export interface PrivacyRetentionResult {
  auditLog: number;
  dataAccessLog: number;
  sessionIps: number;
  contactDisclosureIps: number;
  /** Tables whose purge failed (missing right, ...): the others still ran. */
  failed: string[];
}

/**
 * Owner 2026-10-25 (privacy round 13, S13-5): the retention lines of the
 * privacy policy that had no job behind them. Nightly (`privacy.retention`)
 * while `privacy.auto_retention` is on:
 * - audit_log (`privacy.retention_audit_log_days`, 1825 = 5 years): the
 *   admin action trail; rows about a held target stay;
 * - data_access_log (`privacy.retention_data_access_log_days`, 1825): what
 *   an official request looked at; rows of a request under a hold stay;
 * - sessions.ip / user_agent (`privacy.retention_session_ip_days`, 90) of
 *   sessions not used for that long are blanked (the session row stays);
 * - contact_disclosures.ip / device_id
 *   (`privacy.retention_contact_disclosure_ip_days`, 730) are blanked (the
 *   disclosure record is the legal proof and stays).
 * auth_events (IP + device) are removed by DataRetentionService
 * (`storage.retention_auth_events_days`, 730). audit_log, data_access_log
 * and contact_disclosures are append-only for the app role, so they are
 * changed under the `lawbid_retention` role (RETENTION_DATABASE_URL), like
 * the journal. Every purge skips what a legal hold covers (legal-hold.ts).
 * 0 days = keep for ever.
 */
@Injectable()
export class PrivacyRetentionService implements OnModuleDestroy {
  private retentionDb?: PrismaClient;

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: AppSettingsService,
    private readonly config: ConfigService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(PrivacyRetentionService.name);
  }

  async run(now: Date = new Date()): Promise<PrivacyRetentionResult | null> {
    if (!(await this.settings.boolean('privacy.auto_retention'))) return null;
    const [auditDays, accessDays, sessionDays, disclosureDays] =
      await Promise.all([
        this.settings.number('privacy.retention_audit_log_days'),
        this.settings.number('privacy.retention_data_access_log_days'),
        this.settings.number('privacy.retention_session_ip_days'),
        this.settings.number('privacy.retention_contact_disclosure_ip_days'),
      ]);
    const before = (days: number) => new Date(now.getTime() - days * DAY_MS);
    const result: PrivacyRetentionResult = {
      auditLog: 0,
      dataAccessLog: 0,
      sessionIps: 0,
      contactDisclosureIps: 0,
      failed: [],
    };
    const attempt = async (
      table: keyof Omit<PrivacyRetentionResult, 'failed'>,
      enabled: boolean,
      fn: () => Promise<number>,
    ): Promise<void> => {
      if (!enabled) return;
      try {
        result[table] = await fn();
      } catch (err) {
        result.failed.push(table);
        this.logger.warn(
          { table, err: err instanceof Error ? err.message : String(err) },
          'privacy retention step failed',
        );
      }
    };
    await attempt('auditLog', auditDays > 0, () =>
      this.auditLog(before(auditDays)),
    );
    await attempt('dataAccessLog', accessDays > 0, () =>
      this.dataAccessLog(before(accessDays)),
    );
    await attempt('sessionIps', sessionDays > 0, () =>
      this.sessionIps(before(sessionDays)),
    );
    await attempt('contactDisclosureIps', disclosureDays > 0, () =>
      this.contactDisclosureIps(before(disclosureDays)),
    );
    if (Object.values(result).some((n) => typeof n === 'number' && n > 0)) {
      this.logger.info(result, 'privacy retention');
    }
    return result;
  }

  /** admin trail: one write shard at a time (index created_shard,
   * created_at); rows whose target is held stay. */
  private async auditLog(cut: Date): Promise<number> {
    const db = this.retention();
    let total = 0;
    for (let shard = 0; shard < 16; shard += 1) {
      total += await this.batched(
        (limit) => db.$executeRaw`
          DELETE FROM audit_log
          WHERE ctid IN (
            SELECT a.ctid FROM audit_log a
            WHERE a.created_shard = ${shard} AND a.created_at < ${cut}
              AND NOT EXISTS (
                SELECT 1 FROM legal_holds h
                WHERE h.target_id = a.target_id AND h.target_type = a.target_type
                  AND h.released_at IS NULL
                  AND (h.expires_at IS NULL OR h.expires_at > now()))
            ORDER BY a.created_at LIMIT ${limit})`,
      );
    }
    return total;
  }

  private dataAccessLog(cut: Date): Promise<number> {
    const db = this.retention();
    return this.batched(
      (limit) => db.$executeRaw`
        DELETE FROM data_access_log
        WHERE ctid IN (
          SELECT d.ctid FROM data_access_log d
          WHERE d.accessed_at < ${cut}
            AND NOT ${requestHeldSql(Prisma.sql`d.request_id`)}
          LIMIT ${limit})`,
    );
  }

  /** Walks the table by primary key (no index on the date, like
   * SessionsCleanupJob) and blanks the network columns of old sessions. */
  private async sessionIps(cut: Date): Promise<number> {
    let cursor = ZERO_UUID;
    let blanked = 0;
    for (let i = 0; i < MAX_SESSION_BATCHES; i += 1) {
      const [row] = await this.prisma.$queryRaw<
        { last_id: string | null; scanned: bigint; updated: bigint }[]
      >(Prisma.sql`
        WITH batch AS (
          SELECT id FROM sessions
          WHERE id > ${cursor}::UUID
          ORDER BY id
          LIMIT ${BATCH}
        ),
        changed AS (
          UPDATE sessions s
          SET ip = NULL, user_agent = NULL
          FROM batch b
          WHERE s.id = b.id
            AND (s.ip IS NOT NULL OR s.user_agent IS NOT NULL)
            AND s.updated_at < ${cut}
            AND NOT ${heldSql('user', Prisma.sql`s.user_id`)}
          RETURNING s.id
        )
        SELECT (SELECT id FROM batch ORDER BY id DESC LIMIT 1)::TEXT AS last_id,
               (SELECT count(*) FROM batch) AS scanned,
               (SELECT count(*) FROM changed) AS updated`);
      blanked += Number(row?.updated ?? 0);
      if (Number(row?.scanned ?? 0) < BATCH || !row?.last_id) break;
      cursor = row.last_id;
    }
    return blanked;
  }

  /** contact_disclosures sit on the case-family databases: one sweep per
   * database (a dedicated retention URL covers its own database only). */
  private async contactDisclosureIps(cut: Date): Promise<number> {
    const db = this.retention();
    const sweep = (client: PrismaClient | PrismaService) =>
      this.batched(
        (limit) => client.$executeRaw`
          UPDATE contact_disclosures
          SET ip = NULL, device_id = NULL
          WHERE ctid IN (
            SELECT d.ctid FROM contact_disclosures d
            WHERE d.disclosed_at < ${cut}
              AND (d.ip IS NOT NULL OR d.device_id IS NOT NULL)
              AND NOT ${heldSql('case', Prisma.sql`d.case_id`)}
              AND NOT ${heldSql('user', Prisma.sql`d.client_id`)}
              AND NOT ${heldSql('user', Prisma.sql`d.attorney_id`)}
            LIMIT ${limit})`,
      );
    if (db !== this.prisma) return sweep(db);
    const parts = await forEachDatabase(this.prisma, () => sweep(this.prisma));
    return parts.reduce((n, d) => n + d, 0);
  }

  private async batched(
    step: (limit: number) => Promise<number>,
  ): Promise<number> {
    let total = 0;
    while (total < MAX_PER_TABLE) {
      const n = await step(BATCH);
      total += n;
      if (n < BATCH) break;
      await new Promise((r) => setTimeout(r, 200));
    }
    return total;
  }

  private retention(): PrismaClient | PrismaService {
    const url = this.config.get<string>('RETENTION_DATABASE_URL');
    if (!url) return this.prisma;
    this.retentionDb ??= new PrismaClient({ datasourceUrl: url });
    return this.retentionDb;
  }

  async onModuleDestroy(): Promise<void> {
    await this.retentionDb?.$disconnect();
  }
}
