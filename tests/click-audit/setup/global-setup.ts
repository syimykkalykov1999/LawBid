import { existsSync, mkdirSync } from 'node:fs';
import { chromium } from '@playwright/test';
import { ADMIN_URL, AUTH_DIR, RESULTS_DIR } from '../lib/env';
import { adminLogin } from '../lib/admin-auth';

/**
 * Signs the owner admin in through the real login screen — once: a later
 * run (the route groups of run-admin-chunks.sh) reuses the saved session
 * while it is alive, so the admin sign-in limit (a few per hour) is not
 * spent on every group.
 */
export default async function globalSetup(): Promise<void> {
  mkdirSync(AUTH_DIR, { recursive: true });
  mkdirSync(RESULTS_DIR, { recursive: true });
  if (process.env.SKIP_ADMIN === '1') return;
  const state = `${AUTH_DIR}/admin.json`;
  const browser = await chromium.launch({ channel: process.env.PW_CHANNEL ?? 'chrome' });
  try {
    if (existsSync(state)) {
      const ctx = await browser.newContext({ baseURL: ADMIN_URL, locale: 'ru-RU', storageState: state });
      const page = await ctx.newPage();
      await page.goto('/');
      await page.waitForTimeout(1500);
      const alive = !new URL(page.url()).pathname.startsWith('/login');
      await ctx.close();
      if (alive) return;
    }
    const context = await browser.newContext({ baseURL: ADMIN_URL, locale: 'ru-RU' });
    const page = await context.newPage();
    await adminLogin(page);
    await context.storageState({ path: state });
  } finally {
    await browser.close();
  }
  if (!existsSync(state)) throw new Error('admin sign-in failed');
}
