import { GLOBAL_MODELS, SHARDED_MODELS } from './shard-manifest';
import { datamodel as prismaDatamodel } from '../generated/prisma-dmmf';

const byName = new Map(prismaDatamodel.models.map((m) => [m.name, m] as const));

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
    // The move tool's own per-database change log names the shard it records.
    const wrong = GLOBAL_MODELS.filter((n) => n !== 'ShardChangeLog').filter(
      (n) => byName.get(n)?.fields.some((f) => f.name === 'shard_id'),
    );
    expect(wrong).toEqual([]);
  });
});
