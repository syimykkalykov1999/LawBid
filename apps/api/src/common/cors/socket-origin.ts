import type { IncomingMessage } from 'node:http';
import type { CorsPolicy } from './cors-policy';

/**
 * ASVS 5.0 V4.4.2 (STAGE2_SECURITY #6): a WebSocket / Socket.IO handshake
 * is accepted only from an allowed browser origin. The rule is the HTTP
 * CORS rule (CorsPolicy, `ADMIN_ORIGINS` + the admin's `web.allowed_origins`):
 *  - no Origin header → allowed (the phone apps and server-side clients
 *    send none; browsers always send one on a WebSocket handshake);
 *  - an Origin that CorsPolicy classifies as `admin` or `web` → allowed;
 *  - any other Origin → refused at the Engine.IO handshake (HTTP 403 for
 *    polling, the upgrade is never completed), before any namespace or
 *    token check runs.
 *
 * Engine.IO is shared by every namespace and takes its `allowRequest` and
 * `cors` from whichever gateway is created first, so every gateway passes
 * the same two options (SOCKET_SERVER_ORIGIN_OPTIONS). The policy instance
 * is the one app.setup.ts builds for HTTP (installSocketOriginPolicy), so
 * the admin's list applies to sockets the moment it is saved. Before it is
 * installed (a bare test module) a present Origin is refused: fail closed.
 */
let policy: CorsPolicy | null = null;

export function installSocketOriginPolicy(p: CorsPolicy | null): void {
  policy = p;
}

export async function socketOriginAllowed(
  origin: string | undefined,
): Promise<boolean> {
  if (origin === undefined || origin === '') return true;
  if (!policy) return false;
  try {
    return (await policy.classify(origin)) !== null;
  } catch {
    return false;
  }
}

/** Engine.IO `allowRequest`: runs on every handshake / polling request. */
export function socketAllowRequest(
  req: IncomingMessage,
  callback: (err: string | null | undefined, success: boolean) => void,
): void {
  const raw: unknown = (req.headers as Record<string, unknown>)['origin'];
  const origin = typeof raw === 'string' ? raw : undefined;
  void socketOriginAllowed(origin).then(
    (ok) => callback(ok ? null : 'origin not allowed', ok),
    () => callback('origin not allowed', false),
  );
}

/** `cors` for the polling transport: the same allowlist, no reflection. */
export const SOCKET_CORS = {
  origin: (
    origin: string | undefined,
    cb: (err: Error | null, allow?: boolean) => void,
  ): void => {
    void socketOriginAllowed(origin).then(
      (ok) => cb(null, ok),
      () => cb(null, false),
    );
  },
};

export const SOCKET_SERVER_ORIGIN_OPTIONS = {
  cors: SOCKET_CORS,
  allowRequest: socketAllowRequest,
} as const;
