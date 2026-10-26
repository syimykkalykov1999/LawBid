import type { Sql, SqlDb } from './sql';

/**
 * Online conversion of ONE big append-heavy table to a monthly RANGE
 * partitioned table (docs/architecture/TABLE_PARTITIONING_READY.md).
 *
 * Why this shape (Prisma does not create partitioned tables, and a primary
 * key of a partitioned table must contain the partition key):
 *   1. build `<t>__part` (same columns, PK (id, created_at), same indexes and
 *      outgoing foreign keys, monthly partitions + a DEFAULT one);
 *   2. a trigger on the old table copies every INSERT / UPDATE / DELETE to the
 *      new one from this moment (no gap, no downtime);
 *   3. backfill the old rows in small batches (resumable cursor);
 *   4. verify per-month counts (and repair differences);
 *   5. swap the names in one short transaction (lock_timeout, retried);
 *   6. keep a REVERSE trigger new -> old, so «Вернуть как было» is another
 *      cheap rename until «Завершить» drops the old copy.
 * The Prisma schema is not touched: the model still says `@id id`, the
 * database has the wider key. Nothing here runs unless an admin starts it
 * (or the CLI is called by hand); migrations never convert a table.
 *
 * HASH mode (`spec.hash` = number of partitions; messages, group messages,
 * notifications): same steps, with these differences. The table already has
 * the composite key (id, <hash key>) from an expand migration, so the new
 * table keeps it. The copy walks the key (id). Triggers (shard_fill) are
 * re-created on the new table in the swap. Foreign keys that POINT AT the
 * table (children, and the self reference of replies) are re-pointed to the
 * new table inside the swap (added NOT VALID, validated right after), and
 * back on undo. No monthly job: hash partitions need no upkeep.
 */

export interface PartitionSpec {
  table: string;
  /** Partition key: a NOT NULL timestamptz column, immutable once written. */
  key: string;
  label: string;
  /** HASH mode: number of partitions (the key is a uuid column). */
  hash?: number;
}

/**
 * Tables the online runner may convert later by MONTH (whitelist: no free SQL
 * names). audit_log, auth_events are ALREADY partitioned by month (migration
 * 20261026120000). messages, chat_group_messages and notifications are
 * converted by HASH only when the admin turns it on (HASH_PARTITIONED).
 */
export const PARTITION_TABLES: readonly PartitionSpec[] = [
  {
    table: 'data_access_log',
    key: 'accessed_at',
    label: 'Журнал доступа к данным',
  },
];

/**
 * Converted by the online runner to native HASH partitioning (16 partitions)
 * ONLY when the admin switches it on («Вкл» or «Авто» at the growth
 * threshold, default «Выкл»): at small sizes the plain tables are faster.
 * No monthly job, nothing to keep up. The label says the key (the admin card
 * reads «хеш»). `key` is the hash column; their composite key (id, key)
 * already exists (migration 20261029300000, the expand step).
 */
export const HASH_PARTITIONED: readonly PartitionSpec[] = [
  {
    table: 'messages',
    key: 'conversation_id',
    hash: 16,
    label: 'Сообщения чатов (по хешу чата)',
  },
  {
    table: 'chat_group_messages',
    key: 'group_id',
    hash: 16,
    label: 'Сообщения групп (по хешу группы)',
  },
  {
    table: 'notifications',
    key: 'user_id',
    hash: 16,
    label: 'Уведомления (по хешу человека)',
  },
];

/** Partitioned by the migration; the daily job keeps their future months. */
export const MIGRATED_PARTITIONED: readonly PartitionSpec[] = [
  { table: 'audit_log', key: 'created_at', label: 'Журнал действий админов' },
  { table: 'auth_events', key: 'created_at', label: 'События входа' },
];

export function specOf(table: string): PartitionSpec | undefined {
  return [
    ...PARTITION_TABLES,
    ...MIGRATED_PARTITIONED,
    ...HASH_PARTITIONED,
  ].find((s) => s.table === table);
}

export const GROWTH_ALARM_ROWS = 50_000_000;
export const FINALIZE_AFTER_DAYS = 7;

export type Phase =
  'prepare' | 'backfill' | 'verify' | 'swap' | 'swapped' | 'done' | 'aborted';

export interface JobRow {
  tbl: string;
  phase: Phase;
  paused: boolean;
  cursor_at: string | null;
  cursor_id: string | null;
  rows_total: number;
  rows_copied: number;
  started_at: string;
  swapped_at: string | null;
  updated_at: string;
  error: string | null;
  error_count: number;
  claimed_until: string | null;
  started_by: string | null;
}

export interface Precheck {
  ok: boolean;
  reasons: string[];
}

export interface TableStats {
  table: string;
  exists: boolean;
  partitioned: boolean;
  rows: number;
  bytes: number;
}

const IDENT = /^[a-z][a-z0-9_]{0,62}$/;
function ident(s: string): string {
  if (!IDENT.test(s)) throw new Error(`bad identifier: ${s}`);
  return `"${s}"`;
}
const q = (t: string) => `public.${ident(t)}`;

export const names = (t: string) => ({
  base: t,
  part: `${t}__part`,
  old: `${t}__old`,
  fwdFn: `${t}__fwd_sync`,
  revFn: `${t}__rev_sync`,
  fwdTrg: `${t}__fwd_trg`,
  revTrg: `${t}__rev_trg`,
});

