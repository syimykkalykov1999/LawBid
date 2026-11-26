// CPU slowdown for the admin Lighthouse job, calibrated to the runner
// (KNOWN_ERRORS 260, 261). Lighthouse docs/throttling.md «Calibrating the CPU
// slowdown»: CPU throttling is relative to the host, so read the host's
// `benchmarkIndex` first and pick `cpuSlowdownMultiplier` from it.
//
// Target: the device the 300 ms budget was set on, x4 on a benchmarkIndex
// 2950 runner (the median runner, the «green runner» of KNOWN_ERRORS 211/224).
//
// Which multiplier gives that device on a runner is MEASURED, not taken from
// the docs' calculator: on GitHub's runners the calculator curve (#1358)
// overshot by ~24 % at benchmarkIndex 4000+ (BI 4251 → x6.2 → TBT ~290 on
// PR #1319), because benchmarkIndex overstates the fast runners' real speed.
// The table below is the fit of 3662 Lighthouse reports from 160 admin-ci jobs
// (18.11–26.11, cold first run of each page dropped): per report, unthrottled
// main-thread work = mainthread-work-breakdown / multiplier, normalised per
// page by its median on 2850–3050 runners; per 100-BI bin, the multiplier that
// gives the reference work = 4 / median(work); then a weighted isotonic
// (non-decreasing) fit. Weighted RMS residual 2.0 % (power law 6.3 %, the
// calculator curve 12.2 %). Refit: scripts/ci/lighthouse-cpu-fit.py.
// Between knots the value is linear; outside them it is clamped and the job
// summary warns (`inRange` false). The TBT budget (300 ms) is unchanged.
const KNOTS = [
  [2250, 3.3],
  [2550, 3.3],
  [2650, 3.4],
  [2750, 3.52],
  [2850, 3.95],
  [2950, 4.0],
  [3050, 4.03],
  [3150, 4.2],
  [3250, 4.49],
  [3350, 4.55],
  [4050, 4.55],
  [4150, 4.56],
  [4250, 4.65],
  [4350, 4.69],
  [4450, 4.88],
];

const REFERENCE_BENCHMARK_INDEX = 2950;
const REFERENCE_MULTIPLIER = 4;
const FIT_RANGE = [2200, 4500]; // BI range the fit has data for (bins of >= 15 reports)

/** Whether this benchmarkIndex lies inside the range the table was fitted on. */
function inRange(benchmarkIndex) {
  const bi = Number(benchmarkIndex);
  return Number.isFinite(bi) && bi >= FIT_RANGE[0] && bi < FIT_RANGE[1];
}

/** cpuSlowdownMultiplier for a runner with this benchmarkIndex (two decimals). */
function cpuSlowdownMultiplier(benchmarkIndex) {
  const bi = Number(benchmarkIndex);
  if (!Number.isFinite(bi) || bi <= 0) {
    throw new Error(`benchmarkIndex ${benchmarkIndex}: not a measured runner`);
  }
  let m;
  if (bi <= KNOTS[0][0]) m = KNOTS[0][1];
  else if (bi >= KNOTS[KNOTS.length - 1][0]) m = KNOTS[KNOTS.length - 1][1];
  else {
    const i = KNOTS.findIndex(([x]) => x >= bi);
    const [x0, y0] = KNOTS[i - 1];
    const [x1, y1] = KNOTS[i];
    m = y0 + ((y1 - y0) * (bi - x0)) / (x1 - x0);
  }
  return Math.round(m * 100) / 100;
}

/** Median of the numbers (benchmarkIndex of the calibration runs). */
function median(values) {
  const xs = values.map(Number).filter(Number.isFinite).sort((a, b) => a - b);
  if (xs.length === 0) return NaN;
  const mid = Math.floor(xs.length / 2);
  return xs.length % 2 ? xs[mid] : (xs[mid - 1] + xs[mid]) / 2;
}

module.exports = {
  KNOTS,
  FIT_RANGE,
  inRange,
  cpuSlowdownMultiplier,
  median,
  REFERENCE_BENCHMARK_INDEX,
  REFERENCE_MULTIPLIER,
};

// CLI: `node lighthouse-cpu.cjs lhr1.json lhr2.json …` prints
// `<median benchmarkIndex> <multiplier> <in|out>` (the calibration step in admin-ci.yml).
if (require.main === module) {
  const fs = process.getBuiltinModule('node:fs');
  const files = process.argv.slice(2);
  const bis = files.map((f) => JSON.parse(fs.readFileSync(f, 'utf8')).environment?.benchmarkIndex);
  const bi = median(bis);
  if (!Number.isFinite(bi)) {
    console.error(`no benchmarkIndex in ${files.join(', ') || '(no files)'}`);
    process.exit(1);
  }
  console.log(`${Math.round(bi)} ${cpuSlowdownMultiplier(bi)} ${inRange(bi) ? 'in' : 'out'}`);
}
