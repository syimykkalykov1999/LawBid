import {
  BOARD_ETAG_BUCKET_MS,
  boardEtag,
  etagMatches,
  notModified,
} from './cheap-etag';

/** Two rebuilds of the same system-health board (shape of SystemHealthDto). */
const health = (at: string, latencyMs: number, status = 'green') => ({
  overall: status,
  generatedAt: at,
  items: [
    {
      key: 'api',
      status: 'green',
      detail: {
        uptimeSec: latencyMs * 7,
        memoryMb: 180 + latencyMs,
        version: 'abc',
      },
    },
    { key: 'database', status, detail: { latencyMs, slowMs: 500 } },
    {
      key: 'queues',
      status: 'green',
      detail: { waiting: 0, failed: 0, oldestSec: latencyMs, dlq: 0 },
    },
  ],
  incidents: [],
});

/** A cost-registry row: every rebuild stamps status.checkedAt. */
const registry = (at: string, state = 'on') => ({
  generatedAt: at,
  spendRefreshedAt: '2026-11-12T06:00:00.000Z',
  rows: [
    {
      id: 'aws.rds',
      state,
      priceCheckedAt: '2026-10-01',
      status: { state, live: 'active', reason: 'ok', checkedAt: at },
    },
  ],
});

const T = Date.parse('2026-11-12T18:00:10.000Z');

describe('boardEtag (12.11: admin boards answered 200 on every poll)', () => {
  it('ignores the check time and raw measurements', () => {
    const a = boardEtag(health('2026-11-12T18:00:00.000Z', 12), T);
    const b = boardEtag(health('2026-11-12T18:00:45.000Z', 31), T);
    expect(a).toBe(b);
    expect(a).toMatch(/^W\/"s-[A-Za-z0-9_-]+-\d+"$/);
    expect(boardEtag(registry('2026-11-12T18:00:00.000Z'), T)).toBe(
      boardEtag(registry('2026-11-12T18:00:59.000Z'), T),
    );
  });

  it('changes when a light or a state changes', () => {
    const at = '2026-11-12T18:00:00.000Z';
    expect(boardEtag(health(at, 12), T)).not.toBe(
      boardEtag(health(at, 12, 'yellow'), T),
    );
    expect(boardEtag(registry(at), T)).not.toBe(
      boardEtag(registry(at, 'off'), T),
    );
    // A real count is not volatile.
    const h = health(at, 12);
    const h2 = health(at, 12);
    (h2.items[2].detail as { waiting: number }).waiting = 3;
    expect(boardEtag(h, T)).not.toBe(boardEtag(h2, T));
  });

  it('does not depend on key order', () => {
    expect(boardEtag({ a: 1, b: { c: 2, d: 3 } }, T)).toBe(
      boardEtag({ b: { d: 3, c: 2 }, a: 1 }, T),
    );
  });

  it('moves with the time bucket, so a skipped measurement is ≤ 5 min old', () => {
    const body = health('2026-11-12T18:00:00.000Z', 12);
    expect(boardEtag(body, T)).not.toBe(
      boardEtag(body, T + BOARD_ETAG_BUCKET_MS),
    );
  });

  it('turns a matching If-None-Match into a 304', () => {
    const tag = boardEtag(health('2026-11-12T18:00:00.000Z', 12), T);
    const res = { setHeader: jest.fn(), status: jest.fn() };
    const again = boardEtag(health('2026-11-12T18:00:30.000Z', 40), T);
    expect(etagMatches(tag, again)).toBe(true);
    expect(notModified({ headers: { 'if-none-match': tag } }, res, again)).toBe(
      true,
    );
    expect(res.status).toHaveBeenCalledWith(304);
  });
});
