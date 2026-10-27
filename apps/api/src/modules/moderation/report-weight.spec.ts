import {
  accuracyFactor,
  computeReportWeights,
  type ReporterFacts,
  type WeightConfig,
} from './report-weight';

const NOW = new Date('2026-10-27T12:00:00Z');
const DAY = 24 * 3600 * 1000;

const CFG: WeightConfig = {
  newAccountDays: 7,
  newAccount: 0.2,
  unverifiedContact: 0.5,
  verifiedReporter: 1.5,
  accuracyMinReports: 3,
  clusterBySource: true,
  burstWindowHours: 24,
  burstMinAccounts: 3,
  burst: 0.2,
};

let n = 0;
const reporter = (over: Partial<ReporterFacts> = {}): ReporterFacts => {
  n++;
  return {
    id: `r${n}`,
    createdAt: new Date(NOW.getTime() - (60 + n * 10) * DAY),
    contactVerified: true,
    verifiedAttorney: false,
    upheld: 0,
    rejected: 0,
    paused: false,
    sources: [`ip:10.0.0.${n}`, `dev:d${n}`],
    ...over,
  };
};

describe('computeReportWeights', () => {
  it('three established independent people weigh 3', () => {
    const rs = [reporter(), reporter(), reporter()];
    expect(computeReportWeights(rs, [], NOW, CFG).total).toBe(3);
  });

  it('three fresh sock-puppet accounts weigh a small fraction of the threshold', () => {
    const born = new Date(NOW.getTime() - 3600 * 1000);
    const rs = [1, 2, 3].map(() =>
      reporter({ createdAt: born, contactVerified: false }),
    );
    const r = computeReportWeights(rs, [], NOW, CFG);
    // 0.2 (new) * 0.5 (no contact) * 0.2 (burst) = 0.02 each
    expect(r.total).toBeLessThan(0.2);
  });

  it('old accounts on one device or network count once', () => {
    const rs = [
      reporter({ sources: ['ip:1.1.1.1', 'dev:a'] }),
      reporter({ sources: ['ip:1.1.1.1', 'dev:b'] }),
      reporter({ sources: ['ip:2.2.2.2', 'dev:b'] }),
    ];
    expect(computeReportWeights(rs, [], NOW, CFG).total).toBe(1);
  });

  it("a report from the author's own device counts for nothing", () => {
    const rs = [reporter({ sources: ['dev:mine'] })];
    const r = computeReportWeights(rs, ['dev:mine'], NOW, CFG);
    expect(r.total).toBe(0);
  });

  it("the author's network halves a report", () => {
    const rs = [reporter({ sources: ['ip:9.9.9.9'] })];
    expect(computeReportWeights(rs, ['ip:9.9.9.9'], NOW, CFG).total).toBe(0.5);
  });

  it('a paused reporter weighs nothing', () => {
    expect(
      computeReportWeights([reporter({ paused: true })], [], NOW, CFG).total,
    ).toBe(0);
  });

  it('a reporter whose reports were mostly dismissed weighs little, an accurate one more', () => {
    const bad = computeReportWeights(
      [reporter({ upheld: 0, rejected: 20 })],
      [],
      NOW,
      CFG,
    ).total;
    const good = computeReportWeights(
      [reporter({ upheld: 20, rejected: 0 })],
      [],
      NOW,
      CFG,
    ).total;
    expect(bad).toBeLessThan(0.2);
    expect(good).toBeGreaterThan(1.2);
  });

  it('accuracy is ignored under the minimum sample', () => {
    expect(
      computeReportWeights([reporter({ rejected: 2 })], [], NOW, CFG).total,
    ).toBe(1);
  });

  it('a verified attorney reporter weighs more, never above the cap', () => {
    const r = computeReportWeights(
      [reporter({ verifiedAttorney: true, upheld: 30 })],
      [],
      NOW,
      CFG,
    );
    expect(r.total).toBe(1.5);
  });

  it('accuracyFactor is neutral without history', () => {
    expect(accuracyFactor(0, 0)).toBe(1);
  });

  it('with clustering off, shared sources still count separately', () => {
    const rs = [
      reporter({ sources: ['ip:1.1.1.1'] }),
      reporter({ sources: ['ip:1.1.1.1'] }),
    ];
    expect(
      computeReportWeights(rs, [], NOW, { ...CFG, clusterBySource: false })
        .total,
    ).toBe(2);
  });
});
