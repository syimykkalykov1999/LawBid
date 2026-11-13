import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import { deriveDemoDatabaseUrl } from '../../prisma/prisma.service';
import { tmpdir } from 'node:os';
import {
  DemoDatabaseService,
  pgErrorCode,
  splitSqlStatements,
} from './demo-database.service';
import { parseDemoSettings } from './demo.settings';
import { generateInviteCode, hashCode } from './demo.service';

describe('demo world: migration replay', () => {
  const dir = resolve(__dirname, '../../../prisma/migrations');

  it('every migration file splits into whole statements', () => {
    const names = readdirSync(dir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);
    expect(names.length).toBeGreaterThan(0);
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

  it('keeps tagged dollar-quoted bodies ($fn$ … $fn$) whole', () => {
    expect(
      splitSqlStatements(
        'CREATE FUNCTION f() RETURNS int AS $fn$\nDECLARE\n  i integer := 0;\nBEGIN RETURN $1; END;\n$fn$ LANGUAGE plpgsql;\nSELECT 1;',
      ),
    ).toEqual([
      'CREATE FUNCTION f() RETURNS int AS $fn$\nDECLARE\n  i integer := 0;\nBEGIN RETURN $1; END;\n$fn$ LANGUAGE plpgsql',
      'SELECT 1',
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

describe('demo world: a half-applied migration (prod 2026-11-08)', () => {
  const exists = () =>
    Object.assign(new Error('type "x" already exists'), {
      code: 'P2010',
      meta: { code: '42710' },
    });

  function harness(half: string[]) {
    const dir = mkdtempSync(join(tmpdir(), 'demo-mig-'));
    mkdirSync(join(dir, '20260101_a'));
    writeFileSync(
      join(dir, '20260101_a', 'migration.sql'),
      'CREATE TYPE "x" AS ENUM (\'a\');\nCREATE TABLE "t" ("id" INT);\n',
    );
    const ran: string[] = [];
    const demo = {
      $queryRawUnsafe: jest.fn((sql: string) =>
        Promise.resolve(
          sql.includes('finished_at IS NULL')
            ? half.map((migration_name) => ({ migration_name }))
            : [],
        ),
      ),
      $executeRawUnsafe: jest.fn((sql: string) => {
        ran.push(sql);
        if (sql.startsWith('CREATE TYPE')) return Promise.reject(exists());
        return Promise.resolve(0);
      }),
      $transaction: jest.fn(
        (fn: (tx: unknown) => Promise<unknown>): Promise<unknown> => fn(tx),
      ),
    };
    const tx = { $executeRawUnsafe: demo.$executeRawUnsafe };
    const logger = { setContext: jest.fn(), warn: jest.fn(), info: jest.fn() };
    const svc = new DemoDatabaseService(
      {} as never,
      {} as never,
      logger as never,
    );
    jest
      .spyOn(svc as unknown as { migrationsDir(): string }, 'migrationsDir')
      .mockReturnValue(dir);
    const apply = () =>
      (
        svc as unknown as { applyMigrations(d: unknown): Promise<void> }
      ).applyMigrations(demo);
    return { apply, ran, demo };
  }

  it('reads the SQLSTATE from a Prisma raw-query error', () => {
    expect(pgErrorCode(exists())).toBe('42710');
    expect(pgErrorCode({ code: '42P07' })).toBe('42P07');
    expect(pgErrorCode(null)).toBe('');
  });

  it('a fresh migration still stops on «already exists»', async () => {
    const h = harness([]);
    await expect(h.apply()).rejects.toThrow('already exists');
  });

  it('a fresh migration runs in ONE transaction, like prisma migrate deploy (LOCK TABLE needs it, KE 124)', async () => {
    const h = harness([]);
    await expect(h.apply()).rejects.toThrow('already exists');
    expect(h.demo.$transaction).toHaveBeenCalledTimes(1);
  });

  it('a half-applied replay stays statement by statement (outside a transaction)', async () => {
    const h = harness(['20260101_a']);
    await h.apply();
    expect(h.demo.$transaction).not.toHaveBeenCalled();
  });

  it('a migration left half-applied is replayed past «already exists» and finished', async () => {
    const h = harness(['20260101_a']);
    await h.apply();
    expect(h.ran.some((s) => s.includes('SET rolled_back_at = now()'))).toBe(
      true,
    );
    expect(h.ran.some((s) => s.startsWith('CREATE TABLE "t"'))).toBe(true);
    expect(h.ran.some((s) => s.includes('SET finished_at = now()'))).toBe(true);
  });
});
