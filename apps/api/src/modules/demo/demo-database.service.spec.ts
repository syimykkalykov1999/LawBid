import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { deriveDemoDatabaseUrl } from '../../prisma/prisma.service';
import { splitSqlStatements } from './demo-database.service';
import { parseDemoSettings } from './demo.settings';
import { generateInviteCode, hashCode } from './demo.service';

describe('demo world: migration replay', () => {
  const dir = resolve(__dirname, '../../../prisma/migrations');

  it('every migration file splits into whole statements', () => {
    const names = readdirSync(dir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);
    expect(names.length).toBeGreaterThan(50);
    for (const name of names) {
      const sql = readFileSync(join(dir, name, 'migration.sql'), 'utf8');
      const statements = splitSqlStatements(sql);
      expect(statements.length).toBeGreaterThan(0);
      for (const s of statements) {
        // No statement may start with a comment or be split inside a quote.
        expect(s.startsWith('--')).toBe(false);
        expect((s.match(/'/g) ?? []).length % 2).toBe(0);
      }
    }
  });

  it('keeps semicolons inside quotes and $$ bodies', () => {
    expect(
      splitSqlStatements(
        "INSERT INTO t VALUES ('a;b'); -- c;\nCREATE FUNCTION f() AS $$ SELECT 1; $$ LANGUAGE sql;",
      ),
    ).toEqual([
      "INSERT INTO t VALUES ('a;b')",
      'CREATE FUNCTION f() AS $$ SELECT 1; $$ LANGUAGE sql',
    ]);
  });

  it('derives the demo database url from the real one', () => {
    expect(
      deriveDemoDatabaseUrl(
        'postgresql://root@localhost:26257/lawbid?sslmode=disable',
      ),
    ).toBe('postgresql://root@localhost:26257/lawbid_demo?sslmode=disable');
    expect(deriveDemoDatabaseUrl(undefined)).toBeNull();
  });
});

describe('demo settings and invite codes', () => {
  it('falls back field by field and clamps', () => {
    const s = parseDemoSettings({
      ttlDays: 999,
      enabled: false,
      bannerText: { ru: '' },
    });
    expect(s.enabled).toBe(false);
    expect(s.ttlDays).toBe(60);
    expect(s.maxAccountsPerPartner).toBe(5);
    expect(s.bannerText.ru).toContain('Демо');
  });

  it('codes are 8 unambiguous chars and hash case-insensitively', () => {
    const code = generateInviteCode();
    expect(code).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/);
    expect(hashCode(code.toLowerCase())).toBe(
      hashCode(`${code.slice(0, 4)}-${code.slice(4)}`),
    );
  });
});