export function monthStart(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}
export function addMonths(d: Date, n: number): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1));
}
export function partitionName(t: string, d: Date): string {
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${t}_p${d.getUTCFullYear()}_${m}`;
}
const iso = (d: Date) => d.toISOString().replace('T', ' ').replace('Z', '+00');

/** CREATE TABLE ... PARTITION OF for each month in [from, to]. */
export function partitionDdl(
  t: string,
  from: Date,
  to: Date,
  parent: string = names(t).part,
): string[] {
  const out: string[] = [];
  for (let m = monthStart(from); m <= monthStart(to); m = addMonths(m, 1)) {
    out.push(
      `CREATE TABLE IF NOT EXISTS ${q(partitionName(t, m))} PARTITION OF ${q(parent)} ` +
        `FOR VALUES FROM ('${iso(m)}') TO ('${iso(addMonths(m, 1))}')`,
    );
  }
  return out;
}

interface ColumnInfo {
  name: string;
  generated: boolean;
}

export class PartitionRunner {
  private readonly extra: PartitionSpec[] = [];

  constructor(
    private readonly db: SqlDb,
    private readonly now: () => Date = () => new Date(),
  ) {}

  /** Tests only: allow a table that is not on the whitelist. */
  allow(spec: PartitionSpec): this {
    this.extra.push(spec);
    return this;
  }

  private specFor(table: string): PartitionSpec | undefined {
    return specOf(table) ?? this.extra.find((s) => s.table === table);
  }

  // ----------------------------------------------------------- read only --

  async stats(table: string): Promise<TableStats> {
    const r = await this.db.rows<{
      relkind: string;
      reltuples: number;
      bytes: number;
      live: number | null;
    }>(
      `SELECT c.relkind::text AS relkind, c.reltuples::float8 AS reltuples,
              pg_total_relation_size(c.oid)::bigint AS bytes,
              (SELECT n_live_tup FROM pg_stat_user_tables s WHERE s.relid = c.oid) AS live
         FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relname = $1`,
      table,
    );
    if (r.length === 0) {
      return { table, exists: false, partitioned: false, rows: 0, bytes: 0 };
    }
    const x = r[0];
    const est = x.reltuples >= 0 ? x.reltuples : Number(x.live ?? 0);
    let rows = Math.round(est);
    let bytes = Number(x.bytes);
    if (x.relkind === 'p') {
      // Partitioned parent: reltuples is 0/-1, add up the partitions.
      const s = await this.db.rows<{ rows: number; bytes: number }>(
        `SELECT COALESCE(sum(GREATEST(c.reltuples, 0)), 0)::float8 AS rows,
                COALESCE(sum(pg_total_relation_size(c.oid)), 0)::bigint AS bytes
           FROM pg_inherits i JOIN pg_class c ON c.oid = i.inhrelid
          WHERE i.inhparent = to_regclass($1)`,
        q(table),
      );
      rows = Math.round(Number(s[0]?.rows ?? 0));
      bytes = Number(s[0]?.bytes ?? 0);
    }
    return { table, exists: true, partitioned: x.relkind === 'p', rows, bytes };
  }

  private async columns(table: string): Promise<ColumnInfo[]> {
    const r = await this.db.rows<{ name: string; generated: string }>(
      `SELECT a.attname AS name, a.attgenerated::text AS generated
         FROM pg_attribute a
        WHERE a.attrelid = to_regclass($1) AND a.attnum > 0 AND NOT a.attisdropped
        ORDER BY a.attnum`,
      q(table),
    );
    return r.map((c) => ({ name: c.name, generated: c.generated !== '' }));
  }

  private async pkCols(table: string): Promise<string[]> {
    const r = await this.db.rows<{ cols: string | null }>(
      `SELECT string_agg(a.attname, ',' ORDER BY k.ord) AS cols
         FROM pg_constraint c
         CROSS JOIN LATERAL unnest(c.conkey) WITH ORDINALITY AS k(attnum, ord)
         JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.attnum
        WHERE c.conrelid = to_regclass($1) AND c.contype = 'p'`,
      q(table),
    );
    return r[0]?.cols ? r[0].cols.split(',') : [];
  }

  /** HASH mode checks (the table already has the composite key). */
  private async precheckHash(spec: PartitionSpec): Promise<string[]> {
    const t = spec.table;
    const reasons: string[] = [];
    const cols = await this.columns(t);
    if (!cols.some((c) => c.name === 'id')) reasons.push('нет колонки id');
    const keyCol = await this.db.rows<{ typ: string; notnull: boolean }>(
      `SELECT format_type(a.atttypid, a.atttypmod) AS typ, a.attnotnull AS notnull
         FROM pg_attribute a WHERE a.attrelid = to_regclass($1) AND a.attname = $2`,
      q(t),
      spec.key,
    );
    if (keyCol.length === 0) reasons.push(`нет колонки ${spec.key}`);
    else if (keyCol[0].typ !== 'uuid' || !keyCol[0].notnull) {
      reasons.push(`${spec.key} должна быть uuid NOT NULL`);
    }
    const pk = await this.pkCols(t);
    if (pk.length !== 2 || pk[0] !== 'id' || pk[1] !== spec.key) {
      reasons.push(
        `первичный ключ должен быть (id, ${spec.key}): сначала выкатить миграцию 20261029300000`,
      );
    }
    const uniq = await this.db.rows<{ name: string }>(
      `SELECT i.indexrelid::regclass::text AS name
         FROM pg_index i
        WHERE i.indrelid = to_regclass($1) AND i.indisunique AND NOT i.indisprimary
          AND NOT EXISTS (
            SELECT 1 FROM pg_attribute a
             WHERE a.attrelid = i.indrelid AND a.attname = $2
               AND a.attnum = ANY (i.indkey::int2[]))`,
      q(t),
      spec.key,
    );
    if (uniq.length > 0) {
      reasons.push(
        `уникальные индексы без ${spec.key} не переносятся: ${uniq.map((u) => u.name).join(', ')}`,
      );
    }
    const seq = await this.db.rows<{ name: string }>(
      `SELECT a.attname AS name FROM pg_attribute a
         LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
        WHERE a.attrelid = to_regclass($1) AND a.attnum > 0 AND NOT a.attisdropped
          AND (a.attidentity <> '' OR pg_get_expr(d.adbin, d.adrelid) LIKE 'nextval(%')`,
      q(t),
    );
    if (seq.length > 0) reasons.push('есть счётчики (serial/identity)');
    return reasons;
  }

  /** Everything that would make the conversion unsafe or unsupported. */
  async precheck(spec: PartitionSpec): Promise<Precheck> {
    const t = spec.table;
    const reasons: string[] = [];
    const kind = await this.db.rows<{ relkind: string }>(
      `SELECT relkind::text AS relkind FROM pg_class
        WHERE oid = to_regclass($1)`,
      q(t),
    );
    if (kind.length === 0) return { ok: false, reasons: ['таблицы нет'] };
    if (kind[0].relkind === 'p') {
      return { ok: false, reasons: ['таблица уже разделена'] };
    }
    if (spec.hash) {
      const r = await this.precheckHash(spec);
      return { ok: r.length === 0, reasons: r };
    }
    const cols = await this.columns(t);
    if (!cols.some((c) => c.name === 'id')) reasons.push('нет колонки id');
    const keyCol = await this.db.rows<{ typ: string; notnull: boolean }>(
      `SELECT format_type(a.atttypid, a.atttypmod) AS typ, a.attnotnull AS notnull
         FROM pg_attribute a WHERE a.attrelid = to_regclass($1) AND a.attname = $2`,
      q(t),
      spec.key,
    );
    if (keyCol.length === 0) reasons.push(`нет колонки ${spec.key}`);
    else if (
      !keyCol[0].typ.startsWith('timestamp with time zone') ||
      !keyCol[0].notnull
    ) {
      reasons.push(`${spec.key} должна быть timestamptz NOT NULL`);
    }
    const pk = await this.db.rows<{ cols: string }>(
      `SELECT string_agg(a.attname, ',' ORDER BY k.ord) AS cols
         FROM pg_constraint c
         CROSS JOIN LATERAL unnest(c.conkey) WITH ORDINALITY AS k(attnum, ord)
         JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.attnum
        WHERE c.conrelid = to_regclass($1) AND c.contype = 'p'`,
      q(t),
    );
    if (pk[0]?.cols !== 'id') {
      reasons.push('первичный ключ должен быть ровно (id)');
    }
    const inbound = await this.db.rows<{ n: string }>(
      `SELECT conrelid::regclass::text AS n FROM pg_constraint
        WHERE contype = 'f' AND confrelid = to_regclass($1)`,
      q(t),
    );
    if (inbound.length > 0) {
      reasons.push(
        `на таблицу ссылаются внешние ключи (${inbound.map((i) => i.n).join(', ')}): ` +
          'у разделённой таблицы ключ шире, ссылки пришлось бы переделать',
      );
    }
    const uniq = await this.db.rows<{ name: string }>(
      `SELECT i.indexrelid::regclass::text AS name
         FROM pg_index i
        WHERE i.indrelid = to_regclass($1) AND i.indisunique AND NOT i.indisprimary
          AND NOT EXISTS (
            SELECT 1 FROM pg_attribute a
             WHERE a.attrelid = i.indrelid AND a.attname = $2
               AND a.attnum = ANY (i.indkey::int2[]))`,
      q(t),
      spec.key,
    );
    if (uniq.length > 0) {
      reasons.push(
        `уникальные индексы без ${spec.key} не переносятся: ${uniq.map((u) => u.name).join(', ')}`,
      );
    }
    const seq = await this.db.rows<{ name: string }>(
      `SELECT a.attname AS name FROM pg_attribute a
         LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
        WHERE a.attrelid = to_regclass($1) AND a.attnum > 0 AND NOT a.attisdropped
          AND (a.attidentity <> '' OR pg_get_expr(d.adbin, d.adrelid) LIKE 'nextval(%')`,
      q(t),
    );
    if (seq.length > 0) reasons.push('есть счётчики (serial/identity)');
    const trg = await this.db.rows<{ name: string }>(
      `SELECT tgname AS name FROM pg_trigger
        WHERE tgrelid = to_regclass($1) AND NOT tgisinternal`,
      q(t),
    );
    if (trg.length > 0) {
      reasons.push(`есть свои триггеры (${trg.map((x) => x.name).join(', ')})`);
    }
    const idx = await this.db.rows<{ n: number }>(
      `SELECT count(*)::int AS n FROM pg_index i
        WHERE i.indrelid = to_regclass($1) AND i.indkey[0] = (
          SELECT attnum FROM pg_attribute WHERE attrelid = i.indrelid AND attname = $2)`,
      q(t),
      spec.key,
    );
    if ((idx[0]?.n ?? 0) === 0) {
      reasons.push(`нужен индекс, начинающийся с ${spec.key} (чтение пачками)`);
    }
    return { ok: reasons.length === 0, reasons };
  }

  /** The exact steps, for the dry run and the runbook. No writes. */
  async plan(spec: PartitionSpec): Promise<{
    precheck: Precheck;
    stats: TableStats;
    months: number;
    firstMonth: string | null;
    steps: string[];
    extraDiskBytes: number;
  }> {
    const precheck = await this.precheck(spec);
    const stats = await this.stats(spec.table);
    let firstMonth: string | null = null;
    let months = 0;
    if (spec.hash) {
      const n = names(spec.table);
      return {
        precheck,
        stats,
        months: 0,
        firstMonth: null,
        extraDiskBytes: Math.round(stats.bytes * 1.1),
        steps: [
          `1. создать ${n.part}: те же колонки и ключ (id, ${spec.key}), ${spec.hash} кусков по хешу ${spec.key}`,
          '2. перенести индексы и внешние ключи наружу на новую таблицу',
          `3. поставить триггер на ${n.base}: новые записи сразу копируются в ${n.part}`,
          '4. копировать старые строки пачками по id (можно остановить и продолжить)',
          '5. сверить число строк и поправить расхождения',
          `6. за доли секунды: поменять имена, перенести триггеры, перевесить внешние ключи других таблиц на новую (lock_timeout 3 с, повтор)`,
          `7. обратный триггер ${n.base} -> ${n.old}: «Вернуть как было» остаётся быстрым переименованием`,
          `8. через ${FINALIZE_AFTER_DAYS} дней «Завершить»: убрать триггер и удалить ${n.old}`,
        ],
      };
    }
    if (stats.exists && !stats.partitioned) {
      const m = await this.db.rows<{ m: Date | null }>(
        `SELECT min(${ident(spec.key)}) AS m FROM ${q(spec.table)}`,
      );
      const min = m[0]?.m ? new Date(m[0].m) : this.now();
      const first = monthStart(min);
      const last = addMonths(monthStart(this.now()), 3);
      for (let x = first; x <= last; x = addMonths(x, 1)) months++;
      firstMonth = first.toISOString().slice(0, 7);
    }
    const n = names(spec.table);
    return {
      precheck,
      stats,
      months,
      firstMonth,
      extraDiskBytes: Math.round(stats.bytes * 1.1),
      steps: [
        `1. создать ${n.part}: те же колонки, ключ (id, ${spec.key}), ${months} месячных кусков + запасной`,
        '2. перенести индексы и внешние ключи на новую таблицу',
        `3. поставить триггер на ${n.base}: новые записи сразу копируются в ${n.part}`,
        `4. копировать старые строки пачками (можно остановить и продолжить)`,
        '5. сверить число строк по месяцам и поправить расхождения',
        `6. за доли секунды поменять имена: ${n.base} -> ${n.old}, ${n.part} -> ${n.base} (lock_timeout 3 с, повтор)`,
        `7. обратный триггер ${n.base} -> ${n.old}: «Вернуть как было» остаётся быстрым переименованием`,
        `8. через ${FINALIZE_AFTER_DAYS} дней «Завершить»: убрать триггер и удалить ${n.old}`,
      ],
    };
  }

  // -------------------------------------------------------------- state ---

  async ensureStateTable(): Promise<void> {
    await this.db.run(`CREATE TABLE IF NOT EXISTS public._partition_job (
      tbl text PRIMARY KEY,
      phase text NOT NULL,
      paused boolean NOT NULL DEFAULT false,
      cursor_at timestamptz,
      cursor_id text,
      rows_total bigint NOT NULL DEFAULT 0,
      rows_copied bigint NOT NULL DEFAULT 0,
      started_at timestamptz NOT NULL DEFAULT now(),
      swapped_at timestamptz,
      updated_at timestamptz NOT NULL DEFAULT now(),
      error text,
      error_count int NOT NULL DEFAULT 0,
      claimed_until timestamptz,
      started_by text)`);
  }

  async job(table: string): Promise<JobRow | null> {
    const exists = await this.db.rows<{ t: string | null }>(
      `SELECT to_regclass('public._partition_job')::text AS t`,
    );
    if (!exists[0]?.t) return null;
    const r = await this.db.rows<JobRow>(
      `SELECT tbl, phase, paused, cursor_at::text, cursor_id, rows_total, rows_copied,
              started_at::text, swapped_at::text, updated_at::text, error, error_count,
              claimed_until::text, started_by
         FROM public._partition_job WHERE tbl = $1`,
      table,
    );
    return r[0] ?? null;
  }

  async activeJobs(): Promise<JobRow[]> {
    const exists = await this.db.rows<{ t: string | null }>(
      `SELECT to_regclass('public._partition_job')::text AS t`,
    );
    if (!exists[0]?.t) return [];
    return this.db.rows<JobRow>(
      `SELECT tbl, phase, paused, cursor_at::text, cursor_id, rows_total, rows_copied,
              started_at::text, swapped_at::text, updated_at::text, error, error_count,
              claimed_until::text, started_by
         FROM public._partition_job
        WHERE phase IN ('prepare','backfill','verify','swap')`,
    );
  }

  private async setPhase(table: string, phase: Phase): Promise<void> {
    await this.db.run(
      `UPDATE public._partition_job SET phase = $2, error = NULL, error_count = 0,
              updated_at = now() WHERE tbl = $1`,
      table,
      phase,
    );
  }

  // ------------------------------------------------------------- actions --

  /** Queue the conversion. The work happens in `tick` (worker or CLI). */
  async start(spec: PartitionSpec, by: string): Promise<JobRow> {
    const pre = await this.precheck(spec);
    if (!pre.ok) throw new Error(`нельзя начать: ${pre.reasons.join('; ')}`);
    await this.ensureStateTable();
    const cur = await this.job(spec.table);
    if (cur && !['done', 'aborted'].includes(cur.phase)) {
      throw new Error(`уже запущено (${cur.phase})`);
    }
    await this.db.run(
      `DELETE FROM public._partition_job WHERE tbl = $1`,
      spec.table,
    );
    await this.db.run(
      `INSERT INTO public._partition_job (tbl, phase, started_by) VALUES ($1, 'prepare', $2)`,
      spec.table,
      by,
    );
    return (await this.job(spec.table))!;
  }

  async pause(table: string, paused: boolean): Promise<void> {
    await this.db.run(
      `UPDATE public._partition_job SET paused = $2, updated_at = now() WHERE tbl = $1`,
      table,
      paused,
    );
  }

  /** Clear an error so the next tick tries again. */
  async retry(table: string): Promise<void> {
    await this.db.run(
      `UPDATE public._partition_job SET error = NULL, error_count = 0, updated_at = now() WHERE tbl = $1`,
      table,
    );
  }

  /** Before the swap: forget everything, the old table was never touched. */
  async abort(spec: PartitionSpec): Promise<void> {
    const j = await this.job(spec.table);
    if (!j || !['prepare', 'backfill', 'verify', 'swap'].includes(j.phase)) {
      throw new Error('прервать можно только до переключения');
    }
    const n = names(spec.table);
    await this.db.run(
      `DROP TRIGGER IF EXISTS ${ident(n.fwdTrg)} ON ${q(spec.table)}`,
    );
    await this.db.run(`DROP FUNCTION IF EXISTS public.${ident(n.fwdFn)}()`);
    await this.db.run(`DROP TABLE IF EXISTS ${q(n.part)}`);
    await this.setPhase(spec.table, 'aborted');
  }

  /**
   * After the swap: swap the names back. Safe because the reverse trigger
   * kept the old table complete. The partitioned copy is dropped.
   */
  async undo(spec: PartitionSpec): Promise<void> {
    const j = await this.job(spec.table);
    if (!j || j.phase !== 'swapped') {
      throw new Error(
        'вернуть можно только после переключения и до «Завершить»',
      );
    }
    const n = names(spec.table);
    let kids: { child: string; name: string; def: string }[] = [];
    await this.db.tx(async (t) => {
      await t.run(`SET LOCAL lock_timeout = '3s'`);
      await t.run(
        `LOCK TABLE ${q(n.base)}, ${q(n.old)} IN ACCESS EXCLUSIVE MODE`,
      );
      await t.run(`DROP TRIGGER IF EXISTS ${ident(n.revTrg)} ON ${q(n.base)}`);
      if (spec.hash) {
        kids = await this.inboundKids(t, n.base);
        await this.dropKids(t, kids);
      }
      // Partitioned side: originals -> __p ; old side: __o -> originals.
      await this.renameObjs(
        t,
        n.base,
        () => true,
        (x) =>
          x === `${spec.table}_pkey` ? `${n.part}_pk` : `${x.slice(0, 55)}__p`,
      );
      await this.renameObjs(
        t,
        n.old,
        (x) => x.endsWith('__o'),
        (x) => x.replace(/__o$/, ''),
      );
      await t.run(`ALTER TABLE ${q(n.base)} RENAME TO ${ident(n.part)}`);
      await t.run(`ALTER TABLE ${q(n.old)} RENAME TO ${ident(n.base)}`);
      if (spec.hash) await this.addKids(t, kids);
    });
    if (spec.hash) await this.validateKids(kids);
    await this.db.run(`DROP TABLE IF EXISTS ${q(n.part)}`);
    await this.db.run(`DROP FUNCTION IF EXISTS public.${ident(n.revFn)}()`);
    await this.db.run(`DROP FUNCTION IF EXISTS public.${ident(n.fwdFn)}()`);
    await this.setPhase(spec.table, 'aborted');
  }

  /** Point of no return: the old copy is deleted. */
  async finalize(spec: PartitionSpec, force = false): Promise<void> {
    const j = await this.job(spec.table);
    if (!j || j.phase !== 'swapped' || !j.swapped_at) {
      throw new Error('завершить можно только после переключения');
    }
    const ageDays =
      (this.now().getTime() - new Date(j.swapped_at).getTime()) / 86_400_000;
    if (!force && ageDays < FINALIZE_AFTER_DAYS) {
      throw new Error(
        `рано: старая копия хранится ещё ${Math.ceil(FINALIZE_AFTER_DAYS - ageDays)} дн.`,
      );
    }
    const n = names(spec.table);
    await this.db.run(
      `DROP TRIGGER IF EXISTS ${ident(n.revTrg)} ON ${q(n.base)}`,
    );
    await this.db.run(`DROP FUNCTION IF EXISTS public.${ident(n.revFn)}()`);
    await this.db.run(`DROP FUNCTION IF EXISTS public.${ident(n.fwdFn)}()`);
    await this.db.run(`DROP TABLE IF EXISTS ${q(n.old)}`);
    await this.setPhase(spec.table, 'done');
  }

  /** Months ahead that still have no partition (run daily after the swap). */
  async ensureFuture(table: string, monthsAhead = 3): Promise<number> {
    const sp = this.specFor(table);
    if (!sp) throw new Error('unknown table');
    if (sp.hash) return 0; // hash partitions need no upkeep
    const st = await this.stats(table);
    if (!st.partitioned) return 0;
    const ddl = partitionDdl(
      table,
      addMonths(monthStart(this.now()), 0),
      addMonths(monthStart(this.now()), monthsAhead),
      table,
    );
    for (const d of ddl) await this.db.run(d);
    return ddl.length;
  }

  // --------------------------------------------------------------- tick ---

  /**
   * Does a bounded amount of work (about `budgetMs`) for every running job.
   * Safe to call from several workers: a lease row stops a second one.
   */
  async tick(budgetMs = 40_000): Promise<{ worked: string[] }> {
    const worked: string[] = [];
    const deadline = Date.now() + budgetMs;
    for (const j of await this.activeJobs()) {
      const spec = this.specFor(j.tbl);
      if (!spec || j.paused || j.error_count >= 3) continue;
      const got = await this.db.rows<{ tbl: string }>(
        `UPDATE public._partition_job SET claimed_until = now() + interval '2 minutes'
          WHERE tbl = $1 AND (claimed_until IS NULL OR claimed_until < now())
          RETURNING tbl`,
        j.tbl,
      );
      if (got.length === 0) continue;
      worked.push(j.tbl);
      try {
        await this.advance(spec, deadline);
      } catch (e) {
        const msg = (e instanceof Error ? e.message : String(e)).slice(0, 500);
        await this.db.run(
          `UPDATE public._partition_job SET error = $2, error_count = error_count + 1,
                  updated_at = now() WHERE tbl = $1`,
          j.tbl,
          msg,
        );
      } finally {
        await this.db.run(
          `UPDATE public._partition_job SET claimed_until = NULL WHERE tbl = $1`,
          j.tbl,
        );
      }
    }
    return { worked };
  }

  private async advance(spec: PartitionSpec, deadline: number): Promise<void> {
    for (let guard = 0; guard < 100_000; guard++) {
      if (guard > 0 && Date.now() >= deadline) return; // at least one step per tick
      const j = await this.job(spec.table);
      if (!j || j.paused || j.error) return;
      if (j.phase === 'prepare') await this.prepare(spec);
      else if (j.phase === 'backfill') await this.backfillBatch(spec, j, 5000);
      else if (j.phase === 'verify') await this.verify(spec);
      else if (j.phase === 'swap') {
        await this.swap(spec);
        return;
      } else return;
    }
  }

  // ---------------------------------------------------------- the steps ---

  private async prepare(spec: PartitionSpec): Promise<void> {
    const t = spec.table;
    const n = names(t);
    const cols = await this.columns(t);
    const plain = cols.filter((c) => !c.generated).map((c) => c.name);
    const list = plain.map(ident).join(', ');
    const mn = spec.hash
      ? []
      : await this.db.rows<{ m: Date | null }>(
          `SELECT min(${ident(spec.key)}) AS m FROM ${q(t)}`,
        );
    const first = spec.hash
      ? this.now()
      : monthStart(mn[0]?.m ? new Date(mn[0].m) : this.now());
    const last = addMonths(monthStart(this.now()), 3);

    await this.db.run(`DROP TABLE IF EXISTS ${q(n.part)}`);
    await this.db.run(
      `CREATE TABLE ${q(n.part)} (LIKE ${q(t)} INCLUDING DEFAULTS INCLUDING CONSTRAINTS ` +
        `INCLUDING GENERATED INCLUDING STORAGE INCLUDING COMMENTS) PARTITION BY ${spec.hash ? 'HASH' : 'RANGE'} (${ident(spec.key)})`,
    );
    await this.db.run(
      `ALTER TABLE ${q(n.part)} ADD CONSTRAINT ${ident(n.part + '_pk')} PRIMARY KEY (id, ${ident(spec.key)})`,
    );
    if (spec.hash) {
      for (let i = 0; i < spec.hash; i++) {
        await this.db.run(
          `CREATE TABLE ${q(`${t}_h${String(i).padStart(2, '0')}`)} PARTITION OF ${q(n.part)} ` +
            `FOR VALUES WITH (MODULUS ${spec.hash}, REMAINDER ${i})`,
        );
      }
    } else {
      await this.db.run(
        `CREATE TABLE ${q(t + '_default')} PARTITION OF ${q(n.part)} DEFAULT`,
      );
      for (const d of partitionDdl(t, first, last)) await this.db.run(d);
    }

    // Secondary indexes: same definition, new name, on the new table.
    const idx = await this.db.rows<{ name: string; def: string }>(
      `SELECT i.relname AS name, pg_get_indexdef(i.oid) AS def
         FROM pg_index x JOIN pg_class i ON i.oid = x.indexrelid
        WHERE x.indrelid = to_regclass($1) AND NOT x.indisprimary`,
      q(t),
    );
    for (const i of idx) {
      const newName = `${i.name.slice(0, 55)}__p`;
      const def = i.def.replace(
        /^CREATE (UNIQUE )?INDEX \S+ ON (ONLY )?\S+/,
        `CREATE $1INDEX ${ident(newName)} ON ${q(n.part)}`,
      );
      if (def === i.def) throw new Error(`cannot rewrite index ${i.name}`);
      await this.db.run(def);
    }
    // Outgoing foreign keys (valid while the table is empty: fast).
    // (The self reference of replies is added to the new table in the swap.)
    const fks = await this.db.rows<{ name: string; def: string }>(
      `SELECT conname AS name, pg_get_constraintdef(oid) AS def
         FROM pg_constraint WHERE conrelid = to_regclass($1) AND contype = 'f'
          AND confrelid <> conrelid`,
      q(t),
    );
    for (const f of fks) {
      await this.db.run(
        `ALTER TABLE ${q(n.part)} ADD CONSTRAINT ${ident(f.name.slice(0, 55) + '__p')} ${f.def}`,
      );
    }
    // HASH mode: the self reference (a reply points at a message of the same
    // chat) goes on the new table NOW, empty and cheap. DEFERRABLE INITIALLY
    // DEFERRED so the copy (whole key groups) and the forward trigger (it also
    // copies the chain of replied-to rows) only need it true at commit. After
    // the swap it stays: no scan of the big table under the swap lock.
    let replyCol: string | null = null;
    if (spec.hash) {
      const selfFks = await this.db.rows<{
        name: string;
        def: string;
        cols: string;
      }>(
        `SELECT c.conname AS name, pg_get_constraintdef(c.oid) AS def,
                (SELECT string_agg(a.attname, ',') FROM pg_attribute a
                  WHERE a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
                    AND a.attname <> $2) AS cols
           FROM pg_constraint c
          WHERE c.conrelid = to_regclass($1) AND c.contype = 'f'
            AND c.confrelid = c.conrelid AND c.conparentid = 0`,
        q(t),
        spec.key,
      );
      for (const f of selfFks) {
        const def = f.def.replace(
          /REFERENCES [^(]+\(/,
          `REFERENCES ${q(n.part)}(`,
        );
        if (def === f.def) throw new Error(`cannot rewrite ${f.name}`);
        await this.db.run(
          `ALTER TABLE ${q(n.part)} ADD CONSTRAINT ${ident(f.name.slice(0, 55) + '__p')} ${def} DEFERRABLE INITIALLY DEFERRED`,
        );
        replyCol = f.cols || null;
      }
    }
    // Same privileges as the old table.
    const acl = await this.db.rows<{ grantee: string; priv: string }>(
      `SELECT CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END AS grantee,
              a.privilege_type AS priv
         FROM pg_class c, aclexplode(c.relacl) a
        WHERE c.oid = to_regclass($1) AND a.grantee <> c.relowner`,
      q(t),
    );
    for (const g of acl) {
      const who = g.grantee === 'PUBLIC' ? 'PUBLIC' : ident(g.grantee);
      await this.db.run(`GRANT ${g.priv} ON ${q(n.part)} TO ${who}`);
    }

    // Forward trigger: old -> new, from now on. SECURITY DEFINER because the
    // writing role may lack UPDATE/DELETE on append-only tables.
    const sets = plain
      .filter((c) => c !== 'id' && c !== spec.key)
      .map((c) => `${ident(c)} = EXCLUDED.${ident(c)}`)
      .join(', ');
    const vals = plain.map((c) => `NEW.${ident(c)}`).join(', ');
    const oList = plain.map((c) => `o.${ident(c)}`).join(', ');
    const ancestors = replyCol
      ? `IF NEW.${ident(replyCol)} IS NOT NULL THEN
          INSERT INTO ${q(n.part)} (${list})
            WITH RECURSIVE chain AS (
              SELECT ${oList} FROM ${q(t)} o
               WHERE o.id = NEW.${ident(replyCol)} AND o.${ident(spec.key)} = NEW.${ident(spec.key)}
              UNION
              SELECT ${oList} FROM ${q(t)} o JOIN chain c
                ON o.id = c.${ident(replyCol)} AND o.${ident(spec.key)} = c.${ident(spec.key)})
            SELECT ${plain.map((c) => ident(c)).join(', ')} FROM chain
            ON CONFLICT (id, ${ident(spec.key)}) DO NOTHING;
        END IF;`
      : '';
    await this.db
      .run(`CREATE OR REPLACE FUNCTION public.${ident(n.fwdFn)}() RETURNS trigger
      LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $f$
      BEGIN
        IF TG_OP = 'DELETE' THEN
          DELETE FROM ${q(n.part)} WHERE id = OLD.id AND ${ident(spec.key)} = OLD.${ident(spec.key)};
          RETURN OLD;
        END IF;
        IF TG_OP = 'UPDATE' AND OLD.${ident(spec.key)} <> NEW.${ident(spec.key)} THEN
          DELETE FROM ${q(n.part)} WHERE id = OLD.id AND ${ident(spec.key)} = OLD.${ident(spec.key)};
        END IF;
        ${ancestors}
        INSERT INTO ${q(n.part)} (${list}) VALUES (${vals})
          ON CONFLICT (id, ${ident(spec.key)}) DO ${sets ? `UPDATE SET ${sets}` : 'NOTHING'};
        RETURN NEW;
      END $f$`);
    await this.db.run(`DROP TRIGGER IF EXISTS ${ident(n.fwdTrg)} ON ${q(t)}`);
    await this.db.run(
      `CREATE TRIGGER ${ident(n.fwdTrg)} AFTER INSERT OR UPDATE OR DELETE ON ${q(t)} ` +
        `FOR EACH ROW EXECUTE FUNCTION public.${ident(n.fwdFn)}()`,
    );
    const total = await this.db.rows<{ n: number }>(
      `SELECT count(*)::bigint AS n FROM ${q(t)}`,
    );
    await this.db.run(
      `UPDATE public._partition_job SET phase = 'backfill', rows_total = $2,
              rows_copied = 0, cursor_at = NULL, cursor_id = NULL, updated_at = now() WHERE tbl = $1`,
      t,
      total[0]?.n ?? 0,
    );
  }

  private async backfillBatch(
    spec: PartitionSpec,
    j: JobRow,
    size: number,
  ): Promise<void> {
    const t = spec.table;
    const n = names(t);
    const cols = (await this.columns(t))
      .filter((c) => !c.generated)
      .map((c) => ident(c.name));
    const list = cols.join(', ');
    const k = ident(spec.key);
    const idType = await this.db.rows<{ typ: string }>(
      `SELECT format_type(atttypid, atttypmod) AS typ FROM pg_attribute
        WHERE attrelid = to_regclass($1) AND attname = 'id'`,
      q(t),
    );
    const typ = idType[0].typ;
    if (spec.hash) {
      // HASH mode: copy WHOLE key groups (all rows of 100 chats / people) in
      // one statement. A reply and the message it answers share the key, so
      // the deferred self reference of the new table is satisfied at commit.
      // The cursor is the last key copied.
      const hw = j.cursor_id === null ? 'TRUE' : `${k} > $1::uuid`;
      const hp = j.cursor_id === null ? [] : [j.cursor_id];
      const h = await this.db.rows<{ cnt: number; last_key: string | null }>(
        `WITH ks AS (
           SELECT DISTINCT ${k} FROM ${q(t)} WHERE ${hw} ORDER BY ${k} LIMIT 100
         ), batch AS (
           SELECT ${list} FROM ${q(t)} WHERE ${k} IN (SELECT ${k} FROM ks)
         ), ins AS (
           INSERT INTO ${q(n.part)} (${list}) SELECT ${list} FROM batch
           ON CONFLICT (id, ${k}) DO NOTHING RETURNING 1
         )
         SELECT (SELECT count(*) FROM batch)::bigint AS cnt,
                (SELECT ${k}::text FROM ks ORDER BY ${k} DESC LIMIT 1) AS last_key,
                (SELECT count(*) FROM ins) AS inserted`,
        ...hp,
      );
      const y = h[0];
      if (!y || y.cnt === 0 || !y.last_key) {
        await this.setPhase(t, 'verify');
        return;
      }
      await this.db.run(
        `UPDATE public._partition_job SET cursor_id = $2,
                rows_copied = rows_copied + $3, updated_at = now() WHERE tbl = $1`,
        t,
        y.last_key,
        y.cnt,
      );
      return;
    }
    const where =
      j.cursor_at === null
        ? 'TRUE'
        : `(${k}, id) > ($1::timestamptz, $2::${typ})`;
    const params = j.cursor_at === null ? [] : [j.cursor_at, j.cursor_id];
    const r = await this.db.rows<{
      cnt: number;
      last_at: string | null;
      last_id: string | null;
    }>(
      `WITH batch AS (
         SELECT ${list} FROM ${q(t)} WHERE ${where} ORDER BY ${k}, id LIMIT ${Math.floor(size)}
       ), ins AS (
         INSERT INTO ${q(n.part)} (${list}) SELECT ${list} FROM batch
         ON CONFLICT (id, ${k}) DO NOTHING RETURNING 1
       )
       SELECT (SELECT count(*) FROM batch)::bigint AS cnt,
              (SELECT ${k}::text FROM batch ORDER BY ${k} DESC, id DESC LIMIT 1) AS last_at,
              (SELECT id::text FROM batch ORDER BY ${k} DESC, id DESC LIMIT 1) AS last_id,
              (SELECT count(*) FROM ins) AS inserted`,
      ...params,
    );
    const x = r[0];
    if (!x || x.cnt === 0) {
      await this.setPhase(t, 'verify');
      return;
    }
    await this.db.run(
      `UPDATE public._partition_job SET cursor_at = $2::timestamptz, cursor_id = $3,
              rows_copied = rows_copied + $4, updated_at = now() WHERE tbl = $1`,
      t,
      x.last_at,
      x.last_id,
      x.cnt,
    );
  }

  /** Per-month counts must match; repair differences, then go on to swap. */
  private async verify(spec: PartitionSpec): Promise<void> {
    const t = spec.table;
    const n = names(t);
    const k = ident(spec.key);
    if (spec.hash) {
      // One statement = one snapshot: the two counts are comparable.
      const c = await this.db.rows<{ a: number; b: number }>(
        `SELECT (SELECT count(*) FROM ${q(t)})::bigint AS a, (SELECT count(*) FROM ${q(n.part)})::bigint AS b`,
      );
      if (c[0].a === c[0].b) {
        await this.setPhase(t, 'swap');
        return;
      }
      const cols = (await this.columns(t))
        .filter((x) => !x.generated)
        .map((x) => ident(x.name))
        .join(', ');
      await this.db.run(
        `DELETE FROM ${q(n.part)} p WHERE NOT EXISTS (SELECT 1 FROM ${q(t)} o WHERE o.id = p.id AND o.${k} = p.${k})`,
      );
      await this.db.run(
        `INSERT INTO ${q(n.part)} (${cols}) SELECT ${cols} FROM ${q(t)} o
          WHERE NOT EXISTS (SELECT 1 FROM ${q(n.part)} p WHERE p.id = o.id AND p.${k} = o.${k})
          ON CONFLICT (id, ${k}) DO NOTHING`,
      );
      return; // count again on the next loop
    }
    const diff = await this.db.rows<{ m: string }>(
      `SELECT COALESCE(a.m, b.m)::text AS m FROM
         (SELECT date_trunc('month', ${k}) m, count(*) c FROM ${q(t)} GROUP BY 1) a
         FULL JOIN
         (SELECT date_trunc('month', ${k}) m, count(*) c FROM ${q(n.part)} GROUP BY 1) b
         ON a.m = b.m
        WHERE a.c IS DISTINCT FROM b.c`,
    );
    for (const d of diff) {
      await this.db.run(
        `DELETE FROM ${q(n.part)} p WHERE date_trunc('month', p.${k}) = $1::timestamptz
           AND NOT EXISTS (SELECT 1 FROM ${q(t)} o WHERE o.id = p.id)`,
        d.m,
      );
      const cols = (await this.columns(t))
        .filter((c) => !c.generated)
        .map((c) => ident(c.name))
        .join(', ');
      await this.db.run(
        `INSERT INTO ${q(n.part)} (${cols}) SELECT ${cols} FROM ${q(t)}
          WHERE date_trunc('month', ${k}) = $1::timestamptz ON CONFLICT (id, ${k}) DO NOTHING`,
        d.m,
      );
    }
    if (diff.length > 0) return; // check again on the next loop
    await this.setPhase(t, 'swap');
  }

  /** Renames every secondary index and the FK / PK constraints with `from` -> `to`. */
  private async renameObjs(
    tx: Sql,
    table: string,
    pick: (name: string) => boolean,
    rename: (name: string) => string,
  ): Promise<void> {
    const objs = await tx.rows<{ name: string; kind: string }>(
      `SELECT c.relname AS name, 'i' AS kind FROM pg_index x JOIN pg_class c ON c.oid = x.indexrelid
        WHERE x.indrelid = to_regclass($1) AND NOT x.indisprimary
       UNION ALL
       SELECT conname, 'c' FROM pg_constraint WHERE conrelid = to_regclass($1) AND contype IN ('f','p')`,
      q(table),
    );
    for (const o of objs.filter((x) => pick(x.name))) {
      const to = rename(o.name);
      if (o.kind === 'i')
        await tx.run(
          `ALTER INDEX public.${ident(o.name)} RENAME TO ${ident(to)}`,
        );
      else
        await tx.run(
          `ALTER TABLE ${q(table)} RENAME CONSTRAINT ${ident(o.name)} TO ${ident(to)}`,
        );
    }
  }

  /** Foreign keys of OTHER tables that point at `table` (HASH mode re-points them). */
  private inboundKids(tx: Sql, table: string) {
    return tx.rows<{ child: string; name: string; def: string }>(
      `SELECT cl.relname AS child, c.conname AS name, pg_get_constraintdef(c.oid) AS def
         FROM pg_constraint c JOIN pg_class cl ON cl.oid = c.conrelid
        WHERE c.contype = 'f' AND c.confrelid = to_regclass($1)
          AND c.conrelid <> c.confrelid AND c.conparentid = 0`,
      q(table),
    );
  }

  private async dropKids(
    tx: Sql,
    kids: { child: string; name: string }[],
  ): Promise<void> {
    for (const k of kids) {
      await tx.run(
        `ALTER TABLE ${q(k.child)} DROP CONSTRAINT ${ident(k.name)}`,
      );
    }
  }

  /** Re-adds them NOT VALID (instant); the caller validates after commit. */
  private async addKids(
    tx: Sql,
    kids: { child: string; name: string; def: string }[],
  ): Promise<void> {
    for (const k of kids) {
      await tx.run(
        `ALTER TABLE ${q(k.child)} ADD CONSTRAINT ${ident(k.name)} ${k.def} NOT VALID`,
      );
    }
  }

  /** Scans the children without blocking writes; a failure keeps NOT VALID (still enforced for new rows). */
  private async validateKids(
    kids: { child: string; name: string }[],
  ): Promise<void> {
    for (const k of kids) {
      try {
        await this.db.run(
          `ALTER TABLE ${q(k.child)} VALIDATE CONSTRAINT ${ident(k.name)}`,
        );
      } catch {
        // stays NOT VALID; the next conversion or a manual VALIDATE fixes it
      }
    }
  }

  private async swap(spec: PartitionSpec): Promise<void> {
    const t = spec.table;
    const n = names(t);
    const old = await this.columns(t);
    const neu = await this.columns(n.part);
    const a = old.map((c) => c.name).join(',');
    const b = neu.map((c) => c.name).join(',');
    if (a !== b)
      throw new Error(
        'колонки старой и новой таблицы разошлись (была миграция?)',
      );
    const plain = old.filter((c) => !c.generated).map((c) => c.name);
    const oldPk = spec.hash ? await this.pkCols(t) : ['id'];
    const sets = plain
      .filter((c) => !oldPk.includes(c))
      .map((c) => `${ident(c)} = EXCLUDED.${ident(c)}`)
      .join(', ');
    let kidsAfter: { child: string; name: string; def: string }[] = [];
    try {
      await this.db.tx(async (tx) => {
        await tx.run(`SET LOCAL lock_timeout = '3s'`);
        await tx.run(`LOCK TABLE ${q(t)} IN ACCESS EXCLUSIVE MODE`);
        await tx.run(`DROP TRIGGER IF EXISTS ${ident(n.fwdTrg)} ON ${q(t)}`);
        let trgs: { def: string }[] = [];
        let kids: { child: string; name: string; def: string }[] = [];
        if (spec.hash) {
          trgs = await tx.rows<{ def: string }>(
            `SELECT pg_get_triggerdef(oid) AS def FROM pg_trigger
              WHERE tgrelid = to_regclass($1) AND NOT tgisinternal`,
            q(t),
          );
          kids = await this.inboundKids(tx, t);
          await this.dropKids(tx, kids);
        }
        await tx.run(`ALTER TABLE ${q(t)} RENAME TO ${ident(n.old)}`);
        await this.renameObjs(
          tx,
          n.old,
          () => true,
          (x) => `${x.slice(0, 55)}__o`,
        );
        await tx.run(`ALTER TABLE ${q(n.part)} RENAME TO ${ident(t)}`);
        await this.renameObjs(
          tx,
          t,
          (x) => x === `${n.part}_pk` || x.endsWith('__p'),
          (x) => (x === `${n.part}_pk` ? `${t}_pkey` : x.replace(/__p$/, '')),
        );
        if (spec.hash) {
          // The old table's triggers stay on it; the new one gets copies, and
          // the other tables' foreign keys point at the new table.
          for (const g of trgs) await tx.run(g.def);
          await this.addKids(tx, kids);
          kidsAfter = kids;
        }
        // Reverse sync: new -> old (old keeps its own PK).
        const list = plain.map(ident).join(', ');
        const vals = plain.map((c) => `NEW.${ident(c)}`).join(', ');
        await tx.run(`CREATE OR REPLACE FUNCTION public.${ident(n.revFn)}() RETURNS trigger
          LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $f$
          BEGIN
            IF TG_OP = 'DELETE' THEN
              DELETE FROM ${q(n.old)} WHERE ${oldPk.map((c) => `${ident(c)} = OLD.${ident(c)}`).join(' AND ')};
              RETURN OLD;
            END IF;
            INSERT INTO ${q(n.old)} (${list}) VALUES (${vals})
              ON CONFLICT (${oldPk.map(ident).join(', ')}) DO UPDATE SET ${sets || `id = EXCLUDED.id`};
            RETURN NEW;
          END $f$`);
        await tx.run(
          `CREATE TRIGGER ${ident(n.revTrg)} AFTER INSERT OR UPDATE OR DELETE ON ${q(t)} ` +
            `FOR EACH ROW EXECUTE FUNCTION public.${ident(n.revFn)}()`,
        );
        await tx.run(
          `UPDATE public._partition_job SET phase = 'swapped', swapped_at = now(),
                  error = NULL, error_count = 0, updated_at = now() WHERE tbl = '${t}'`,
        );
      });
      await this.validateKids(kidsAfter);
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e);
      if (/lock timeout|lock_timeout|canceling statement/i.test(m)) {
        // Busy moment: stay in 'swap', the next tick tries again.
        return;
      }
      throw e;
    }
  }
}
