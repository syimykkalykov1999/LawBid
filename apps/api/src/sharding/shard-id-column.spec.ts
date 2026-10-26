import { Prisma } from '@prisma/client';
import { GLOBAL_MODELS, SHARDED_MODELS } from './shard-manifest';

const byName = new Map(
  Prisma.dmmf.datamodel.models.map((m) => [m.name, m] as const),
);

describe('shard_id column (shard-ready step 2)', () => {
  it.each(Object.keys(SHARDED_MODELS))(
    '%s has a required smallint shard_id with default 0',
    (name) => {
      const f = byName.get(name)!.fields.find((x) => x.name === 'shard_id');
      expect(f).toBeDefined();
      expect(f!.type).toBe('Int');
      expect(f!.nativeType?.[0]).toBe('SmallInt');
      expect(f!.isRequired).toBe(true);
      expect(f!.default).toBe(0);
    },
  );

  it('keeps shard_id off global models', () => {
    const wrong = GLOBAL_MODELS.filter((n) =>
      byName.get(n)?.fields.some((f) => f.name === 'shard_id'),
    );
    expect(wrong).toEqual([]);
  });
});
