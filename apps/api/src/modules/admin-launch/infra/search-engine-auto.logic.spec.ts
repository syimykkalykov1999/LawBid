import {
  searchActionImmediate,
  searchAutoStep,
  type SearchAutoInput,
} from './search-engine-auto.logic';

const base: SearchAutoInput = {
  follow: 'auto',
  mode: 'postgres',
  domain: 'on',
  engineConfigured: true,
  phase: null,
};
const step = (p: Partial<SearchAutoInput>) => searchAutoStep({ ...base, ...p });

describe('search.engine follows the search engine domain («Авто»)', () => {
  it('walks postgres → shadow → reindex → swap reads → swap writes → engine', () => {
    expect(step({})).toMatchObject({ kind: 'set_mode', to: 'shadow' });
    expect(step({ mode: 'shadow' })).toMatchObject({ kind: 'start_reindex' });
    expect(step({ mode: 'shadow', phase: 'building' })).toBeNull();
    expect(step({ mode: 'shadow', phase: 'built' })).toMatchObject({
      kind: 'swap',
    });
    expect(step({ mode: 'shadow', phase: 'read_swapped' })).toMatchObject({
      kind: 'swap',
    });
    expect(step({ mode: 'shadow', phase: 'write_swapped' })).toMatchObject({
      kind: 'set_mode',
      to: 'engine',
    });
    expect(step({ mode: 'engine', phase: 'completed' })).toBeNull();
  });

  it('a rolled-back or cancelled run is started again', () => {
    expect(step({ mode: 'shadow', phase: 'rolled_back' })).toMatchObject({
      kind: 'start_reindex',
    });
    expect(step({ mode: 'shadow', phase: 'cancelled' })).toMatchObject({
      kind: 'start_reindex',
    });
  });

  it('domain off or no address: back to postgres at once, from any mode', () => {
    for (const mode of ['shadow', 'engine'] as const) {
      const a = step({ mode, domain: 'off' });
      expect(a).toMatchObject({ kind: 'set_mode', to: 'postgres' });
      expect(searchActionImmediate(a!)).toBe(true);
      expect(step({ mode, engineConfigured: false })).toMatchObject({
        to: 'postgres',
      });
    }
    expect(step({ mode: 'postgres', domain: 'off' })).toBeNull();
    expect(searchActionImmediate(step({})!)).toBe(false);
  });

  it('manual: the admin owns search.engine, nothing is touched', () => {
    expect(step({ follow: 'manual' })).toBeNull();
    expect(
      step({ follow: 'manual', mode: 'engine', domain: 'off' }),
    ).toBeNull();
  });
});
