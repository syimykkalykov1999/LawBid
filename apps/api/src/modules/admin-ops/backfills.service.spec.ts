import { toBackfillDto } from './backfills.service';
import type { BackfillRow } from '../../common/backfill/backfill.types';

const row = (over: Partial<BackfillRow> = {}): BackfillRow => ({
  name: 'b1',
  status: 'running',
  table_name: 'cases',
  cursor: '10',
  processed: 250,
  total_estimate: 1000,
  batch_size: 100,
  max_rows_per_sec: 500,
  pause_reason: null,
  last_error: null,
  started_at: new Date('2026-11-01T10:00:00Z'),
  updated_at: new Date('2026-11-01T10:01:00Z'),
  heartbeat_at: new Date('2026-11-01T10:01:00Z'),
  finished_at: null,
  ...over,
});

describe('toBackfillDto', () => {
  const now = Date.parse('2026-11-01T10:01:30Z');

  it('shows percent from the planner estimate, never 100 before it is done', () => {
    expect(toBackfillDto(row(), now).percent).toBe(25);
    expect(toBackfillDto(row({ processed: 5000 }), now).percent).toBe(99);
    expect(toBackfillDto(row({ status: 'done' }), now).percent).toBe(100);
    expect(
      toBackfillDto(row({ total_estimate: null }), now).percent,
    ).toBeNull();
  });

  it('running without a heartbeat for 2 minutes is stalled; paused is not', () => {
    const later = Date.parse('2026-11-01T10:05:00Z');
    expect(toBackfillDto(row(), now).stalled).toBe(false);
    expect(toBackfillDto(row(), later).stalled).toBe(true);
    expect(toBackfillDto(row({ status: 'paused' }), later).stalled).toBe(false);
  });
});
