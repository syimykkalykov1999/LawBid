import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * Owner rule (row 87, hotline plan PR 4): the hotline must NOT change the
 * 1:1 calls — the API calls module, the shared call constants, the TURN
 * box and the app's calls feature. The hotline reaches them only through
 * `hotline-call-bridge.ts` (UC 33 in hotline.service.spec.ts). This test
 * pins every one of those files by its SHA-256 as `main` had it when the
 * bridge was built.
 *
 * Red here = a calls file changed. In a hotline PR: undo that change. In a
 * PR that is ABOUT calls (owner-approved calls work): refresh the pins with
 *   UPDATE_CALLS_BASELINE=1 npm test -- src/modules/hotline/hotline-calls-untouched.spec.ts
 * and say so in the PR body.
 */
const REPO = join(__dirname, '../../../../..');
const BASELINE = join(__dirname, 'hotline-calls-untouched.baseline.json');
const ROOTS = [
  'apps/api/src/modules/calls',
  'apps/api/src/common/calls',
  'apps/mobile/lib/features/calls',
  'infra/modules/turn',
];

function walk(dir: string): string[] {
  let out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (name.startsWith('.')) continue; // .DS_Store and the like
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out = out.concat(walk(p));
    else out.push(p);
  }
  return out;
}

function current(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const root of ROOTS) {
    for (const f of walk(join(REPO, root))) {
      out[relative(REPO, f)] = createHash('sha256')
        .update(readFileSync(f))
        .digest('hex');
    }
  }
  return Object.fromEntries(
    Object.entries(out).sort(([a], [b]) => a.localeCompare(b)),
  );
}

describe('hotline: the 1:1 calls are untouched (owner rule)', () => {
  it('every calls / TURN / app-calls file matches its pinned SHA-256', () => {
    const now = current();
    // «<sha256> <path>» lines (not path: hash pairs, which secret scanners
    // read as `token: <hex>` for file names like *-token.spec.ts)
    if (process.env.UPDATE_CALLS_BASELINE === '1') {
      const lines = Object.entries(now).map(([f, h]) => `${h} ${f}`);
      writeFileSync(BASELINE, `${JSON.stringify(lines, null, 2)}\n`);
    }
    const pinned = Object.fromEntries(
      (JSON.parse(readFileSync(BASELINE, 'utf8')) as string[]).map((l) => {
        const i = l.indexOf(' ');
        return [l.slice(i + 1), l.slice(0, i)];
      }),
    );
    const changed = Object.keys({ ...pinned, ...now }).filter(
      (f) => pinned[f] !== now[f],
    );
    expect(changed).toEqual([]);
    expect(Object.keys(pinned).length).toBeGreaterThan(40);
  });
});
