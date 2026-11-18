import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { PUBLIC_CONFIG_PREFIXES } from '../modules/feature-flags/services/bootstrap.service';

/**
 * Row 214 (KNOWN_ERRORS 196): «API e2e (two databases)» went red at random
 * because `owner-text-limits` wrote `app_config` straight into the table and
 * reset only the Redis copy (`redis.del('config:app_config')`). The body of
 * GET /config/bootstrap is cached per config VERSION (Valkey, shared by the
 * suites of a run), so without a version bump an older suite's body came
 * back without the new limit. An admin save never does that: it goes
 * through dropAppConfigCache (memo + Redis copy + version).
 *
 * Guard: an e2e resets the config cache only like an admin save.
 * 1. No bare `del('config:app_config')` / `del(APP_CONFIG_CACHE_KEY)`.
 * 2. A suite that boots the app and writes a public bootstrap key
 *    (PUBLIC_CONFIG_PREFIXES) straight into `app_config` calls
 *    dropAppConfigCache or bumpConfigVersion.
 */
const TEST_DIR = resolve(__dirname, '../../test');

function files(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) files(p, out);
    else if (name.endsWith('.ts')) out.push(p);
  }
  return out;
}

const BARE_DEL =
  /\.del\(\s*(?:'config:app_config'|"config:app_config"|APP_CONFIG_CACHE_KEY)\s*\)/;
const DIRECT_WRITE =
  /\.appConfig\.(?:upsert|update|updateMany|create|createMany|delete|deleteMany)\(|(?:INSERT INTO|UPDATE)\s+"?app_config"?/i;
const BOOTS_APP = /createNestApplication|bootE2eApp|AppModule/;
const RESETS = /dropAppConfigCache|bumpConfigVersion/;

function publicKeysIn(src: string): string[] {
  const keys = new Set<string>();
  for (const m of src.matchAll(/['"`]([a-z][a-z0-9_.]+)['"`]/g)) {
    if (PUBLIC_CONFIG_PREFIXES.some((p) => m[1].startsWith(p))) keys.add(m[1]);
  }
  return [...keys];
}

describe('e2e reset the config cache like an admin save (row 214)', () => {
  const all = files(TEST_DIR).map((p) => ({
    name: relative(TEST_DIR, p),
    src: readFileSync(p, 'utf8'),
  }));

  it('scans the e2e suites', () => {
    expect(
      all.filter((f) => f.name.endsWith('.e2e-spec.ts')).length,
    ).toBeGreaterThan(50);
  });

  it('no bare del of the app_config cache key (use dropAppConfigCache)', () => {
    expect(all.filter((f) => BARE_DEL.test(f.src)).map((f) => f.name)).toEqual(
      [],
    );
  });

  it('a suite writing a public bootstrap key into app_config moves the config version', () => {
    const offenders = all
      .filter((f) => BOOTS_APP.test(f.src) && DIRECT_WRITE.test(f.src))
      .filter((f) => publicKeysIn(f.src).length > 0 && !RESETS.test(f.src))
      .map((f) => `${f.name}: ${publicKeysIn(f.src).join(', ')}`);
    expect(offenders).toEqual([]);
  });

  it('catches the #1178 shape', () => {
    const src = `await prisma.appConfig.upsert({ where: { key: 'limits.comment_chars' } });
      await redis.del('config:app_config'); // AppModule`;
    expect(BARE_DEL.test(src)).toBe(true);
    expect(
      DIRECT_WRITE.test(src) &&
        publicKeysIn(src).length > 0 &&
        !RESETS.test(src),
    ).toBe(true);
  });
});
