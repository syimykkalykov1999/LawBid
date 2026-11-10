import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import type { Page } from '@playwright/test';
// The API's own RFC 6238 code (node:crypto only), reused as is.
import { totpCode } from '../../../apps/api/src/modules/admin-auth/totp.util';
import { AUTH_DIR, fixtures } from './env';

const SECRET_FILE = `${AUTH_DIR}/admin-totp.json`;

export function savedSecret(): string | null {
  if (!existsSync(SECRET_FILE)) return null;
  return (JSON.parse(readFileSync(SECRET_FILE, 'utf8')) as { secret: string }).secret;
}

/** A code for the next 30-second step (the current one may be spent). */
export function freshCode(shiftMs = 0): string {
  const secret = savedSecret();
  if (!secret) throw new Error('no admin TOTP secret yet');
  return totpCode(secret, Date.now() + shiftMs);
}

/**
 * The real admin sign-in: login + password, then either the first-time
 * authenticator setup (secret read from the setup response and kept in
 * .auth/) or the 6-digit code.
 */
export async function adminLogin(page: Page): Promise<void> {
  await page.goto('/login');
  await page.locator('#login').fill(fixtures.admin.login);
  await page.locator('#password').fill(fixtures.admin.password);
  const setupResp = page
    .waitForResponse((r) => r.url().includes('totp-setup') && r.request().method() === 'POST', { timeout: 15_000 })
    .catch(() => null);
  await page.locator('form button[type=submit]').click();
  const setupInput = page.locator('#setup-code');
  const codeInput = page.locator('input[autocomplete="one-time-code"]').first();
  await codeInput.waitFor({ timeout: 20_000 });
  if (await setupInput.count()) {
    const resp = await setupResp;
    if (!resp) throw new Error('admin login: no totp-setup response');
    const body = (await resp.json()) as { data: { secret: string } };
    writeFileSync(SECRET_FILE, JSON.stringify({ secret: body.data.secret }));
    await setupInput.fill(totpCode(body.data.secret));
    await page.locator('form button[type=submit]').click();
    // Recovery codes screen → continue.
    const done = page.getByRole('button', { name: /Продолжить|Готово|Я сохранил|Дальше|Войти/i }).first();
    await done.waitFor({ timeout: 20_000 });
    await done.click();
  } else {
    // A code may be used once per 30-second step: take the next one.
    await codeInput.fill(freshCode(30_000));
    await page.locator('form button[type=submit]').click();
  }
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 30_000 });
}
