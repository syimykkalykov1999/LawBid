import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ANALYTICS_SNAPSHOT_DAYS } from './analytics.service';

/**
 * Round 4 admin check (25.11, С11): every period tab of the admin's
 * «Аналитика» has a daily snapshot. The 14-day tab had none (the job kept
 * 7 / 30 / 90), so it ran the heavy SQL on each open.
 */
describe('analytics snapshots cover the panel tabs', () => {
  it('keeps a snapshot for each tab of analytics-admin.tsx', () => {
    const src = readFileSync(
      join(
        __dirname,
        '../../../../admin/src/components/analytics/analytics-admin.tsx',
      ),
      'utf8',
    );
    const tabs = [...src.matchAll(/\{ value: '(\d+)', label: '\d+ дней' \}/g)]
      .map((m) => Number(m[1]))
      .sort((a, b) => a - b);
    expect(tabs.length).toBeGreaterThan(0);
    expect([...ANALYTICS_SNAPSHOT_DAYS].sort((a, b) => a - b)).toEqual(tabs);
  });
});
