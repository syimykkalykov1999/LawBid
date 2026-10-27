import { execFileSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import {
  formatBaseline,
  planBaseline,
  scanBoundaries,
} from './module-boundaries.scan';

/** Builds a throw-away `src/modules/...` tree from { 'a/a.service.ts': text }. */
function fixture(files: Record<string, string>): string {
  const src = mkdtempSync(join(tmpdir(), 'arch-baseline-'));
  for (const [rel, text] of Object.entries(files)) {
    const full = join(src, 'modules', rel);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, text);
  }
  mkdirSync(join(src, 'architecture'), { recursive: true });
  return src;
}

const BASE_FILES = {
  'a/a.service.ts': `import { B } from '../b/b.service';\nimport { C } from '../c/c.service';\n`,
  'b/b.service.ts': `export class B {}\n`,
  'c/c.service.ts': `export class C {}\n`,
  'c/inner/secret.ts': `export const s = 1;\n`,
};

describe('module boundaries scan + baseline generator (fixture repo)', () => {
  const dirs: string[] = [];
  const make = (files: Record<string, string>) => {
    const d = fixture(files);
    dirs.push(d);
    return d;
  };
  afterAll(() => dirs.forEach((d) => rmSync(d, { recursive: true })));

  it('counts fan-out, treats root files as public and sub-folders as deep', () => {
    const src = make({
      ...BASE_FILES,
      'a/a.controller.ts': `import { s } from '../c/inner/secret';\nimport { D } from '../d/decorators/current';\n`,
      'd/decorators/current.ts': `export const D = 1;\n`,
    });
    const snap = scanBoundaries(src);
    expect(snap.deep).toEqual(['modules/a/a.controller.ts -> c/inner/secret']);
    // decorators are exempt from "deep" but still count as a dependency.
    expect(snap.fanOut).toEqual({ a: 3 });
  });

  it('a NEW deep import is not approved: reported, not written', () => {
    const src = make({
      ...BASE_FILES,
      'a/x.ts': `import { s } from '../c/inner/secret';\n`,
    });
    const plan = planBaseline(scanBoundaries(src), {
      deep: [],
      fanOut: { a: 2 },
    });
    expect(plan.clean).toBe(false);
    expect(plan.newDeep).toEqual(['modules/a/x.ts -> c/inner/secret']);
    expect(plan.baseline.deep).toEqual([]);
  });

  it('--approve writes exactly what the code does; fan-out growth needs it too', () => {
    const src = make({
      ...BASE_FILES,
      'a/x.ts': `import { s } from '../c/inner/secret';\nimport {} from '../e/e';\n`,
      'e/e.ts': `export {};\n`,
    });
    const now = scanBoundaries(src);
    const held = planBaseline(now, { deep: [], fanOut: { a: 2 } });
    expect(held.grown).toEqual([{ module: 'a', from: 2, to: 3 }]);
    expect(held.baseline.fanOut).toEqual({ a: 2 });
    const ok = planBaseline(now, { deep: [], fanOut: { a: 2 } }, true);
    expect(ok.baseline.deep).toEqual(now.deep);
    expect(ok.baseline.fanOut).toEqual({ a: 3 });
  });

  it('a fixed violation and a lowered fan-out are followed automatically', () => {
    const src = make(BASE_FILES);
    const plan = planBaseline(scanBoundaries(src), {
      deep: ['modules/a/old.ts -> c/inner/secret'],
      fanOut: { a: 9, gone: 4 },
    });
    expect(plan.clean).toBe(true);
    expect(plan.fixedDeep).toEqual(['modules/a/old.ts -> c/inner/secret']);
    expect(plan.baseline).toEqual({ deep: [], fanOut: { a: 2 } });
  });

  it('the file bytes do not depend on the order things were found', () => {
    const one = formatBaseline({ deep: ['a', 'b'], fanOut: { x: 1, y: 2 } });
    const two = formatBaseline(
      planBaseline(
        { deep: ['b', 'a'], fanOut: { y: 2, x: 1 } },
        { deep: ['b', 'a'], fanOut: { y: 2, x: 1 } },
      ).baseline,
    );
    expect(two).toBe(one);
  });

  describe('npm run arch:baseline (the CLI)', () => {
    const script = resolve(__dirname, '../../scripts/arch-baseline.ts');
    const run = (src: string, ...flags: string[]) => {
      try {
        const out = execFileSync(
          process.execPath,
          [
            '-r',
            'ts-node/register/transpile-only',
            script,
            '--src',
            src,
            ...flags,
          ],
          { encoding: 'utf8', stdio: 'pipe' },
        );
        return { code: 0, out };
      } catch (e) {
        const err = e as { status: number; stderr: string };
        return { code: err.status, out: err.stderr };
      }
    };

    it('generates the file, is idempotent, fails on a new deep import, approves on request', () => {
      const src = make(BASE_FILES);
      const file = join(src, 'architecture', 'module-boundaries.baseline.json');
      expect(run(src, '--approve').code).toBe(0);
      const first = readFileSync(file, 'utf8');
      expect(JSON.parse(first)).toEqual({
        deep: [],
        fanOut: { a: 2 },
      });
      expect(run(src, '--check').code).toBe(0);

      writeFileSync(
        join(src, 'modules', 'b', 'leak.ts'),
        `import { s } from '../c/inner/secret';\n`,
      );
      const bad = run(src);
      expect(bad.code).toBe(1);
      expect(bad.out).toContain(
        '+ new deep import: modules/b/leak.ts -> c/inner/secret',
      );
      expect(readFileSync(file, 'utf8')).toBe(first); // nothing written

      expect(run(src, '--approve').code).toBe(0);
      expect(JSON.parse(readFileSync(file, 'utf8')).deep).toEqual([
        'modules/b/leak.ts -> c/inner/secret',
      ]);
      expect(run(src).code).toBe(0);
    }, 60_000);
  });
});
