import { describe, expect, it } from 'vitest';
import {
  activeMoves,
  canRollback,
  etaWord,
  readinessChecks,
  stateWord,
  statusWord,
  summarize,
} from './shard-split';

describe('shard split wording', () => {
  it('words every step of the move', () => {
    for (const s of ['preflight', 'copy', 'catchup', 'freeze', 'verify', 'flip', 'cleanup', 'done']) {
      expect(stateWord(s)).not.toBe(s);
    }
    expect(statusWord({ status: 'waiting', state: 'cleanup' })).toContain('7 дней');
    expect(statusWord({ status: 'failed', state: 'copy' })).toContain('ошибки');
    expect(statusWord({ status: 'running', state: 'verify' })).toContain('Сверка');
  });

  it('words the estimate', () => {
    expect(etaWord(20)).toBe('меньше минуты');
    expect(etaWord(600)).toBe('около 10 мин');
    expect(etaWord(7800)).toBe('около 2 ч 10 мин');
    expect(etaWord(7200)).toBe('около 2 ч');
  });

  it('lists the readiness checks', () => {
    const checks = readinessChecks({
      toDb: 'db1',
      configured: true,
      reachable: true,
      migrationsApplied: false,
      missingMigrations: 3,
      crossFamilyFksLeft: 0,
      ok: false,
      problems: [],
    });
    expect(checks.map(([, ok]) => ok)).toEqual([true, true, false]);
    expect(checks[2][0]).toContain('3');
  });

  it('offers rollback until the old rows are gone', () => {
    expect(canRollback({ status: 'running' })).toBe(true);
    expect(canRollback({ status: 'waiting' })).toBe(true);
    expect(canRollback({ status: 'done' })).toBe(false);
    expect(canRollback({ status: 'rolled_back' })).toBe(false);
  });

  it('summarizes a batch', () => {
    const rows = [
      { status: 'waiting', percent: 100 },
      { status: 'running', percent: 40 },
      { status: 'failed', percent: 10 },
    ];
    expect(summarize(rows)).toEqual({ total: 3, finished: 1, failed: 1, percent: 50 });
    expect(activeMoves([...rows, { status: 'done', percent: 100 }])).toHaveLength(3);
  });
});
