import { emptyProgress, MoveRecord } from './move-types';
import { moveView, movePercent } from './move-view';

const rec = (over: Partial<MoveRecord>): MoveRecord => ({
  id: 'm1',
  logicalShard: 3,
  fromDb: 'primary',
  toDb: 'db1',
  state: 'copy',
  status: 'running',
  progress: emptyProgress(),
  plan: null,
  error: null,
  requestedBy: null,
  heartbeatAt: null,
  flippedAt: null,
  leftoverDb: null,
  cleanupAfter: null,
  createdAt: new Date('2026-11-01T00:00:00Z'),
  updatedAt: new Date('2026-11-01T00:00:00Z'),
  ...over,
});

describe('move view', () => {
  it('copy progress follows the copied rows', () => {
    const progress = {
      ...emptyProgress(),
      tables: { a: { cursor: null, copied: 50, done: false } },
    };
    const plan = { totalRows: 100 } as MoveRecord['plan'];
    expect(movePercent(rec({ progress, plan }))).toBe(43);
    expect(movePercent(rec({ state: 'preflight' }))).toBe(2);
  });

  it('later steps have fixed marks and finished moves are 100', () => {
    expect(movePercent(rec({ state: 'catchup' }))).toBe(85);
    expect(movePercent(rec({ state: 'verify' }))).toBe(95);
    expect(movePercent(rec({ status: 'waiting', state: 'cleanup' }))).toBe(100);
    expect(movePercent(rec({ status: 'rolled_back' }))).toBe(0);
  });

  it('serializes dates and keeps raw cursors out', () => {
    const v = moveView(rec({ error: 'boom' }));
    expect(v.createdAt).toBe('2026-11-01T00:00:00.000Z');
    expect(v.error).toBe('boom');
    expect(JSON.stringify(v)).not.toContain('cursor');
  });
});
