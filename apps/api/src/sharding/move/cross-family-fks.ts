import { Prisma } from '@prisma/client';
import { familyOf } from '../shard-manifest';
import type { MoveDb } from './move-db';
import { q } from './move-sql';

/**
 * Shard-ready step 9: drops the foreign keys between DIFFERENT families
 * (global -> case, case -> user, content -> global ...) of ONE database.
 *
 * Why it is a tool and not a migration: it must happen on every physical
 * database before the first row lives away from the rows it points at, but
 * a migration that drops them would (a) make `prisma migrate diff` report
 * drift against schema.prisma forever, (b) not be undoable by the one-button
 * deploy rollback. As a tool it is explicit, idempotent, and reversible:
 * every dropped constraint's DDL is stored in `shard_dropped_fk` so
 * `restoreCrossFamilyForeignKeys` can put it back (as NOT VALID, so existing
 * orphans do not block the restore).
 *
 * Safe on one database: the application never relied on these constraints
 * for a result (it reads related rows with separate queries); what they
 * enforced - no orphans, ON DELETE CASCADE / SET NULL / RESTRICT across
 * families - is now the job of explicit deletes in code (see the step 8
 * notes) and of the nightly orphan checker (`orphan-checker.ts`).
 */
export interface FkRow {
  conname: string;
  tbl: string;
  ref: string;
  def: string;
}

export function familyByTable(): Map<string, string> {
  const out = new Map<string, string>();
  for (const m of Prisma.dmmf.datamodel.models) {
    const f = familyOf(m.name);
    if (f) out.set(m.dbName ?? m.name, f);
  }
  return out;
}

export async function listForeignKeys(db: MoveDb): Promise<FkRow[]> {
  return db.query<FkRow>(
    `SELECT c.conname, cl.relname AS tbl, rl.relname AS ref,
            pg_get_constraintdef(c.oid) AS def
       FROM pg_constraint c
       JOIN pg_class cl ON cl.oid = c.conrelid
       JOIN pg_class rl ON rl.oid = c.confrelid
       JOIN pg_namespace n ON n.oid = cl.relnamespace
      WHERE c.contype = 'f' AND n.nspname = 'public'`,
  );
}

export function crossFamilyOnly(fks: readonly FkRow[]): FkRow[] {
  const fam = familyByTable();
  return fks.filter((fk) => {
    const a = fam.get(fk.tbl);
    const b = fam.get(fk.ref);
    return !!a && !!b && a !== b;
  });
}

/** Cross-family constraints still present (0 = step 9 done here). */
export async function remainingCrossFamilyForeignKeys(
  db: MoveDb,
): Promise<number> {
  return crossFamilyOnly(await listForeignKeys(db)).length;
}

export async function dropCrossFamilyForeignKeys(
  db: MoveDb,
  opts: { dryRun?: boolean } = {},
): Promise<{ dropped: number; constraints: string[] }> {
  const todo = crossFamilyOnly(await listForeignKeys(db));
  const names = todo.map((f) => `${f.tbl}.${f.conname}`);
  if (opts.dryRun || todo.length === 0) {
    return { dropped: 0, constraints: names };
  }
  // One transaction: record the DDL, then drop; all or nothing.
  await db.tx(async (tx) => {
    for (const fk of todo) {
      await tx.query(
        `INSERT INTO shard_dropped_fk (constraint_name, table_name, definition)
         VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
        [fk.conname, fk.tbl, fk.def],
      );
      await tx.query(
        `ALTER TABLE ${q(fk.tbl)} DROP CONSTRAINT IF EXISTS ${q(fk.conname)}`,
      );
    }
  });
  return { dropped: todo.length, constraints: names };
}

/** Puts the recorded constraints back (NOT VALID); returns how many. */
export async function restoreCrossFamilyForeignKeys(
  db: MoveDb,
): Promise<number> {
  const rows = await db.query<{
    constraint_name: string;
    table_name: string;
    definition: string;
  }>(`SELECT constraint_name, table_name, definition FROM shard_dropped_fk`);
  let n = 0;
  await db.tx(async (tx) => {
    for (const r of rows) {
      await tx.query(
        `ALTER TABLE ${q(r.table_name)} DROP CONSTRAINT IF EXISTS ${q(r.constraint_name)}`,
      );
      await tx.query(
        `ALTER TABLE ${q(r.table_name)} ADD CONSTRAINT ${q(r.constraint_name)} ${r.definition} NOT VALID`,
      );
      await tx.query(
        `DELETE FROM shard_dropped_fk WHERE table_name = $1 AND constraint_name = $2`,
        [r.table_name, r.constraint_name],
      );
      n += 1;
    }
  });
  return n;
}
