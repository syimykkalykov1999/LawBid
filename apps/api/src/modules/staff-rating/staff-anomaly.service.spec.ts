import { detectAnomalies } from './staff-anomaly.service';
import type { DailyRow } from './staff-daily-stats.service';
import type { DayCounters } from './staff-counters.service';

const row = (id: string, o: Partial<DailyRow> = {}): DailyRow => ({
  adminId: id,
  day: '2026-10-26',
  workspace: 'mass',
  role: 'verifier',
  decided: 40,
  avgHandleSec: 60,
  p90HandleSec: 120,
  reopened: 0,
  complaints: 0,
  csatUp: 0,
  csatDown: 0,
  sampled: 0,
  sampleDiff: 0,
  goldenTotal: 0,
  goldenFail: 0,
  tooFast: 0,
  lateSla: 0,
  leaseLost: 0,
  skips: 0,
  ...o,
});

const counters = (id: string, o: Partial<DayCounters> = {}): DayCounters => ({
  adminId: id,
  day: '2026-10-26',
  decided: 40,
  handleMsSum: 0,
  handleN: 0,
  buckets: [],
  hours: Array(24)
    .fill(0)
    .map((_, h) => (h === 12 ? 40 : 0)),
  outcomes: { approve: 20, reject: 20 },
  ...o,
});

const group = Array.from(
  { length: 6 },
  (_, i) => `00000000-0000-4000-8000-00000000000${i}`,
);

describe('detectAnomalies (against the group median, not a model)', () => {
  const normal = group.slice(1).map((id) => row(id));
  const normalCounters = group.slice(1).map((id) => counters(id));

  it('quiet group: nothing', () => {
    expect(detectAnomalies(normal, normalCounters, new Map(), 20)).toEqual([]);
  });

  it('too fast: under 20% of the group median', () => {
    const fast = row(group[0], { avgHandleSec: 8 });
    const found = detectAnomalies(
      [fast, ...normal],
      normalCounters,
      new Map(),
      20,
    );
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ adminId: group[0], rule: 'too_fast' });
    // 12 s is the 20% line; exactly on it is not too fast.
    const edge = row(group[0], { avgHandleSec: 12 });
    expect(
      detectAnomalies([edge, ...normal], normalCounters, new Map(), 20),
    ).toEqual([]);
  });

  it('identical answers, and «rushing» when fast AND identical', () => {
    const same = counters(group[0], { outcomes: { approve: 40 } });
    const a = detectAnomalies(
      [row(group[0]), ...normal],
      [same, ...normalCounters],
      new Map(),
      20,
    );
    expect(a.map((x) => x.rule)).toEqual(['identical_answers']);
    const b = detectAnomalies(
      [row(group[0], { avgHandleSec: 5 }), ...normal],
      [same, ...normalCounters],
      new Map(),
      20,
    );
    expect(b.map((x) => x.rule).sort()).toEqual([
      'identical_answers',
      'rushing',
      'too_fast',
    ]);
  });

  it('night access: most of the work in the small hours, far above the group', () => {
    const night = counters(group[0], {
      hours: Array(24)
        .fill(0)
        .map((_, h) => (h === 3 ? 40 : 0)),
    });
    const found = detectAnomalies(
      [row(group[0]), ...normal],
      [night, ...normalCounters],
      new Map(),
      20,
    );
    expect(found.map((x) => x.rule)).toEqual(['night_access']);
  });

  it('bulk views: many cards taken, few decided, far above the group', () => {
    const found = detectAnomalies(
      [row(group[0], { decided: 3 }), ...normal],
      normalCounters,
      new Map([
        [group[0], 120],
        ...group.slice(1).map((g) => [g, 40] as [string, number]),
      ]),
      20,
    );
    expect(found.map((x) => x.rule)).toContain('bulk_views');
    // taking as many as everybody else is normal
    expect(
      detectAnomalies(
        normal,
        normalCounters,
        new Map(group.map((g) => [g, 40])),
        20,
      ),
    ).toEqual([]);
  });

  it('the owner workspace is not judged, and the list is worst first', () => {
    const owner = row(group[0], { workspace: 'owner', avgHandleSec: 1 });
    expect(
      detectAnomalies([owner, ...normal], normalCounters, new Map(), 20),
    ).toEqual([]);
    const f1 = row(group[0], { avgHandleSec: 11 });
    const f2 = row(group[5], { avgHandleSec: 2 });
    const found = detectAnomalies(
      [f1, f2, ...normal.slice(0, 4)],
      [],
      new Map(),
      20,
    );
    expect(found.map((x) => x.adminId)).toEqual([group[5], group[0]]);
  });
});
