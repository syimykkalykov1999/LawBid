import type { MoveTable } from './move-plan';

/**
 * Shard-ready step 10: the SQL of the move tool, one builder per statement.
 * Everything is generic over a `MoveTable` (table, primary key, `late`
 * columns), so the same text works for all 104 sharded tables.
 */
export const q = (ident: string): string => `"${ident.replace(/"/g, '""')}"`;
const lit = (s: string): string => `'${s.replace(/'/g, "''")}'`;

/**
 * One batch of a table's rows of a shard in primary-key order, after the row
 * `$2` (JSON, optional). Returns `n`, `rows` (JSON array text) and `last`
 * (the last row as JSON text, the next cursor). Rows stay TEXT end to end so
 * 64-bit integers never pass through a JavaScript number.
 */
export function selectBatchSql(t: MoveTable, hasCursor: boolean): string {
  const pk = t.pk.map(q).join(', ');
  const bpk = t.pk.map((c) => `b.${q(c)}`).join(', ');
  const after = hasCursor
    ? ` AND (${pk}) > (SELECT ${pk} FROM jsonb_populate_record(NULL::${q(t.table)}, $2::jsonb))`
    : '';
  return (
    `WITH b AS (SELECT * FROM ${q(t.table)} WHERE shard_id = $1${after} ` +
    `ORDER BY ${pk} LIMIT ${hasCursor ? '$3' : '$2'}::int) ` +
    `SELECT count(*)::int AS n, ` +
    `COALESCE(jsonb_agg(to_jsonb(b) ORDER BY ${bpk}), '[]'::jsonb)::text AS rows, ` +
    `(jsonb_agg(to_jsonb(b) ORDER BY ${bpk}) -> -1)::text AS last FROM b`
  );
}

/**
 * Insert-or-update of the rows in the JSON array `$1`. With `deferLate` the
 * `late` columns insert as NULL (the second pass fills them).
 */
export function upsertSql(
  t: MoveTable,
  columns: readonly string[],
  deferLate: boolean,
): string {
  const cols = columns.map(q).join(', ');
  const sel = columns
    .map((c) => (deferLate && t.late.includes(c) ? 'NULL' : q(c)))
    .join(', ');
  const nonPk = columns.filter((c) => !t.pk.includes(c));
  const action = nonPk.length
    ? `DO UPDATE SET ${nonPk.map((c) => `${q(c)} = EXCLUDED.${q(c)}`).join(', ')}`
    : 'DO NOTHING';
  return (
    `INSERT INTO ${q(t.table)} (${cols}) SELECT ${sel} ` +
    `FROM jsonb_populate_recordset(NULL::${q(t.table)}, $1::jsonb) ` +
    `ON CONFLICT (${t.pk.map(q).join(', ')}) ${action}`
  );
}

/** Second pass for `late` columns, from the same JSON rows ($1). */
export function lateUpdateSql(t: MoveTable): string {
  const set = t.late.map((c) => `${q(c)} = r.${q(c)}`).join(', ');
  const on = t.pk.map((c) => `x.${q(c)} = r.${q(c)}`).join(' AND ');
  return (
    `UPDATE ${q(t.table)} x SET ${set} FROM ` +
    `jsonb_populate_recordset(NULL::${q(t.table)}, $1::jsonb) r WHERE ${on}`
  );
}

/** Count + order-independent checksum of a shard's rows in one table. */
export function checksumSql(t: MoveTable): string {
  return (
    `SELECT count(*)::int AS n, ` +
    `COALESCE(sum(hashtextextended(x::text, 0)::numeric), 0)::text AS sum ` +
    `FROM ${q(t.table)} x WHERE x.shard_id = $1`
  );
}

/** Removes the rows whose primary keys are in the JSON array `$1`. */
export function removeByPkSql(t: MoveTable): string {
  const on = t.pk.map((c) => `x.${q(c)} = k.${q(c)}`).join(' AND ');
  return (
    `DELETE FROM ${q(t.table)} x USING ` +
    `jsonb_populate_recordset(NULL::${q(t.table)}, $1::jsonb) k WHERE ${on}`
  );
}

/** Current rows (JSON array text) for the keys in `$1` (change-log replay). */
export function selectByPkSql(t: MoveTable): string {
  const on = t.pk.map((c) => `x.${q(c)} = k.${q(c)}`).join(' AND ');
  return (
    `SELECT COALESCE(jsonb_agg(to_jsonb(x)), '[]'::jsonb)::text AS rows FROM ${q(t.table)} x ` +
    `JOIN jsonb_populate_recordset(NULL::${q(t.table)}, $1::jsonb) k ON ${on}`
  );
}

/** The keys in `$1` that no longer exist at the source. */
export function missingKeysSql(t: MoveTable): string {
  const on = t.pk.map((c) => `x.${q(c)} = k.${q(c)}`).join(' AND ');
  const obj = t.pk.map((c) => `${lit(c)}, k.${q(c)}`).join(', ');
  return (
    `SELECT COALESCE(jsonb_agg(jsonb_build_object(${obj})), '[]'::jsonb)::text AS keys ` +
    `FROM jsonb_populate_recordset(NULL::${q(t.table)}, $1::jsonb) k ` +
    `WHERE NOT EXISTS (SELECT 1 FROM ${q(t.table)} x WHERE ${on})`
  );
}

/** Cleanup: one batch of a shard's rows. */
export function removeBatchSql(t: MoveTable): string {
  return (
    `DELETE FROM ${q(t.table)} WHERE ctid IN (SELECT ctid FROM ${q(t.table)} ` +
    `WHERE shard_id = $1 LIMIT $2::int)`
  );
}

export function triggerName(table: string): string {
  return `${table}_shard_move`;
}

export function createGuardTriggerSql(t: MoveTable): string[] {
  const args = t.pk.map(lit).join(', ');
  return [
    dropGuardTriggerSql(t),
    `CREATE TRIGGER ${q(triggerName(t.table))} BEFORE INSERT OR UPDATE OR DELETE ON ${q(t.table)} ` +
      `FOR EACH ROW EXECUTE FUNCTION lawbid_shard_move_guard(${args})`,
  ];
}

export function dropGuardTriggerSql(t: MoveTable): string {
  return `DROP TRIGGER IF EXISTS ${q(triggerName(t.table))} ON ${q(t.table)}`;
}
