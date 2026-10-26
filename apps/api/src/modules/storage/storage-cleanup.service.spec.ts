import { Prisma } from '@prisma/client';
import {
  FILE_REFERENCES,
  StorageCleanupService,
  postMediaRetentionDays,
} from './storage-cleanup.service';
import { growth } from './storage-stats.service';

/** Every column that keeps a file id, read from schema.prisma (DMMF):
 * foreign keys to File, uuid arrays named `*_ids` and JSON `*file_ids`. */
function fileColumnsInSchema(): string[] {
  const out: string[] = [];
  for (const model of Prisma.dmmf.datamodel.models) {
    const table = model.dbName ?? model.name;
    const column = (name: string) =>
      model.fields.find((f) => f.name === name)?.dbName ?? name;
    for (const f of model.fields) {
      if (f.kind === 'object' && f.type === 'File') {
        for (const from of f.relationFromFields ?? []) {
          out.push(`${table}.${column(from)}`);
        }
      }
      if (
        f.kind === 'scalar' &&
        f.type === 'String' &&
        f.isList &&
        /(file|photo)_ids$/.test(f.name)
      ) {
        out.push(`${table}.${column(f.name)}[]`);
      }
      if (
        f.kind === 'scalar' &&
        f.type === 'Json' &&
        /file_ids$/.test(f.name)
      ) {
        out.push(`${table}.${column(f.name)}{}`);
      }
    }
  }
  return out.sort();
}

describe('StorageCleanupService references', () => {
  it('knows every place schema.prisma keeps a file id', () => {
    // A new relation to files must be added to FILE_REFERENCES (and the
    // NOT EXISTS list in unused()), or the cleanup would remove files that
    // are still in use.
    expect([...FILE_REFERENCES].sort()).toEqual(fileColumnsInSchema());
  });
});

describe('growth', () => {
  const MB = 1024 * 1024;
  it('is the percent change from yesterday', () => {
    expect(growth(200 * MB, 250 * MB)).toBe(25);
    expect(growth(200 * MB, 180 * MB)).toBe(-10);
  });
  it('never alerts on a small base', () => {
    expect(growth(10 * MB, 90 * MB)).toBe(0);
  });
});

describe('deleted post media vs the legal retention window (dedup D-7)', () => {
  it('keeps the photos of deleted posts at least legal.deleted_retention_days', () => {
    // storage 30 d + 7 d purge used to remove them at ~37 d, inside the
    // 90 d promised to official requests.
    expect(postMediaRetentionDays(30, 90)).toBe(90);
    expect(postMediaRetentionDays(120, 90)).toBe(120);
    expect(postMediaRetentionDays(0, 0)).toBe(1);
    expect(postMediaRetentionDays(30, Number.NaN)).toBe(30);
  });

  const makeService = (opts: {
    rows: { file_id: string; post_id: string; author_id: string }[];
    holds: { target_type: string; target_id: string }[];
  }) => {
    const prisma = {
      $queryRaw: jest.fn().mockResolvedValue(opts.rows),
      legalHold: { findMany: jest.fn().mockResolvedValue(opts.holds) },
    };
    const service = new StorageCleanupService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      { setContext: jest.fn() } as never,
    );
    return { prisma, service };
  };
  const without = (s: StorageCleanupService, ids: string[]) =>
    (
      s as unknown as {
        withoutHeld: (ids: string[], now: Date) => Promise<string[]>;
      }
    ).withoutHeld(ids, new Date('2026-10-25T00:00:00Z'));

  it('keeps a file whose post author is under a legal hold', async () => {
    const { service } = makeService({
      rows: [
        { file_id: 'f1', post_id: 'p1', author_id: 'u1' },
        { file_id: 'f2', post_id: 'p2', author_id: 'u2' },
      ],
      holds: [{ target_type: 'user', target_id: 'u1' }],
    });
    expect(await without(service, ['f1', 'f2', 'f3'])).toEqual(['f2', 'f3']);
  });

  it('keeps a file of a post that is itself under a hold', async () => {
    const { service } = makeService({
      rows: [{ file_id: 'f1', post_id: 'p1', author_id: 'u1' }],
      holds: [{ target_type: 'post', target_id: 'p1' }],
    });
    expect(await without(service, ['f1'])).toEqual([]);
  });

  it('asks only for active holds and skips the lookup when no post lists the files', async () => {
    const none = makeService({ rows: [], holds: [] });
    expect(await without(none.service, ['f1'])).toEqual(['f1']);
    expect(none.prisma.legalHold.findMany).not.toHaveBeenCalled();

    const some = makeService({
      rows: [{ file_id: 'f1', post_id: 'p1', author_id: 'u1' }],
      holds: [],
    });
    await without(some.service, ['f1']);
    const where = some.prisma.legalHold.findMany.mock.calls[0][0].where;
    expect(where.released_at).toBeNull();
    expect(JSON.stringify(where)).toContain('expires_at');
  });
});
