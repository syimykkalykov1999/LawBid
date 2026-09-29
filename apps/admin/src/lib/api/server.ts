import 'server-only';
import { cookies } from 'next/headers';

/** httpOnly cookie holding the admin JWT (docs/06 §2.1). */
export const SESSION_COOKIE = 'lawbid_admin';
/** Mirrors the server's absolute session limit (8 h). */
export const SESSION_MAX_AGE_SECONDS = 8 * 3600;

export function apiBaseUrl(): string {
  const url = process.env.API_BASE_URL;
  if (!url) throw new Error('API_BASE_URL is not set (apps/admin/.env.local)');
  return url.replace(/\/$/, '');
}

export async function sessionToken(): Promise<string | null> {
  const jar = await cookies();
  return jar.get(SESSION_COOKIE)?.value ?? null;
}

export function cookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    sameSite: 'strict' as const,
    secure: process.env.COOKIE_SECURE !== 'false',
    path: '/',
    maxAge,
  };
}
