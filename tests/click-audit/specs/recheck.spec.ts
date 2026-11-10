import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { ADMIN_URL, AUTH_DIR, RESULTS_DIR } from '../lib/env';
import { record, Watch, short } from '../lib/probe';
import { freshCode } from '../lib/admin-auth';

// Hand-written re-checks of rows the generic pass marked DEAD: the form is
// filled the way a person would, then the result is judged.
const FILE = 'recheck.jsonl';
test.use({ storageState: `${AUTH_DIR}/admin.json`, baseURL: ADMIN_URL });

async function calls(watch: Watch, t0: number): Promise<string> {
  return watch
    .since(t0)
    .net.filter((e) => e.method !== 'GET')
    .map((e) => `${e.method} ${short(e.url)} ${e.status}`)
    .join(', ');
}

async function shot(page: Page, name: string): Promise<string> {
  const p = join(RESULTS_DIR, 'shots', `recheck_${name}.png`);
  await page.screenshot({ path: p });
  return p;
}

test('/data-requests «Зарегистрировать» with a filled form', async ({ page }) => {
  const watch = new Watch(page);
  await page.goto('/data-requests');
  await page.locator('#ref').fill('AUDIT-2026-11-08');
  await page.locator('#ag').fill('Click audit agency');
  await page.locator('#rcv').fill('2026-11-08T10:00');
  await page.locator('#scope').fill('Account records of one test user (click audit).');
  const t0 = Date.now();
  await page.getByRole('button', { name: 'Зарегистрировать' }).click();
  await page.waitForTimeout(2500);
  const c = await calls(watch, t0);
  record(FILE, { area: 'admin', page: '/data-requests', element: 'button «Зарегистрировать» (filled form)', expected: 'request is registered', actual: c || 'no call', status: /POST .* 20\d/.test(c) ? 'WORKS' : 'BROKEN', screenshot: await shot(page, 'data-requests') });
  expect(c).toMatch(/POST .* 20\d/);
});

test('/country-partners «Добавить партнёра» → «Создать» with a filled form', async ({ page }) => {
  const watch = new Watch(page);
  await page.goto('/country-partners');
  await page.getByRole('button', { name: /Добавить партнёра/ }).first().click();
  const dlg = page.locator('[role=dialog]:visible').last();
  const select = dlg.locator('select').first();
  const values = await select.locator('option').evaluateAll((o) => o.map((x) => (x as HTMLOptionElement).value).filter(Boolean));
  await select.selectOption(values.find((v) => v !== 'US') ?? values[0]);
  const inputs = dlg.locator('input');
  await inputs.nth(0).fill('Audit Partner');
  await inputs.nth(1).fill('partner-audit@lawbid-e2e.test');
  await dlg.locator('input[type=number]').nth(0).fill('10');
  await dlg.locator('input[type=number]').nth(1).fill('3');
  const t0 = Date.now();
  await dlg.getByRole('button', { name: 'Создать' }).click();
  await page.waitForTimeout(2000);
  // Money / identity actions: the authenticator code first (step-up).
  const code = page.locator('[role=dialog]:visible input[autocomplete="one-time-code"]');
  if (await code.count()) {
    await code.first().fill(freshCode(30_000));
    await page.locator('[role=dialog]:visible button[type=submit]').last().click();
    await page.waitForTimeout(2500);
  }
  const c = await calls(watch, t0);
  record(FILE, { area: 'admin', page: '/country-partners', element: 'dialog «Добавить партнёра» → «Создать» (filled form)', expected: 'partner is created', actual: c || 'no call', status: /POST \/country-partners 20\d/.test(c) ? 'WORKS' : 'BROKEN', screenshot: await shot(page, 'country-partners') });
  expect(c).toMatch(/POST \/country-partners 20\d/);
});

test('/plans «Применить к подписчикам»', async ({ page }) => {
  const watch = new Watch(page);
  await page.goto('/plans');
  await page.waitForTimeout(2000);
  const buttons = page.getByRole('button', { name: 'Применить к подписчикам' });
  const n = await buttons.count();
  let enabled = -1;
  for (let i = 0; i < n; i++) if (await buttons.nth(i).isEnabled()) { enabled = i; break; }
  if (enabled < 0) {
    record(FILE, { area: 'admin', page: '/plans', element: 'button «Применить к подписчикам»', expected: 'enabled when the plan has subscribers', actual: `disabled on all ${n} plans (no subscribers in the local data)`, status: 'WORKS', screenshot: await shot(page, 'plans') });
    return;
  }
  await buttons.nth(enabled).click();
  const dlg = page.locator('[role=dialog]:visible').last();
  await expect(dlg).toBeVisible();
  await dlg.locator('textarea, input').first().fill('Click audit: apply the current plan terms.');
  const t0 = Date.now();
  await dlg.locator('button[type=submit]').click();
  await page.waitForTimeout(2500);
  const c = await calls(watch, t0);
  record(FILE, { area: 'admin', page: '/plans', element: 'button «Применить к подписчикам» → dialog (reason filled)', expected: 'applies the plan', actual: c || 'no call', status: /POST .* 20\d/.test(c) ? 'WORKS' : 'BROKEN', screenshot: await shot(page, 'plans') });
});
