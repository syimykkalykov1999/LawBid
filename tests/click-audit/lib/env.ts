import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export const ROOT = join(__dirname, '..');
export const REPO = join(ROOT, '..', '..');
export const AUTH_DIR = join(ROOT, '.auth');
export const RESULTS_DIR = join(ROOT, 'results');

export const ADMIN_URL = process.env.ADMIN_URL ?? 'http://localhost:3311';
export const API_URL = process.env.API_URL ?? 'http://localhost:3310/api/v1';
export const WEB_URL = process.env.WEB_URL ?? 'http://localhost:3312';

/** Local hosts only: the audit clicks every button, never on prod. */
export function assertLocal(url: string): void {
  const host = new URL(url).hostname;
  if (!['localhost', '127.0.0.1', '[::1]'].includes(host) && !host.endsWith('.localhost')) {
    throw new Error(`click audit runs against a LOCAL stack only, got ${url}`);
  }
}
[ADMIN_URL, API_URL, WEB_URL].forEach(assertLocal);

export interface Fixtures {
  admin: { email: string; login: string; password: string };
  client: { phone: string; password: string };
  attorney: { phone: string; password: string };
}

export const fixtures = JSON.parse(
  readFileSync(join(ROOT, 'setup', 'fixtures.json'), 'utf8'),
) as Fixtures;
