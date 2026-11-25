import { Client, type ClientConfig } from 'pg';
import { pgAdapterConfig } from '../../prisma/pg-adapter';
import { CDC_PUBLICATION } from './cdc-key-map';

/** One replication slot per physical database (slots are per server). */
export const CDC_SLOT = 'lawbid_cache_cdc';

export interface CdcReadiness {
  walLevel: string;
  publication: boolean;
  /** REPLICATION attribute, superuser, or member of RDS's rds_replication. */
  canReplicate: boolean;
}

export interface CdcSlotRow {
  active: boolean;
  /** PG 13+: reserved | extended | unreserved | lost. */
  walStatus: string | null;
  /** WAL the slot keeps on disk (pg_current_wal_lsn - restart_lsn). */
  retainedBytes: number;
  /** WAL not yet confirmed by the consumer (current - confirmed_flush). */
  behindBytes: number;
}

/** Why the worker does not stream, for the admin light. */
export type CdcBlocker =
  'wal_level' | 'no_publication' | 'no_replication_right';

export function blockers(r: CdcReadiness): CdcBlocker[] {
  const out: CdcBlocker[] = [];
  if (r.walLevel !== 'logical') out.push('wal_level');
  if (!r.publication) out.push('no_publication');
  if (!r.canReplicate) out.push('no_replication_right');
  return out;
}

/**
 * Drop-on-stuck guard (AWS «Best practices for Amazon RDS for PostgreSQL
 * replication slots»: an unconsumed logical slot keeps WAL until the disk
 * is full and the database stops). The slot is dropped when it has lost
 * its WAL (`wal_status = lost`, it can never be read again) or keeps more
 * than [maxMb] of WAL. Dropping costs only the invalidations of the gap:
 * the in-request path keeps working and every key has its TTL.
 * [maxMb] 0 = no size guard (only `lost`).
 */
export function slotVerdict(
  slot: CdcSlotRow | null,
  maxMb: number,
): 'ok' | 'drop' {
  if (!slot) return 'ok';
  if (slot.walStatus === 'lost') return 'drop';
  if (maxMb > 0 && slot.retainedBytes > maxMb * 1024 * 1024) return 'drop';
  return 'ok';
}

/** node-pg settings of a database URL in our Prisma-6 shape: the same TLS
 * rules as the app's pool (RDS: TLS on; `sslaccept=strict` checks the CA),
 * the Prisma-only parameters removed. Shared by the probes and the stream. */
export function cdcClientConfig(url: string): ClientConfig {
  const { pool } = pgAdapterConfig(url);
  return {
    connectionString: pool.connectionString,
    ssl: pool.ssl,
    keepAlive: true,
    application_name: 'lawbid-cache-cdc',
  };
}

/** A short plain connection (never the replication protocol). */
export async function withClient<T>(
  url: string,
  fn: (c: Client) => Promise<T>,
): Promise<T> {
  const c = new Client({
    ...cdcClientConfig(url),
    statement_timeout: 10_000,
    connectionTimeoutMillis: 10_000,
  });
  await c.connect();
  try {
    return await fn(c);
  } finally {
    await c.end().catch(() => undefined);
  }
}

export async function readReadiness(c: Client): Promise<CdcReadiness> {
  const r = await c.query<{
    wal: string;
    pub: boolean;
    rep: boolean;
  }>(
    `SELECT current_setting('wal_level') AS wal,
            EXISTS (SELECT 1 FROM pg_publication WHERE pubname = $1) AS pub,
            COALESCE((SELECT rolreplication OR rolsuper FROM pg_roles
                       WHERE rolname = current_user), false)
            OR EXISTS (SELECT 1 FROM pg_roles r
                        WHERE r.rolname = 'rds_replication'
                          AND pg_has_role(current_user, r.oid, 'member')) AS rep`,
    [CDC_PUBLICATION],
  );
  const row = r.rows[0];
  return {
    walLevel: row?.wal ?? 'unknown',
    publication: row?.pub === true,
    canReplicate: row?.rep === true,
  };
}

export async function readSlot(c: Client): Promise<CdcSlotRow | null> {
  const r = await c.query<{
    active: boolean;
    wal_status: string | null;
    retained: number | null;
    behind: number | null;
  }>(
    `SELECT active, wal_status,
            pg_wal_lsn_diff(pg_current_wal_lsn(), restart_lsn)::float8 AS retained,
            pg_wal_lsn_diff(pg_current_wal_lsn(), confirmed_flush_lsn)::float8 AS behind
       FROM pg_replication_slots
      WHERE slot_name = $1 AND database = current_database()`,
    [CDC_SLOT],
  );
  const row = r.rows[0];
  if (!row) return null;
  return {
    active: row.active,
    walStatus: row.wal_status,
    retainedBytes: Math.max(0, Number(row.retained ?? 0)),
    behindBytes: Math.max(0, Number(row.behind ?? 0)),
  };
}

export async function createSlot(c: Client): Promise<void> {
  await c.query(`SELECT pg_create_logical_replication_slot($1, 'pgoutput')`, [
    CDC_SLOT,
  ]);
}

/** Drops the slot; an active one only with [terminate] (its walsender is
 * ended first — the same role may end its own sessions). */
export async function dropSlot(c: Client, terminate: boolean): Promise<void> {
  if (terminate) {
    await c.query(
      `SELECT pg_terminate_backend(active_pid) FROM pg_replication_slots
        WHERE slot_name = $1 AND database = current_database() AND active`,
      [CDC_SLOT],
    );
    // The walsender needs a moment to release the slot.
    await new Promise((r) => setTimeout(r, 500));
  }
  await c.query(
    `SELECT pg_drop_replication_slot(slot_name) FROM pg_replication_slots
      WHERE slot_name = $1 AND database = current_database() AND NOT active`,
    [CDC_SLOT],
  );
}
