import { Prisma } from '@prisma/client';
import { familyOf } from '../../sharding/shard-manifest';
import {
  ERASURE_POLICIES,
  EXTERNAL_STORES,
  MODEL_POLICY,
  SWEEPS,
  VIA_PARENT,
  policyOf,
  registeredModels,
  userReferenceFields,
} from './personal-data-registry';

const models = Prisma.dmmf.datamodel.models;
const byName = new Map(models.map((m) => [m.name, m]));

describe('personal data registry', () => {
  it('lists EVERY model with a user reference (a new table must be added to personal-data-registry.ts)', () => {
    const missing = models
      .filter((m) => userReferenceFields(m.fields).length > 0)
      .map((m) => `${m.name} (${userReferenceFields(m.fields).join(', ')})`)
      .filter((label) => !policyOf(label.split(' ')[0]));
    expect(missing).toEqual([]);
  });

  it('names no model that does not exist (renamed / removed table)', () => {
    expect(registeredModels().filter((n) => !byName.has(n))).toEqual([]);
  });

  it('puts each model under exactly one policy', () => {
    const all = registeredModels();
    expect(all.filter((n, i) => all.indexOf(n) !== i)).toEqual([]);
    expect(Object.keys(MODEL_POLICY).sort()).toEqual(
      [...ERASURE_POLICIES].sort(),
    );
  });

  it('only lists models that really reference a user (no dead entries)', () => {
    const dead = registeredModels().filter((n) => {
      const m = byName.get(n);
      return (
        m &&
        !VIA_PARENT.includes(n) &&
        userReferenceFields(m.fields).length === 0
      );
    });
    expect(dead).toEqual([]);
  });

  describe.each(Object.entries(SWEEPS))('sweep %s', (name, fields) => {
    it('is an erase model whose sweep fields are uuid columns', () => {
      expect(policyOf(name)).toBe('erase');
      const model = byName.get(name)!;
      for (const f of fields) {
        const col = model.fields.find((x) => x.name === f);
        expect(col?.kind).toBe('scalar');
        expect(col?.type).toBe('String');
      }
    });

    // Union of PRs (2026-10-27): a child declared ON DELETE CASCADE (e.g.
    // calendar_event_links of #395) goes with the swept row, so it is allowed.
    it('is a leaf table: nothing else has a blocking foreign key to it', () => {
      const parents = models.filter((m) =>
        m.fields.some(
          (f) =>
            f.kind === 'object' &&
            f.type === name &&
            (f.relationFromFields?.length ?? 0) > 0 &&
            f.relationOnDelete !== 'Cascade' &&
            m.name !== name,
        ),
      );
      expect(parents.map((p) => p.name)).toEqual([]);
    });
  });

  it('keeps the external store ids unique and covers the required kinds', () => {
    const ids = EXTERNAL_STORES.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    const kinds = new Set(EXTERNAL_STORES.map((s) => s.kind));
    for (const k of [
      'search_index',
      'redis',
      'object_storage',
      'cdn_cache',
      'video',
      'push',
      'analytics',
      'archive',
      'ledger',
      'audit',
      'legal_hold',
    ]) {
      expect(kinds.has(k as never)).toBe(true);
    }
  });

  it('keeps the legal hold the first store (it blocks the rest)', () => {
    expect(EXTERNAL_STORES[0].id).toBe('legal_hold');
    expect(EXTERNAL_STORES[0].policy).toBe('block');
  });

  it('sweeps sharded models in the sharded families and the rest on primary', () => {
    for (const m of Object.keys(SWEEPS)) {
      expect(familyOf(m)).toBeDefined();
    }
  });

  it('stores the home region of the user (data residency groundwork)', () => {
    const user = byName.get('User')!;
    const col = user.fields.find((f) => f.name === 'home_region');
    expect(col?.default).toBe('us');
    const shardMap = byName.get('ShardMap')!;
    expect(shardMap.fields.find((f) => f.name === 'region')?.default).toBe(
      'us',
    );
  });
});
