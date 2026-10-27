import { describe, expect, it } from 'vitest';
import { backfillButtons, backfillLine, backfillNote, backfillStatus, type Backfill } from './backfills';

const base: Backfill = {
  name: '2026-11-cases-total-cents',
  status: 'running',
  tableName: 'cases',
  processed: 12000,
  totalEstimate: 48000,
  percent: 25,
  batchSize: 1000,
  maxRowsPerSec: 2000,
  pauseReason: null,
  lastError: null,
  stalled: false,
  startedAt: '2026-11-01T10:00:00Z',
  updatedAt: '2026-11-01T10:05:00Z',
};

describe('backfill card words', () => {
  it('running → Идёт with pause and stop', () => {
    expect(backfillStatus(base)).toEqual({ label: 'Идёт', tone: 'success' });
    expect(backfillButtons(base)).toEqual(['pause', 'abort']);
    expect(backfillNote(base)).toBeNull();
  });

  it('running but the database is busy → waits, with the reason', () => {
    const b = { ...base, pauseReason: 'waiting: replica lag 25s' };
    expect(backfillStatus(b).label).toBe('Ждёт базу');
    expect(backfillNote(b)).toContain('replica lag 25s');
  });

  it('no heartbeat → red, tells to run the command again', () => {
    const b = { ...base, stalled: true };
    expect(backfillStatus(b)).toEqual({ label: 'Не отвечает', tone: 'danger' });
    expect(backfillNote(b)).toContain('Запустите команду снова');
  });

  it('paused → resume and stop; done/aborted → no buttons', () => {
    expect(backfillButtons({ ...base, status: 'paused' })).toEqual(['resume', 'abort']);
    expect(backfillButtons({ ...base, status: 'done' })).toEqual([]);
    expect(backfillButtons({ ...base, status: 'aborted' })).toEqual([]);
  });

  it('failed shows the error', () => {
    const b = { ...base, status: 'failed' as const, lastError: 'deadlock detected' };
    expect(backfillStatus(b).tone).toBe('danger');
    expect(backfillNote(b)).toContain('deadlock detected');
  });

  it('progress line handles an unknown total', () => {
    expect(backfillLine({ ...base, totalEstimate: null, percent: null })).not.toContain('из ~');
    expect(backfillLine(base)).toContain('(25%)');
  });
});
