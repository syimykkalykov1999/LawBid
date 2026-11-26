// CPU slowdown for the admin Lighthouse job, calibrated to the runner
// (KNOWN_ERRORS 260). Lighthouse docs/throttling.md «Calibrating the CPU
// slowdown»: CPU throttling is relative to the host, so read the host's
// `benchmarkIndex` and pick `cpuSlowdownMultiplier` from it with the
// calculator the docs link (https://lighthouse-cpu-throttling-calculator.vercel.app/,
// source patrickhulce/lighthouse-cpu-throttling-calculator, no licence file:
// the numbers are taken, the lines are ours).
//
// The calculator targets Lighthouse's own reference device. Our target is the
// device the x4 budget was set on: x4 on the median GitHub runner of the
// budget's history (benchmarkIndex 2950: the median of 26 jobs 09.11–26.11,
// the «green runner» of KNOWN_ERRORS 211/224). So the multiplier is the
// calculator's value for this runner scaled so that a 2950 runner gets
// exactly 4: a slower runner gets less, a faster one more, and every run
// emulates the same weak-laptop CPU. The TBT budget (300 ms) is unchanged.

/** The calculator's best estimate (its `multiplier`), or null when the host is too slow. */
function calculatorMultiplier(benchmarkIndex) {
  const bi = Number(benchmarkIndex);
  if (!Number.isFinite(bi)) return null;
  if (bi >= 1300) return 3 + (bi - 1300) / 233;
  if (bi >= 800) return 2 + (bi - 800) / 500;
  if (bi >= 150) return 1 + (bi - 150) / 650;
  return null; // «This device is too slow to accurately emulate the target Lighthouse device.»
}

const REFERENCE_BENCHMARK_INDEX = 2950;
const REFERENCE_MULTIPLIER = 4;

/** cpuSlowdownMultiplier for a runner with this benchmarkIndex (one decimal, as the calculator prints it). */
function cpuSlowdownMultiplier(benchmarkIndex) {
  const here = calculatorMultiplier(benchmarkIndex);
  if (here == null) {
    throw new Error(`benchmarkIndex ${benchmarkIndex}: the runner is too slow to emulate the target device`);
  }
  const m = (REFERENCE_MULTIPLIER * here) / calculatorMultiplier(REFERENCE_BENCHMARK_INDEX);
  return Math.round(m * 10) / 10;
}

/** Median of the numbers (benchmarkIndex of the calibration runs). */
function median(values) {
  const xs = values.map(Number).filter(Number.isFinite).sort((a, b) => a - b);
  if (xs.length === 0) return NaN;
  const mid = Math.floor(xs.length / 2);
  return xs.length % 2 ? xs[mid] : (xs[mid - 1] + xs[mid]) / 2;
}

module.exports = {
  calculatorMultiplier,
  cpuSlowdownMultiplier,
  median,
  REFERENCE_BENCHMARK_INDEX,
  REFERENCE_MULTIPLIER,
};

// CLI: `node lighthouse-cpu.cjs lhr1.json lhr2.json …` prints
// `<median benchmarkIndex> <multiplier>` (the calibration step in admin-ci.yml).
if (require.main === module) {
  const fs = process.getBuiltinModule('node:fs');
  const files = process.argv.slice(2);
  const bis = files.map((f) => JSON.parse(fs.readFileSync(f, 'utf8')).environment?.benchmarkIndex);
  const bi = median(bis);
  if (!Number.isFinite(bi)) {
    console.error(`no benchmarkIndex in ${files.join(', ') || '(no files)'}`);
    process.exit(1);
  }
  console.log(`${Math.round(bi)} ${cpuSlowdownMultiplier(bi)}`);
}
