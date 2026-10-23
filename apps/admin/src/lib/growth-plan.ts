import { readFile } from 'node:fs/promises';
import path from 'node:path';

/** Where the owner-editable text lives (apps/admin/content). In the
 * standalone image the server runs from apps/admin, and next.config.ts
 * traces this folder into the bundle. */
export const GROWTH_PLAN_FILE = 'growth-plan.ru.md';

export async function loadGrowthPlan(): Promise<string> {
  return readFile(path.join(process.cwd(), 'content', GROWTH_PLAN_FILE), 'utf8');
}

/**
 * Server-side owner check for «План роста»: asks the API who this session
 * is (the API verifies signature, Redis session and role) and lets only
 * the super admin through. Any failure (no token, API down, other role)
 * answers false, so the page is closed by default.
 */
export async function isOwnerSession(
  token: string | null,
  apiBase: string,
  fetchImpl: typeof fetch = fetch,
): Promise<boolean> {
  if (!token) return false;
  try {
    const res = await fetchImpl(`${apiBase}/admin/auth/me`, {
      headers: { authorization: `Bearer ${token}`, accept: 'application/json' },
      cache: 'no-store',
      redirect: 'manual',
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return false;
    const body = (await res.json()) as { data?: { role?: string } };
    return body?.data?.role === 'super_admin';
  } catch {
    return false;
  }
}
