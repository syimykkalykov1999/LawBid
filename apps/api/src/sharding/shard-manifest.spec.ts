import { Prisma } from '@prisma/client';
import {
  GLOBAL_MODELS,
  SHARDED_MODELS,
  familyOf,
  manifestModels,
} from './shard-manifest';

const models = Prisma.dmmf.datamodel.models;
const byName = new Map(models.map((m) => [m.name, m]));

describe('shard family manifest (shard-ready step 0)', () => {
  it('assigns a family to EVERY Prisma model (a new model must be added to shard-manifest.ts)', () => {
    const missing = models.map((m) => m.name).filter((n) => !familyOf(n));
    expect(missing).toEqual([]);
  });

  it('names no model that does not exist (renamed / removed model)', () => {
    const stale = manifestModels().filter((n) => !byName.has(n));
    expect(stale).toEqual([]);
  });

  it('lists each model once (not both global and sharded, no duplicates)', () => {
    const all = manifestModels();
    expect(new Set(all).size).toBe(all.length);
    expect(all.length).toBe(models.length);
    expect(GLOBAL_MODELS.filter((n) => n in SHARDED_MODELS)).toEqual([]);
  });

  it('has the expected number of sharded models per family', () => {
    const counts: Record<string, number> = {};
    for (const s of Object.values(SHARDED_MODELS)) {
      counts[s.family] = (counts[s.family] ?? 0) + 1;
    }
    counts.global = GLOBAL_MODELS.length;
    // Staff package T1 (2026-10-27): + 18 admin-side staff tables.
    expect(counts).toEqual({ case: 46, user: 26, content: 32, global: 192 });
  });

  describe.each(Object.entries(SHARDED_MODELS))('%s', (name, spec) => {
    const model = byName.get(name)!;
    const scalar = (f: string) =>
      model.fields.find((x) => x.name === f && x.kind === 'scalar');

    it('declares at least one shard key and each key field is a uuid column', () => {
      expect(spec.keys.length).toBeGreaterThan(0);
      for (const k of spec.keys) {
        const f = scalar(k.field);
        expect(f).toBeDefined();
        expect(f!.type).toBe('String');
      }
    });

    it('parent keys point at an existing model of the same family', () => {
      for (const k of spec.keys) {
        if (k.kind !== 'parent') continue;
        expect(byName.has(k.model)).toBe(true);
        expect(SHARDED_MODELS[k.model]?.family).toBe(spec.family);
        expect(k.model).not.toBe(name);
      }
    });
  });

  it('every parent chain ends at a root with an owner key (no cycles)', () => {
    for (const [name] of Object.entries(SHARDED_MODELS)) {
      const seen = new Set<string>();
      let cur = name;
      for (;;) {
        expect(seen.has(cur)).toBe(false);
        seen.add(cur);
        const spec = SHARDED_MODELS[cur];
        const parentKey = spec.keys.find((k) => k.kind === 'parent');
        if (!parentKey || parentKey.kind !== 'parent') break;
        cur = parentKey.model;
      }
      // The last model of a chain resolves by owner (a root) or by parents
      // only; roots are the models with an owner key.
      const last = SHARDED_MODELS[cur];
      const hasOwner = last.keys.some((k) => k.kind === 'owner');
      const hasParent = last.keys.some((k) => k.kind === 'parent');
      expect(hasOwner || !hasParent).toBe(true);
    }
  });
});
