// node --test scripts/sort-lists.test.mjs  (CI: api-ci "registry self-tests")
// Fixture repo dirs: every registry is built unsorted, sorted by the script,
// and checked for stability, for check mode and for untouched content.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { canonMarkdownRows, cmp, sortLists } from './sort-lists.mjs';

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), 'sort-lists.mjs');
const dirs = [];
after(() => dirs.forEach((d) => rmSync(d, { recursive: true, force: true })));

function put(root, rel, text) {
  const full = join(root, rel);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, text);
}
const json = (v) => JSON.stringify(v, null, 2) + '\n';

/** Builds `<tmp>/repo/apps/api` + `<tmp>/repo/docs/dev` with unsorted lists. */
function fixture() {
  const repo = mkdtempSync(join(tmpdir(), 'sort-lists-'));
  dirs.push(repo);
  const api = join(repo, 'apps', 'api');
  put(
    api,
    'test/two-db-suites.json',
    json({
      _doc: 'keep me',
      run: ['zeta', 'alpha', 'Mid'],
      knownLimitations: [
        { spec: 'b-spec', kind: 'read' },
        { spec: 'a-spec', kind: 'write' },
      ],
      environmentOnly: ['y', 'x'],
    }),
  );
  put(
    api,
    'src/redis/redis-cluster-scan.allowlist.json',
    json([
      { file: 'b.ts', kind: 'mget', reason: 'r' },
      { file: 'a.ts', kind: 'scan', reason: 'r' },
      { file: 'a.ts', kind: 'multi', reason: 'r' },
    ]),
  );
  put(
    api,
    'src/sharding/cross-family-include.allowlist.json',
    json({ 'z.ts': ['B.x', 'A.y'], 'a.ts': ['Q.q'] }),
  );
  put(
    api,
    'src/architecture/admin-heavy-queries.baseline.json',
    json({ 'm/b.ts': 1, 'm-a/a.ts': 2 }),
  );
  put(
    repo,
    'docs/dev/SWITCH_INVENTORY.md',
    [
      '# Title',
      '',
      '| key | label |',
      '|---|---|',
      '| `b.key` | B |',
      '| `a.key` | A |',
      '',
      'text between tables',
      '| `d.key` | D |',
      '| `c.key` | C |',
      '',
    ].join('\n'),
  );
  return { repo, api };
}

describe('sort-lists', () => {
  it('uses plain code-unit order, not the locale', () => {
    assert.deepEqual(['b', 'A', 'a', 'B'].sort(cmp), ['A', 'B', 'a', 'b']);
  });

  it('sorts every registry and keeps everything else byte for byte', () => {
    const { repo, api } = fixture();
    const changed = sortLists({ apiRoot: api, write: true });
    assert.equal(changed.length, 5);
    const two = JSON.parse(
      readFileSync(join(api, 'test/two-db-suites.json'), 'utf8'),
    );
    assert.equal(two._doc, 'keep me');
    assert.deepEqual(two.run, ['Mid', 'alpha', 'zeta']);
    assert.deepEqual(two.environmentOnly, ['x', 'y']);
    assert.deepEqual(
      two.knownLimitations.map((k) => k.spec),
      ['a-spec', 'b-spec'],
    );
    const redis = JSON.parse(
      readFileSync(
        join(api, 'src/redis/redis-cluster-scan.allowlist.json'),
        'utf8',
      ),
    );
    assert.deepEqual(
      redis.map((r) => `${r.file}|${r.kind}`),
      ['a.ts|multi', 'a.ts|scan', 'b.ts|mget'],
    );
    const cross = JSON.parse(
      readFileSync(
        join(api, 'src/sharding/cross-family-include.allowlist.json'),
        'utf8',
      ),
    );
    assert.deepEqual(Object.keys(cross), ['a.ts', 'z.ts']);
    assert.deepEqual(cross['z.ts'], ['A.y', 'B.x']);
    assert.deepEqual(
      Object.keys(
        JSON.parse(
          readFileSync(
            join(api, 'src/architecture/admin-heavy-queries.baseline.json'),
            'utf8',
          ),
        ),
      ),
      ['m-a/a.ts', 'm/b.ts'],
    );
    const md = readFileSync(join(repo, 'docs/dev/SWITCH_INVENTORY.md'), 'utf8');
    assert.equal(
      md,
      [
        '# Title',
        '',
        '| key | label |',
        '|---|---|',
        '| `a.key` | A |',
        '| `b.key` | B |',
        '',
        'text between tables',
        '| `c.key` | C |',
        '| `d.key` | D |',
        '',
      ].join('\n'),
    );
  });

  it('is idempotent and silent once sorted', () => {
    const { api } = fixture();
    sortLists({ apiRoot: api, write: true });
    assert.deepEqual(sortLists({ apiRoot: api, write: true }), []);
  });

  it('check mode reports unsorted files and writes nothing', () => {
    const { api } = fixture();
    const before = readFileSync(join(api, 'test/two-db-suites.json'), 'utf8');
    const bad = sortLists({ apiRoot: api, write: false });
    assert.ok(bad.includes('test/two-db-suites.json'));
    assert.equal(
      readFileSync(join(api, 'test/two-db-suites.json'), 'utf8'),
      before,
    );
  });

  it('skips registries that do not exist on this branch', () => {
    const repo = mkdtempSync(join(tmpdir(), 'sort-lists-empty-'));
    dirs.push(repo);
    assert.deepEqual(
      sortLists({ apiRoot: join(repo, 'apps', 'api'), write: false }),
      [],
    );
  });

  it('table rows keep other lines, and non-row text is never reordered', () => {
    const text = 'x\n| `b` | 1 |\n| `a` | 2 |\nz\n';
    assert.equal(canonMarkdownRows(text), 'x\n| `a` | 2 |\n| `b` | 1 |\nz\n');
  });

  it('the real repo registries are sorted (the same check CI runs)', () => {
    execFileSync(process.execPath, [SCRIPT, '--check'], { stdio: 'pipe' });
  });
});
