import { Prisma } from '@prisma/client';
import { SHARDED_MODELS, familyOf } from '../shard-manifest';

/**
 * Shard-ready step 10: what the move tool copies and in which order, derived
 * from the family manifest + the Prisma DMMF (no hand-kept table list).
 *
 *  - `order`: sharded tables parents first (same-family foreign keys). A
 *    cycle (Case <-> Bid ...) or a self reference (comment replies) is broken
 *    on NULLABLE foreign keys only: such a column is `late` - the first pass
 *    inserts the row with it NULL and a second pass fills it, so no step
 *    needs superuser rights (`session_replication_role`) on RDS.
 *  - `pk`: primary-key columns (33 tables have a composite key).
 */
export interface MoveTable {
  readonly model: string;
  readonly table: string;
  readonly pk: readonly string[];
  /** Nullable FK columns filled in the second pass (cycle / self breaking). */
  readonly late: readonly string[];
  /** Direct parents among the sharded tables (same family). */
  readonly parents: readonly string[];
}

export interface CrossFamilyEdge {
  readonly childModel: string;
  readonly childTable: string;
  readonly column: string;
  readonly parentModel: string;
  readonly parentTable: string;
  readonly parentColumn: string;
  readonly required: boolean;
}

interface Dmmf {
  models: readonly Prisma.DMMF.Model[];
}

function dmmfModels(dmmf: Dmmf = Prisma.dmmf.datamodel): Dmmf {
  return dmmf;
}

const dbName = (m: { dbName?: string | null; name: string }) =>
  m.dbName ?? m.name;

/** Parents first; see the type comment. Deterministic. */
export function buildMoveTables(
  dmmf: Dmmf = dmmfModels(),
  sharded: Readonly<Record<string, unknown>> = SHARDED_MODELS,
): MoveTable[] {
  const byName = new Map(dmmf.models.map((m) => [m.name, m]));
  const names = Object.keys(sharded).sort();
  interface Edge {
    child: string;
    parent: string;
    column: string;
    required: boolean;
    self: boolean;
  }
  const edges: Edge[] = [];
  for (const name of names) {
    const m = byName.get(name)!;
    for (const f of m.fields) {
      if (f.kind !== 'object' || (f.relationFromFields?.length ?? 0) === 0)
        continue;
      if (!(f.type in sharded)) continue;
      for (const from of f.relationFromFields ?? []) {
        const col = m.fields.find((x) => x.name === from)!;
        edges.push({
          child: name,
          parent: f.type,
          column: col.dbName ?? col.name,
          required: col.isRequired,
          self: f.type === name,
        });
      }
    }
  }
  const late = new Map<string, Set<string>>();
  const markLate = (e: Edge) => {
    if (!late.has(e.child)) late.set(e.child, new Set());
    late.get(e.child)!.add(e.column);
  };
  // Self references are always late (they need the row itself first).
  for (const e of edges) if (e.self && !e.required) markLate(e);
  let active = edges.filter((e) => !e.self);
  const placed = new Set<string>();
  const order: string[] = [];
  let left = [...names];
  while (left.length) {
    const ready = left.filter((n) =>
      active.filter((e) => e.child === n).every((e) => placed.has(e.parent)),
    );
    if (ready.length) {
      for (const n of ready) {
        placed.add(n);
        order.push(n);
      }
      left = left.filter((n) => !placed.has(n));
      continue;
    }
    // Stuck on a cycle: defer one nullable edge among the unplaced tables.
    const cut = active.find(
      (e) => !e.required && left.includes(e.child) && !placed.has(e.parent),
    );
    if (!cut) {
      throw new Error(
        `shard move: unbreakable required-FK cycle among ${left.slice(0, 6).join(', ')}`,
      );
    }
    markLate(cut);
    active = active.filter((e) => e !== cut);
  }
  const parentsOf = (n: string) => [
    ...new Set(
      edges.filter((e) => e.child === n && !e.self).map((e) => e.parent),
    ),
  ];
  return order.map((model) => {
    const m = byName.get(model)!;
    const pkNames =
      m.primaryKey?.fields ?? m.fields.filter((f) => f.isId).map((f) => f.name);
    const colOf = (n: string) => {
      const f = m.fields.find((x) => x.name === n)!;
      return f.dbName ?? f.name;
    };
    return {
      model,
      table: dbName(m),
      pk: pkNames.map(colOf),
      late: [...(late.get(model) ?? [])].sort(),
      parents: parentsOf(model),
    };
  });
}

/** Foreign keys between two sharded tables (same row-colocation needed). */
export function shardedEdges(dmmf: Dmmf = dmmfModels()): CrossFamilyEdge[] {
  const byName = new Map(dmmf.models.map((m) => [m.name, m]));
  const out: CrossFamilyEdge[] = [];
  for (const name of Object.keys(SHARDED_MODELS)) {
    const m = byName.get(name)!;
    for (const f of m.fields) {
      if (f.kind !== 'object' || (f.relationFromFields?.length ?? 0) === 0)
        continue;
      if (!(f.type in SHARDED_MODELS) || f.type === name) continue;
      const pm = byName.get(f.type)!;
      (f.relationFromFields ?? []).forEach((from, i) => {
        const col = m.fields.find((x) => x.name === from)!;
        const to = pm.fields.find((x) => x.name === f.relationToFields?.[i])!;
        out.push({
          childModel: m.name,
          childTable: dbName(m),
          column: col.dbName ?? col.name,
          parentModel: pm.name,
          parentTable: dbName(pm),
          parentColumn: to.dbName ?? to.name,
          required: col.isRequired,
        });
      });
    }
  }
  return out;
}

/** Every foreign key whose two models belong to different families. */
export function crossFamilyEdges(dmmf: Dmmf = dmmfModels()): CrossFamilyEdge[] {
  const byName = new Map(dmmf.models.map((m) => [m.name, m]));
  const out: CrossFamilyEdge[] = [];
  for (const m of dmmf.models) {
    const fam = familyOf(m.name);
    for (const f of m.fields) {
      if (f.kind !== 'object' || (f.relationFromFields?.length ?? 0) === 0)
        continue;
      const pm = byName.get(f.type);
      if (!pm || familyOf(f.type) === fam || !fam || !familyOf(f.type))
        continue;
      (f.relationFromFields ?? []).forEach((from, i) => {
        const col = m.fields.find((x) => x.name === from)!;
        const to = pm.fields.find((x) => x.name === f.relationToFields?.[i])!;
        out.push({
          childModel: m.name,
          childTable: dbName(m),
          column: col.dbName ?? col.name,
          parentModel: pm.name,
          parentTable: dbName(pm),
          parentColumn: to.dbName ?? to.name,
          required: col.isRequired,
        });
      });
    }
  }
  return out.sort((a, b) =>
    `${a.childTable}.${a.column}`.localeCompare(`${b.childTable}.${b.column}`),
  );
}
