import {
  existsSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';

/**
 * Owner 2026-10-14 (architecture audit, step 1): modules do not reach into
 * each other's insides. Rule: from module A, an import of module B may only
 * name a file at the root of B's folder (its public face: `b.module.ts`,
 * `b.service.ts`, `b.types.ts` …), never B's sub-folders.
 *
 * The code grew before the rule, so today's violations are recorded in
 * `module-boundaries.baseline.json` and may only SHRINK: a new one fails
 * this test, and so does a recorded one that was fixed (delete it from the
 * baseline: `UPDATE_BOUNDARIES=1 npx jest src/architecture`).
 *
 * Second rule: a module's fan-out (how many other modules it imports) may
 * not grow past the recorded number — the "cases depends on 25 modules"
 * problem cannot get worse unnoticed.
 */
const SRC = resolve(__dirname, '..');
const MODULES = join(SRC, 'modules');
const BASELINE = join(__dirname, 'module-boundaries.baseline.json');

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (name.endsWith('.ts') && !name.endsWith('.spec.ts')) out.push(full);
  }
  return out;
}

const IMPORT_RE = /(?:from|import)\s*\(?\s*['"](\.[^'"]+)['"]/g;

function scan(): { deep: string[]; fanOut: Record<string, number> } {
  const deep = new Set<string>();
  const edges = new Map<string, Set<string>>();
  for (const file of walk(MODULES)) {
    const own = relative(MODULES, file).split(sep)[0];
    const text = readFileSync(file, 'utf8');
    for (const m of text.matchAll(IMPORT_RE)) {
      const target = resolve(dirname(file), m[1]);
      if (!target.startsWith(MODULES + sep)) continue;
      const rel = relative(MODULES, target).split(sep);
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
          `${relative(SRC, file).split(sep).join('/')} -> ${rel.join('/')}`,
        );
      }
    }
  }
  const fanOut: Record<string, number> = {};
  for (const [k, v] of [...edges].sort()) fanOut[k] = v.size;
  return { deep: [...deep].sort(), fanOut };
}

describe('module boundaries (architecture rules)', () => {
  const now = scan();
  if (process.env.UPDATE_BOUNDARIES === '1') {
    writeFileSync(
      BASELINE,
      JSON.stringify({ deep: now.deep, fanOut: now.fanOut }, null, 1) + '\n',
    );
  }
  const base = JSON.parse(readFileSync(BASELINE, 'utf8')) as {
    deep: string[];
    fanOut: Record<string, number>;
  };

  it('no new import into another module’s sub-folders', () => {
    const known = new Set(base.deep);
    expect(now.deep.filter((d) => !known.has(d))).toEqual([]);
  });

  it('a fixed violation is removed from the baseline (it only shrinks)', () => {
    const current = new Set(now.deep);
    expect(base.deep.filter((d) => !current.has(d))).toEqual([]);
  });

  it('no module depends on more modules than recorded', () => {
    const grew = Object.entries(now.fanOut).filter(
      ([m, n]) => n > (base.fanOut[m] ?? 0),
    );
    expect(grew).toEqual([]);
  });
});
