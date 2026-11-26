import 'server-only';
import { cookies } from 'next/headers';

/** The pre-prefix cookie name. Read for one release (an admin signed in
 * before the switch stays signed in), replaced on the next proxied call. */
export const LEGACY_SESSION_COOKIE = 'lawbid_admin';

/** True unless local http development turned `Secure` off. */
export function cookieSecure(): boolean {
  return process.env.COOKIE_SECURE !== 'false';
}

/**
 * httpOnly cookie holding the admin JWT (docs/06 §2.1). ASVS 5.0 V3.3.3
 * (STAGE2_SECURITY #1): `__Host-` = Secure, `Path=/`, no `Domain`, so no
 * other host under lawbid.dev and no http page can set or shadow it. The
 * browser refuses a prefixed cookie without `Secure`, so plain-http local
 * development keeps the bare name.
 */
export const SESSION_COOKIE = cookieSecure()
  ? '__Host-lawbid_admin'
  : LEGACY_SESSION_COOKIE;
/** Mirrors the server's absolute session limit (8 h). */
export const SESSION_MAX_AGE_SECONDS = 8 * 3600;

export function apiBaseUrl(): string {
  const url = process.env.API_BASE_URL;
  if (!url) throw new Error('API_BASE_URL is not set (apps/admin/.env.local)');
  return url.replace(/\/$/, '');
}

export async function sessionToken(): Promise<string | null> {
  return (await sessionCookie())?.token ?? null;
}

/** The admin JWT and whether it still sits under the legacy name. */
export async function sessionCookie(): Promise<{ token: string; legacy: boolean } | null> {
  const jar = await cookies();
  const current = jar.get(SESSION_COOKIE)?.value;
  if (current) return { token: current, legacy: false };
  if (SESSION_COOKIE === LEGACY_SESSION_COOKIE) return null;
  const old = jar.get(LEGACY_SESSION_COOKIE)?.value;
  return old ? { token: old, legacy: true } : null;
}

export function cookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    sameSite: 'strict' as const,
    secure: cookieSecure(),
    path: '/',
    maxAge,
  };
}
