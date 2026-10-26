import { Prisma } from '@prisma/client';
import { FILE_REFERENCES } from './storage-cleanup.service';
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
