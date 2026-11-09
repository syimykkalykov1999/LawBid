// Lighthouse CI for the admin (OPEN_ITEMS_SWEEP 2026-11-09 B-c11; @lhci/cli 0.15.1 —
// 0.16.0 is younger than the 7-day npm cooldown (.npmrc min-release-age) —
// Apache-2.0). Three heavy pages against the CI API stand (admin-ci.yml job
// `lighthouse`): the users list, the audit journal, the cases desk. Desktop
// form factor with the CPU slowed 4x (a weak laptop), three runs, median.
// The admin's session is the httpOnly cookie `lawbid_admin` = the admin JWT
// that apps/api/scripts/lhci-admin.ts prints (LHCI_ADMIN_TOKEN).
//
// Budgets (assert): the first run is NON-blocking (continue-on-error in the
// workflow) and only records the numbers; the levels below are "warn" so the
// job stays green while the baseline settles, then flip to "error".
const token = process.env.LHCI_ADMIN_TOKEN ?? '';
const base = process.env.LHCI_ADMIN_URL ?? 'http://localhost:3001';

module.exports = {
  ci: {
    collect: {
      url: [`${base}/users`, `${base}/audit-log`, `${base}/cases`],
      numberOfRuns: 3,
      settings: {
        preset: 'desktop',
        formFactor: 'desktop',
        screenEmulation: { mobile: false, width: 1366, height: 768, deviceScaleFactor: 1, disabled: false },
        throttlingMethod: 'simulate',
        throttling: { cpuSlowdownMultiplier: 4, rttMs: 40, throughputKbps: 10 * 1024 },
        extraHeaders: token ? { Cookie: `lawbid_admin=${token}` } : undefined,
        onlyCategories: ['performance', 'accessibility', 'best-practices'],
        chromeFlags: '--no-sandbox --disable-dev-shm-usage',
      },
    },
    assert: {
      assertions: {
        'categories:performance': ['warn', { minScore: 0.8 }],
        'categories:accessibility': ['warn', { minScore: 0.9 }],
        'largest-contentful-paint': ['warn', { maxNumericValue: 2500 }],
        'total-blocking-time': ['warn', { maxNumericValue: 300 }],
        'cumulative-layout-shift': ['warn', { maxNumericValue: 0.1 }],
        'resource-summary:script:size': ['warn', { maxNumericValue: 600 * 1024 }],
      },
    },
    upload: { target: 'filesystem', outputDir: '.lighthouseci' },
  },
};
