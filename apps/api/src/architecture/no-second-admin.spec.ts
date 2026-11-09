import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

/**
 * Owner 2026-10-25, again 2026-11-08 («удали второго админа», ADR 0010):
 * no action anywhere waits for a second admin. The owner confirms with his
 * own fresh 2FA code and the action runs (plus an audit_log row). This guard
 * fails when code or an admin text again says a second admin / another
 * admin's approval is needed, like the old «нужен второй админ и код 2FA»
 * hint on «Бюджеты AWS».
 */
const REPO = resolve(__dirname, '../../../..');
const ROOTS = ['apps/api/src', 'apps/admin/src', 'apps/admin/content'];
const SKIP_DIRS = new Set(['node_modules', '.next', 'dist', 'coverage']);
const EXT = /\.(ts|tsx|md|json)$/;
const SELF = relative(REPO, __filename);

/** Wordings that claim a second person must approve. Negated wordings
 * («второй админ не нужен», "no second admin") do not match. */
const CLAIMS: RegExp[] = [
  /нуж(ен|на|но)\s+(и\s+)?втор(ой|ого)\s+(админ|администратор)/i,
  /(требу(ет|ют)|(^|[\s(«])с)\s+(2FA\s+и\s+)?(подтверждени(ем|я)\s+)?втор(ого|ым)\s+(админ|администратор|человек)/i,
  /(ждёт|ждет|ожидает)\s+(подтверждения\s+)?(втор(ого|ым)|друг(ого|им))\s+(админ|администратор)/i,
  /(needs?|requires?|then)\s+a\s+second\s+admin/i,
  /second\s+admin'?s?\s+approv/i,
  /until\s+(another|a\s+second)\s+admin\s+approves/i,
];

function files(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) files(p, out);
    else if (EXT.test(name)) out.push(p);
  }
  return out;
}

describe('no second admin anywhere (owner 2026-11-08)', () => {
  it('no code or admin text says a second admin must approve', () => {
    const hits: string[] = [];
    for (const root of ROOTS) {
      for (const f of files(join(REPO, root))) {
        const rel = relative(REPO, f);
        if (rel === SELF) continue;
        readFileSync(f, 'utf8')
          .split('\n')
          .forEach((line, i) => {
            if (CLAIMS.some((re) => re.test(line)))
              hits.push(`${rel}:${i + 1}: ${line.trim()}`);
          });
      }
    }
    expect(hits).toEqual([]);
  });

  it('the guard itself catches the old budget hint', () => {
    const old =
      "hint: 'Страница «Масштаб» → «Бюджеты AWS» → «Удалить» (нужен второй админ и код 2FA).',";
    expect(CLAIMS.some((re) => re.test(old))).toBe(true);
    expect(
      CLAIMS.some((re) => re.test('Код 2FA. Второй админ не нужен.')),
    ).toBe(false);
  });
});
