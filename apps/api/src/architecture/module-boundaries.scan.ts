import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';

/**
 * The import-graph scan and the baseline generator behind
 * `module-boundaries.spec.ts` and `npm run arch:baseline`
 * (scripts/arch-baseline.ts). Kept free of jest so both can use it, and so
 * the generator is tested against throw-away fixture folders.
 *
 * The baseline file is an APPROVED SET, not a log of whatever the code does:
 *  - `deep`: the known deep imports into another module's sub-folders. May
 *    only shrink; a new one is never written unless a human passes
 *    `--approve` (so the guard stays meaningful).
 *  - `fanOut`: per module, the number of other modules it imports (a ceiling).
 *    It follows the code DOWN automatically; growth needs `--approve`.
 * The file is always written in one canonical form (sorted by plain
 * code-unit order, 1-space JSON), so the same code gives the same bytes on
 * every machine, and a merge conflict is resolved by re-running the script.
 */
export interface BoundariesSnapshot {
  deep: string[];
  fanOut: Record<string, number>;
}

const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (name.endsWith('.ts') && !name.endsWith('.spec.ts')) out.push(full);
  }
  return out;
}

const IMPORT_RE = /(?:from|import)\s*\(?\s*['"](\.[^'"]+)['"]/g;

/** Scans `<srcRoot>/modules` (the nest `src` folder, or a fixture of it). */
export function scanBoundaries(srcRoot: string): BoundariesSnapshot {
  const modules = join(srcRoot, 'modules');
  const deep = new Set<string>();
  const edges = new Map<string, Set<string>>();
  for (const file of walk(modules)) {
    const own = relative(modules, file).split(sep)[0];
    const text = readFileSync(file, 'utf8');
    for (const m of text.matchAll(IMPORT_RE)) {
      const target = resolve(dirname(file), m[1]);
      if (!target.startsWith(modules + sep)) continue;
      const rel = relative(modules, target).split(sep);
      const other = rel[0];
      if (other === own) continue;
      if (!edges.has(own)) edges.set(own, new Set());
      edges.get(own)!.add(other);
      // `modules/b/x` (a root file) is public; `modules/b/sub/x` is not.
      const isDir = existsSync(target) && statSync(target).isDirectory();
      // Request decorators (`@CurrentUser`, `@AttorneyOnly`…) are the shared
      // vocabulary of controllers, not a module's insides.
      if (
        rel.includes('decorators') ||
        rel.at(-1)?.startsWith('assistant-context')
      ) {
        continue;
      }
      if (rel.length > 2 || (rel.length === 2 && isDir)) {
        deep.add(
          `${relative(srcRoot, file).split(sep).join('/')} -> ${rel.join('/')}`,
        );
      }
    }
  }
  const fanOut: Record<string, number> = {};
  for (const k of [...edges.keys()].sort(cmp)) fanOut[k] = edges.get(k)!.size;
  return { deep: [...deep].sort(cmp), fanOut };
}

export interface BaselinePlan {
  /** What the file should contain after the run (canonical). */
  baseline: BoundariesSnapshot;
  /** Deep imports in the code that the baseline does not approve. */
  newDeep: string[];
  /** Baseline entries whose import is gone (dropped automatically). */
  fixedDeep: string[];
  /** Modules whose fan-out is above the approved ceiling. */
  grown: { module: string; from: number; to: number }[];
  /** True when the code adds nothing unapproved. */
  clean: boolean;
}

/**
 * Pure planner. Without `approve`, the result keeps only approved entries
 * (and lowers numbers); anything new is reported in `newDeep`/`grown` and the
 * caller must refuse to write. With `approve`, the baseline becomes exactly
 * what the code does now.
 */
export function planBaseline(
  now: BoundariesSnapshot,
  base: BoundariesSnapshot,
  approve = false,
): BaselinePlan {
  const approved = new Set(base.deep);
  const current = new Set(now.deep);
  const newDeep = now.deep.filter((d) => !approved.has(d));
  const fixedDeep = base.deep.filter((d) => !current.has(d));
  const grown = Object.keys(now.fanOut)
    .sort(cmp)
    .filter((m) => now.fanOut[m] > (base.fanOut[m] ?? 0))
    .map((m) => ({ module: m, from: base.fanOut[m] ?? 0, to: now.fanOut[m] }));
  const deep = approve ? now.deep : now.deep.filter((d) => approved.has(d));
  const fanOut: Record<string, number> = {};
  for (const m of Object.keys(now.fanOut).sort(cmp)) {
    const n = now.fanOut[m];
    const ceiling = base.fanOut[m] ?? 0;
    // Never raise a ceiling without approval; always follow the code down.
    fanOut[m] = approve || n <= ceiling ? n : ceiling;
  }
  return {
    baseline: { deep: [...deep].sort(cmp), fanOut },
    newDeep,
    fixedDeep,
    grown,
    clean: newDeep.length === 0 && grown.length === 0,
  };
}

/** The one canonical byte form of the baseline file. */
export function formatBaseline(s: BoundariesSnapshot): string {
  return JSON.stringify({ deep: s.deep, fanOut: s.fanOut }, null, 1) + '\n';
}

/** Human-readable diff the script prints (also shown by the failing test). */
export function describePlan(plan: BaselinePlan): string {
  const lines: string[] = [];
  for (const d of plan.newDeep) lines.push(`+ new deep import: ${d}`);
  for (const g of plan.grown)
    lines.push(`+ fan-out grew: ${g.module} ${g.from} -> ${g.to}`);
  for (const d of plan.fixedDeep) lines.push(`- fixed (dropped): ${d}`);
  return lines.join('\n');
}
