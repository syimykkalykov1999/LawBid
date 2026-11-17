import { AUTO_SCOPE, autoWants, type AutoSignals } from './infra-auto.logic';

/**
 * Owner 15.11 («может быть случай, что авто не нужен пока и мне нужно
 * выключить и вдруг кнопка выкл не работает»): for EVERY cloud row «Авто»
 * may drive, «Выкл» must hold it off under the strongest signals, «Вкл» must
 * hold it on with no signal at all, and «Вкл» on a row that is off must ask
 * for it to come on. One table over AUTO_SCOPE, so a new row is covered too.
 */
const ROWS = Object.keys(AUTO_SCOPE);

/** Every signal «Авто» reacts to, all at once. */
const loud = {
  pressures: ['db_cpu', 'db_connections', 'redis_memory', 'replica_cpu'],
  budgetRatio: null,
  searchEngine: 'opensearch',
  people: Number.MAX_SAFE_INTEGER,
  searchOnPeople: 1,
  poolSmall: true,
  poolerLive: true,
  replicaReadsForced: true,
  eventsStreamWanted: true,
  eventsStreamInUse: true,
  partitionNeedsRunner: true,
  autoscaleCodeMain: 'a1',
  autoscaleCodeApplied: 'b2',
  maxServers: 16,
  maxSearchNodes: 10,
} as unknown as AutoSignals;

/** No signal at all. */
const calm = {
  pressures: [],
  budgetRatio: null,
  searchEngine: 'postgres',
  people: 0,
  searchOnPeople: Number.MAX_SAFE_INTEGER,
  partitionNeedsRunner: false,
  maxServers: 16,
  maxSearchNodes: 10,
} as unknown as AutoSignals;

describe('«Вкл» / «Выкл» hold every cloud row against «Авто»', () => {
  it('covers every row «Авто» may drive', () => {
    expect(ROWS.length).toBeGreaterThanOrEqual(20);
  });

  it.each(ROWS)('«Выкл» keeps %s off under every signal', (id) => {
    const wants = autoWants(
      { ...loud, modes: { [id]: 'off' } },
      // everything below it is on, the row itself is off
      (x) => (x === id ? 'off' : 'on'),
      new Set(),
    );
    expect(wants.filter((w) => w.id === id && w.to === 'on')).toEqual([]);
  });

  it.each(ROWS)('«Вкл» keeps %s on with no signal at all', (id) => {
    const wants = autoWants(
      { ...calm, modes: { [id]: 'on' }, pickedAuto: new Set([id]) },
      // the row and everything around it is on; «Авто» switched it on
      () => 'on',
      new Set([id]),
    );
    expect(wants.filter((w) => w.id === id && w.to === 'off')).toEqual([]);
  });

  it.each(ROWS)('«Вкл» on %s while it is off asks for it to come on', (id) => {
    const wants = autoWants(
      { ...calm, modes: { [id]: 'on' } },
      (x) => (x === id ? 'off' : 'on'),
      new Set(),
    );
    expect(wants.filter((w) => w.id === id && w.to === 'on')).toHaveLength(1);
  });
});
