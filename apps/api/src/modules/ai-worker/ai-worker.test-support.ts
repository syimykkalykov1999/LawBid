/* eslint-disable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-argument */
import { randomUUID } from 'node:crypto';

/**
 * A tiny in-memory stand-in for the three ai_* tables (only the Prisma
 * calls AiWorkerService makes), so the service runs end to end in a unit
 * test with a fake Claude API.
 */
type Row = Record<string, any>;

function matches(row: Row, where: Row | undefined, db: MemAiDb): boolean {
  if (!where) return true;
  for (const [k, cond] of Object.entries(where)) {
    if (k === 'OR') {
      if (!(cond as Row[]).some((w) => matches(row, w, db))) return false;
      continue;
    }
    if (k === 'run') {
      const run = db.aiRunRows.find((r) => r.id === row.run_id);
      if (!run || !matches(run, cond, db)) return false;
      continue;
    }
    if (k === 'role') {
      const role = db.aiRoleRows.find((r) => r.id === row.role_id);
      if (!role || !matches(role, cond, db)) return false;
      continue;
    }
    const v = row[k];
    if (cond !== null && typeof cond === 'object' && !(cond instanceof Date)) {
      if ('in' in cond && !cond.in.includes(v)) return false;
      if ('notIn' in cond && cond.notIn.includes(v)) return false;
      if (
        'not' in cond &&
        (cond.not === null ? v === null || v === undefined : v === cond.not)
      )
        return false;
      if ('lte' in cond && !(v !== null && v <= cond.lte)) return false;
      continue;
    }
    if ((v ?? null) !== cond) return false;
  }
  return true;
}

function applyData(row: Row, data: Row): void {
  for (const [k, v] of Object.entries(data)) {
    if (v !== null && typeof v === 'object' && 'increment' in v)
      row[k] = (row[k] ?? 0) + v.increment;
    else row[k] = v;
  }
  row.updated_at = new Date();
}

function table(
  rows: Row[],
  db: MemAiDb,
  defaults: () => Row,
  withInclude?: (r: Row) => Row,
) {
  const out = (r: Row, include?: Row) =>
    include && withInclude ? { ...r, ...withInclude(r) } : { ...r };
  const sorted = (list: Row[], orderBy?: Row) => {
    if (!orderBy) return list;
    const [[k, dir]] = Object.entries(orderBy);
    return [...list].sort(
      (a, b) =>
        (a[k] < b[k] ? -1 : a[k] > b[k] ? 1 : 0) * (dir === 'desc' ? -1 : 1),
    );
  };
  return {
    create: ({ data }: { data: Row }) => {
      const r = {
        id: randomUUID(),
        created_at: new Date(),
        updated_at: new Date(),
        ...defaults(),
        ...data,
      };
      rows.push(r);
      return Promise.resolve({ ...r });
    },
    createMany: ({ data }: { data: Row[] }) => {
      for (const d of data)
        rows.push({
          id: randomUUID(),
          created_at: new Date(),
          updated_at: new Date(),
          ...defaults(),
          ...d,
        });
      return Promise.resolve({ count: data.length });
    },
    findMany: ({
      where,
      orderBy,
      take,
      cursor,
      skip,
      include,
      select,
    }: Row = {}) => {
      let list = sorted(
        rows.filter((r) => matches(r, where, db)),
        orderBy,
      );
      if (cursor)
        list = list.slice(
          list.findIndex((r) => r.id === cursor.id) + (skip ?? 0),
        );
      if (take) list = list.slice(0, take);
      return Promise.resolve(list.map((r) => out(r, include ?? select)));
    },
    findUnique: ({ where }: Row) =>
      Promise.resolve(rows.find((r) => matches(r, where, db)) ?? null),
    findFirst: ({ where }: Row) =>
      Promise.resolve(rows.find((r) => matches(r, where, db)) ?? null),
    update: ({ where, data }: Row) => {
      const r = rows.find((x) => matches(x, where, db));
      if (!r) throw new Error('not found');
      applyData(r, data);
      return Promise.resolve({ ...r });
    },
    updateMany: ({ where, data }: Row) => {
      const list = rows.filter((x) => matches(x, where, db));
      for (const r of list) applyData(r, data);
      return Promise.resolve({ count: list.length });
    },
    count: ({ where }: Row = {}) =>
      Promise.resolve(rows.filter((r) => matches(r, where, db)).length),
    groupBy: ({ by, where }: Row) => {
      const key = by[0];
      const groups = new Map<unknown, number>();
      for (const r of rows.filter((x) => matches(x, where, db)))
        groups.set(r[key] ?? null, (groups.get(r[key] ?? null) ?? 0) + 1);
      return Promise.resolve(
        [...groups].map(([k, n]) => ({ [key]: k, _count: { _all: n } })),
      );
    },
  };
}

export class MemAiDb {
  aiRoleRows: any[] = [];
  aiRunRows: any[] = [];
  aiRunItemRows: any[] = [];
  aiRole = table(this.aiRoleRows, this, () => ({
    archived_at: null,
    enabled: true,
    auto_send: false,
    model: 'claude-opus-5-5',
    output: 'verdict',
    confidence_min: 90,
    audit_pct: 10,
  }));
  aiRun = table(
    this.aiRunRows,
    this,
    () => ({
      status: 'queued',
      proposed: 0,
      failed: 0,
      batch_id: null,
      reserved_millicents: 0,
      cost_millicents: 0,
      attempts: 0,
      next_attempt_at: null,
      error: null,
      finished_at: null,
    }),
    (r) => ({ role: this.aiRoleRows.find((x) => x.id === r.role_id) }),
  );
  aiRunItem = table(
    this.aiRunItemRows,
    this,
    () => ({
      status: 'pending',
      proposal: null,
      decision: null,
      confidence: null,
      lane: null,
      flags: [],
      error: null,
      cost_millicents: 0,
      owner_decision: null,
      owner_note: null,
      reviewed_by: null,
      reviewed_at: null,
      delivered_at: null,
    }),
    (r) => {
      const run = this.aiRunRows.find((x) => x.id === r.run_id);
      return {
        run: { role: this.aiRoleRows.find((x) => x.id === run?.role_id) },
      };
    },
  );
  $transaction = (arg: any) =>
    typeof arg === 'function' ? arg(this) : Promise.all(arg);
}
