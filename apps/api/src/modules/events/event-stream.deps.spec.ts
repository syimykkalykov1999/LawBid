import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Every `@aws-sdk/*` package the API source loads by name (import / dynamic
 * import / require) must be a declared dependency. A computed name used to
 * hide a missing package from tsc until the feature was switched on in
 * production (audit 2026-11-02: client-kinesis).
 */
function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return sources(p);
    return /\.ts$/.test(name) && !/\.spec\.ts$/.test(name) ? [p] : [];
  });
}

describe('@aws-sdk packages used by the API are declared', () => {
  it('has every literal @aws-sdk specifier in package.json', () => {
    const root = join(__dirname, '../..');
    const pkg = JSON.parse(
      readFileSync(join(root, '../package.json'), 'utf8'),
    ) as { dependencies: Record<string, string> };
    const used = new Set<string>();
    for (const f of sources(root)) {
      const re = /['"](@aws-sdk\/[a-z0-9-]+)['"]/g;
      for (const m of readFileSync(f, 'utf8').matchAll(re)) used.add(m[1]);
    }
    expect([...used]).toContain('@aws-sdk/client-kinesis');
    const missing = [...used].filter((n) => !pkg.dependencies[n]);
    expect(missing).toEqual([]);
  });
});
