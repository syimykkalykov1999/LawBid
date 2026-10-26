import type { IceServerDto } from './calls.dto';
import {
  CLOUDFLARE_TURN_BUDGET_MS,
  fetchCloudflareTurn,
} from './cloudflare-turn';
import {
  RELAY_STEP_TIMEOUT_MS,
  checkRelay,
  udpTargetOf,
  type RelayCheckResult,
} from './relay-check';

/**
 * FO-2 / CF-6 (calls audit 2026-10-26): the Cloudflare TURN health probe
 * does what a phone does, not only what the credential API says — a short
 * login, then a real STUN Binding + TURN Allocate on the relay it names.
 * A dead data plane behind a live API is seen within a minute instead of
 * never. The relay check itself lives in relay-check.ts (the «Проверить»
 * button uses the same one).
 */

export type RelayCheck = typeof checkRelay;

/** The probe asks for a login that lives only 5 minutes. */
export const RELAY_PROBE_TTL_SEC = 300;

/** STUN Binding + TURN Allocate with [login] on its UDP relay; throws with
 * a short reason (never the login) when either step fails. */
export async function checkRelayLogin(
  login: Pick<IceServerDto, 'urls' | 'username' | 'credential'>,
  check: RelayCheck = checkRelay,
  timeoutMs = RELAY_STEP_TIMEOUT_MS,
): Promise<RelayCheckResult> {
  const target = udpTargetOf(login.urls);
  if (!target) throw new Error('no UDP relay address');
  const r = await check(
    target,
    { username: login.username ?? '', credential: login.credential ?? '' },
    timeoutMs,
  );
  if (!r.stun.ok) {
    throw new Error(`STUN Binding on ${r.target}: ${r.stun.error ?? 'failed'}`);
  }
  if (!r.turn.ok) {
    throw new Error(
      `TURN Allocate on ${r.target}: ${r.turn.error ?? 'failed'}`,
    );
  }
  return r;
}

/** Login (within [loginTimeoutMs]) + [checkRelayLogin]. Throws when
 * Cloudflare gives no login or its relay does not allocate. */
export async function probeCloudflareRelay(
  keyId: string,
  apiToken: string,
  opts: {
    check?: RelayCheck;
    fetchImpl?: typeof fetch;
    loginTimeoutMs?: number;
    stepTimeoutMs?: number;
  } = {},
): Promise<RelayCheckResult> {
  const login = await fetchCloudflareTurn(
    keyId,
    apiToken,
    RELAY_PROBE_TTL_SEC,
    opts.fetchImpl,
    opts.loginTimeoutMs ?? CLOUDFLARE_TURN_BUDGET_MS,
  );
  return checkRelayLogin(login, opts.check, opts.stepTimeoutMs);
}
