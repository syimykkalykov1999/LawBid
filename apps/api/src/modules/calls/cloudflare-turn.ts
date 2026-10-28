import type { IceServerDto } from './calls.dto';

/** Cloudflare Realtime TURN: one POST gives a short-lived login for the
 * whole Cloudflare relay fleet (UDP 3478/443, TCP 3478/80, TLS 5349/443). */
const ENDPOINT = 'https://rtc.live.cloudflare.com/v1/turn/keys';
/** Default timeout of one credential request (the admin status probe). */
export const CLOUDFLARE_TURN_TIMEOUT_MS = 3_000;
/** Owner 2026-10-26: a call never waits more than this for Cloudflare in
 * total (first try + one quick retry); after it the call goes on our own
 * TURN. */
export const CLOUDFLARE_TURN_BUDGET_MS = 1_500;
/** The first try gets this much of the budget; the retry gets the rest. */
export const CLOUDFLARE_TURN_FIRST_TRY_MS = 1_000;
export const CLOUDFLARE_TURN_RETRY_MS = 100;
/** A retry with less time left than this is skipped. */
export const CLOUDFLARE_TURN_MIN_TRY_MS = 200;
/** The same login is reused for one user this long (the app asks about once
 * per call; a login lives 24 h, so a 30 min reuse leaves it > 23 h). */
export const CLOUDFLARE_TURN_CACHE_MS = 30 * 60_000;
const CACHE_MAX = 5_000;

interface Entry {
  at: number;
  server: IceServerDto;
}
const cache = new Map<string, Entry>();

export function clearCloudflareTurnCache(): void {
  cache.clear();
}

/** Owner 2026-10-26 (failover): a phone says the relay of its call died —
 * its next login is a new one (a revoked key must not live on in the
 * cache). */
export function forgetCloudflareTurn(keyId: string, userId: string): void {
  cache.delete(`${keyId}:${userId}`);
}

/** Port 53 is blocked by browsers and stalls ICE gathering (Cloudflare docs). */
function usable(url: string): boolean {
  return !/:53(\?|$)/.test(url);
}

/**
 * Asks Cloudflare for TURN credentials. Returns the relay entry (urls with
 * their own transport, username, credential) or throws. The API token is
 * only ever sent to Cloudflare; the error messages never contain it.
 */
export async function fetchCloudflareTurn(
  keyId: string,
  apiToken: string,
  ttlSec: number,
  fetchImpl: typeof fetch = fetch,
  timeoutMs = CLOUDFLARE_TURN_TIMEOUT_MS,
): Promise<IceServerDto> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetchImpl(
      `${ENDPOINT}/${encodeURIComponent(keyId)}/credentials/generate-ice-servers`,
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${apiToken}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ ttl: ttlSec }),
        signal: ctrl.signal,
      },
    );
    if (!res.ok) throw new Error(`Cloudflare answered HTTP ${res.status}`);
    const body = (await res.json()) as {
      iceServers?: Array<{
        urls?: string[] | string;
        username?: string;
        credential?: string;
      }>;
    };
    const relay = (body.iceServers ?? []).find(
      (s) => s.username && s.credential,
    );
    const raw = relay?.urls;
    const urls = (Array.isArray(raw) ? raw : raw ? [raw] : []).filter(usable);
    if (!relay || urls.length === 0) {
      throw new Error('Cloudflare returned no TURN servers');
    }
    return {
      urls,
      username: relay.username ?? null,
      credential: relay.credential ?? null,
    };
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError') {
      throw new Error(`Cloudflare did not answer in ${timeoutMs} ms`);
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

/** Cached per user, so logins are never shared between people. */
export async function cloudflareTurnFor(
  userId: string,
  keyId: string,
  apiToken: string,
  ttlSec: number,
  fetchImpl?: typeof fetch,
  now = Date.now(),
  timeoutMs = CLOUDFLARE_TURN_TIMEOUT_MS,
): Promise<IceServerDto> {
  const key = `${keyId}:${userId}`;
  const hit = cache.get(key);
  if (hit && now - hit.at < CLOUDFLARE_TURN_CACHE_MS) return hit.server;
  const server = await fetchCloudflareTurn(
    keyId,
    apiToken,
    ttlSec,
    fetchImpl,
    timeoutMs,
  );
  if (cache.size >= CACHE_MAX) cache.clear();
  cache.set(key, { at: now, server });
  return server;
}
