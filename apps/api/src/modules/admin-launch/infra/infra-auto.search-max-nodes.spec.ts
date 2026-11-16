import {
  AUTO_SCOPE,
  autoWants,
  overMaxSearchNodes,
  SEARCH_NODES,
  type AutoSignals,
  type AutoWant,
} from './infra-auto.logic';
import {
  COST_REGISTRY,
  INFRA_MODE_KEYS,
  SEARCH_NODES_DEFAULT as REGISTRY_DEFAULT,
  SEARCH_NODES_HARD_MAX as REGISTRY_HARD_MAX,
} from '../../../common/ops/cost-registry';
import {
  INFRA_KEYS,
  SEARCH_NODE_ROWS,
  SEARCH_NODES_DEFAULT,
  SEARCH_NODES_HARD_MAX,
  checkValue,
  maxSearchNodes,
  searchNodeRowShown,
  switchFor,
} from '../../../common/ops/infra-switches';
import { APP_SETTINGS } from '../../../common/app-settings/app-settings.defaults';
import { configSchema } from '../../admin-config/config-schema';
import { OWNER_ONLY_CONFIG_KEYS } from '../../admin-config/admin-config.service';

/**
 * Owner 15.11 («максимум узлов поиска в админке, "Авто" дальше четырёх»):
 * search.max_nodes (owner only, 2FA, default 4) decides how far «Авто»
 * takes the search domain: steps of two (one node per zone), 1 -> 2 -> 4
 * -> 6 -> 8 -> 10 (AWS T3 total node limit), and back the same way.
 * Every case below fails on the code before (no row past four nodes).
 */
const calm: AutoSignals = {
  pressures: [],
  budgetRatio: 0.2,
  searchEngine: 'engine',
  partitionNeedsRunner: false,
};
const ids = (w: AutoWant[]) =>
  w
    .map((x) => `${x.id}:${x.to}`)
    .filter((x) => x.startsWith('aws.opensearch'))
    .sort();
/** The domain plus every node step up to [nodes] on. */
const liveAt =
  (nodes: number) =>
  (id: string): 'on' | 'off' => {
    const i = SEARCH_NODE_ROWS.indexOf(id);
    if (i < 0) return 'off';
    const count = i === 0 ? 1 : i * 2;
    return count <= nodes ? 'on' : 'off';
  };
const busy = (max?: number): AutoSignals => ({
  ...calm,
  pressures: ['search_busy'],
  maxSearchNodes: max,
});
const idle = (max?: number): AutoSignals => ({
  ...calm,
  pressures: ['search_idle'],
  maxSearchNodes: max,
});
const handed = new Set(SEARCH_NODE_ROWS);

