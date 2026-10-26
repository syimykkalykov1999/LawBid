import { Agent, setGlobalDispatcher, type Dispatcher } from 'undici';

/**
 * S8-3 (speed audit 2026-10-25): outbound HTTP to vendors (FCM, Bunny,
 * translation, ...) uses Node's built-in `fetch`, whose undici agent drops an
 * idle socket after 4 s - a push burst every 10-30 s paid DNS + TLS each
 * time. Two agents, both installed once at boot (main.ts):
 *
 *  - the GLOBAL one (all `fetch(...)` call sites) keeps sockets 30 s idle
 *    (`keepAliveTimeout`), up to 120 s when the server says so
 *    (`keepAliveMaxTimeout`); HTTP/1.1, so a vendor that never speaks h2 is
 *    untouched;
 *  - a dedicated FCM one with `allowH2`: FCM v1 is an h2 endpoint and a push
 *    to many devices becomes N streams of ONE connection instead of N
 *    sockets. Known problem of undici h2 (nodejs/undici#6073): a session the
 *    peer already closed is reused and the request dies. Mitigations here:
 *    idle timeout 30 s (Google closes idle h2 later), and the caller retries
 *    ONCE on a stale-socket error (`isStaleSocketError`).
 *
 * Kill switches (env, read at boot): `OUTBOUND_AGENT=off` leaves Node's
 * defaults, `OUTBOUND_FCM_H2=off` makes FCM use the global HTTP/1.1 agent.
 * Cost: none (fewer handshakes); load: a few idle sockets per vendor.
 *
 * Sources: undici Agent options (github.com/nodejs/undici docs/docs/api/
 * Agent.md, Client.md: keepAliveTimeout default 4e3, allowH2), issue #6073,
 * Node 24 fetch = bundled undici (accessed 2026-10-25).
 */
const KEEP_ALIVE_MS = 30_000;
const KEEP_ALIVE_MAX_MS = 120_000;

let installed = false;
let fcmAgent: Agent | undefined;

function agentsEnabled(env: NodeJS.ProcessEnv): boolean {
  return env.OUTBOUND_AGENT !== 'off';
}

export function installOutboundAgents(
  env: NodeJS.ProcessEnv = process.env,
): void {
  if (installed || !agentsEnabled(env)) return;
  installed = true;
  setGlobalDispatcher(
    new Agent({
      keepAliveTimeout: KEEP_ALIVE_MS,
      keepAliveMaxTimeout: KEEP_ALIVE_MAX_MS,
    }),
  );
  if (env.OUTBOUND_FCM_H2 !== 'off') {
    fcmAgent = new Agent({
      allowH2: true,
      keepAliveTimeout: KEEP_ALIVE_MS,
      keepAliveMaxTimeout: KEEP_ALIVE_MAX_MS,
    });
  }
}

/** The HTTP/2 agent for FCM, or undefined (switch off / not installed). */
export function fcmDispatcher(): Dispatcher | undefined {
  return fcmAgent;
}

/** Test hook. */
export function resetOutboundAgentsForTest(): void {
  installed = false;
  fcmAgent = undefined;
}

const STALE_CODES = new Set([
  'UND_ERR_SOCKET',
  'UND_ERR_CLOSED',
  'UND_ERR_INFO',
  'ECONNRESET',
  'EPIPE',
  'ERR_HTTP2_GOAWAY_SESSION',
  'ERR_HTTP2_STREAM_CANCEL',
  'ERR_HTTP2_INVALID_SESSION',
]);

/** True for the errors of a kept-alive socket the peer closed meanwhile. */
export function isStaleSocketError(error: unknown): boolean {
  let e: unknown = error;
  for (let i = 0; i < 3 && e; i++) {
    const code = (e as { code?: unknown }).code;
    if (typeof code === 'string' && STALE_CODES.has(code)) return true;
    e = (e as { cause?: unknown }).cause;
  }
  return false;
}