describe('search.max_nodes: «Авто» past four search nodes (owner 15.11)', () => {
  it('the ladder is 1, 2, 4, 6, 8, 10 nodes (AWS: even across two zones, T3 limit 10)', () => {
    expect([...SEARCH_NODES]).toEqual([
      'aws.opensearch',
      'aws.opensearch_nodes_2',
      'aws.opensearch_nodes_4',
      'aws.opensearch_nodes_6',
      'aws.opensearch_nodes_8',
      'aws.opensearch_nodes_10',
    ]);
    expect(SEARCH_NODES_HARD_MAX).toBe(10);
    expect(SEARCH_NODES_DEFAULT).toBe(4);
    // cost-registry.ts has no imports: the same numbers twice.
    expect(REGISTRY_HARD_MAX).toBe(SEARCH_NODES_HARD_MAX);
    expect(REGISTRY_DEFAULT).toBe(SEARCH_NODES_DEFAULT);
  });

  it('default (setting missing or 4): stops at four nodes, as before', () => {
    expect(ids(autoWants(busy(), liveAt(4), new Set()))).toEqual([]);
    expect(ids(autoWants(busy(4), liveAt(4), new Set()))).toEqual([]);
    // below four nothing changed
    expect(ids(autoWants(busy(), liveAt(2), new Set()))).toEqual([
      'aws.opensearch_nodes_4:on',
    ]);
  });

  it('up: with 10 allowed, one step of two nodes at a time, then stop', () => {
    expect(ids(autoWants(busy(10), liveAt(4), new Set()))).toEqual([
      'aws.opensearch_nodes_6:on',
    ]);
    expect(ids(autoWants(busy(10), liveAt(6), new Set()))).toEqual([
      'aws.opensearch_nodes_8:on',
    ]);
    expect(ids(autoWants(busy(10), liveAt(8), new Set()))).toEqual([
      'aws.opensearch_nodes_10:on',
    ]);
    expect(ids(autoWants(busy(10), liveAt(10), new Set()))).toEqual([]);
  });

  it('up: the maximum stops it (6 -> stays at 6; odd 7 acts as 6)', () => {
    expect(ids(autoWants(busy(6), liveAt(6), new Set()))).toEqual([]);
    expect(ids(autoWants(busy(7), liveAt(6), new Set()))).toEqual([]);
    expect(ids(autoWants(busy(7), liveAt(4), new Set()))).toEqual([
      'aws.opensearch_nodes_6:on',
    ]);
    // 1 = the domain only
    expect(ids(autoWants(busy(1), liveAt(1), new Set()))).toEqual([]);
  });

  it('down: idle takes back the highest step only, two nodes at a time', () => {
    for (const [at, gone] of [
      [10, 'aws.opensearch_nodes_10'],
      [8, 'aws.opensearch_nodes_8'],
      [6, 'aws.opensearch_nodes_6'],
      [4, 'aws.opensearch_nodes_4'],
      [2, 'aws.opensearch_nodes_2'],
    ] as const) {
      expect(ids(autoWants(idle(10), liveAt(at), handed))).toEqual([
        `${gone}:off`,
      ]);
    }
  });

  it('down: a step above a lowered maximum still goes when idle, never grows', () => {
    // the owner lowered 10 -> 4 while 8 nodes run: idle takes 8 back first
    expect(ids(autoWants(idle(4), liveAt(8), handed))).toEqual([
      'aws.opensearch_nodes_8:off',
    ]);
    // busy at 8 with the maximum at 4: nothing added
    expect(ids(autoWants(busy(4), liveAt(8), new Set()))).toEqual([]);
  });

  it('Выкл / Вкл per step as today', () => {
    // Выкл on the next step: never switched on by itself
    expect(
      ids(
        autoWants(
          { ...busy(10), modes: { 'aws.opensearch_nodes_6': 'off' } },
          liveAt(4),
          new Set(),
        ),
      ),
    ).toEqual([]);
    // Вкл on the top step: never switched off by itself
    expect(
      ids(
        autoWants(
          { ...idle(10), modes: { 'aws.opensearch_nodes_8': 'on' } },
          liveAt(8),
          handed,
        ),
      ),
    ).toEqual([]);
    // Вкл on a step that is off comes back on, inside the maximum only
    expect(
      ids(
        autoWants(
          {
            ...calm,
            maxSearchNodes: 8,
            modes: { 'aws.opensearch_nodes_8': 'on' },
          },
          liveAt(6),
          new Set(),
        ),
      ),
    ).toEqual(['aws.opensearch_nodes_8:on']);
    expect(
      ids(
        autoWants(
          {
            ...calm,
            maxSearchNodes: 6,
            modes: { 'aws.opensearch_nodes_8': 'on' },
          },
          liveAt(6),
          new Set(),
        ),
      ),
    ).toEqual([]);
  });

  it('the setting: 1..10, odd above 1 = the even step below, junk = 4', () => {
    expect(maxSearchNodes(undefined)).toBe(4);
    expect(maxSearchNodes('abc')).toBe(4);
    expect(maxSearchNodes('8')).toBe(8);
    expect(maxSearchNodes(5)).toBe(4);
    expect(maxSearchNodes(1)).toBe(1);
    expect(maxSearchNodes(0)).toBe(1);
    expect(maxSearchNodes(99)).toBe(10);
    expect(overMaxSearchNodes('aws.opensearch_nodes_6', 4)).toBe(true);
    expect(overMaxSearchNodes('aws.opensearch_nodes_6', 6)).toBe(false);
    expect(overMaxSearchNodes('aws.rds_replicas', 1)).toBe(false);
    expect(APP_SETTINGS['search.max_nodes']).toBe(4);
    const schema = configSchema()['search.max_nodes'];
    expect([schema.min, schema.max]).toEqual([1, 10]);
    // owner only, with a fresh 2FA code
    expect(OWNER_ONLY_CONFIG_KEYS.has('search.max_nodes')).toBe(true);
  });

  it('«Масштаб» (look frozen): rows past four only inside the maximum or while on', () => {
    expect(searchNodeRowShown('aws.opensearch_nodes_4', 'off', undefined)).toBe(
      true,
    );
    expect(searchNodeRowShown('aws.opensearch_nodes_6', 'off', undefined)).toBe(
      false,
    );
    expect(searchNodeRowShown('aws.opensearch_nodes_6', 'off', 6)).toBe(true);
    expect(searchNodeRowShown('aws.opensearch_nodes_8', 'on', 4)).toBe(true);
    expect(searchNodeRowShown('aws.rds_replicas', 'off', 1)).toBe(true);
  });

  it('every new step is wired: switch values, registry row, «Масштаб» key, Auto scope', () => {
    expect(checkValue('growth.opensearch_instance_count', 10)).toBeNull();
    expect(checkValue('growth.opensearch_instance_count', 12)).not.toBeNull();
    expect(INFRA_KEYS['growth.opensearch_instance_count'].spec).toEqual({
      type: 'integer',
      min: 1,
      max: 10,
    });
    for (const n of [6, 8, 10]) {
      const id = `aws.opensearch_nodes_${n}`;
      expect(switchFor(id)?.values).toEqual({
        off: { 'growth.opensearch_instance_count': n - 2 },
        on: { 'growth.opensearch_instance_count': n },
      });
      const row = COST_REGISTRY.find((e) => e.id === id);
      expect(row?.states).toEqual(['off', 'on', 'auto']);
      const key = INFRA_MODE_KEYS[id];
      expect(key).toBe(`infra.mode.opensearch_nodes_${n}`);
      expect((APP_SETTINGS as Record<string, unknown>)[key]).toBe('auto');
      expect(configSchema()[key].pattern?.test('auto')).toBe(true);
      expect(AUTO_SCOPE[id]).toBe(AUTO_SCOPE['aws.opensearch_nodes_4']);
    }
  });
});
