import type Redis from 'ioredis';

/**
 * Owner 2026-10-22 (server load audit, finding 5): a revoked session's
 * sockets used to notice only by asking Redis every 45 s — one GET per
 * live socket (≈22k Redis ops/s per million sockets). Now whoever revokes
 * a session publishes it once on this channel and every API instance drops
 * that session's sockets at once (RealtimeGateway).
 *
 * Pub/sub is fire-and-forget: an instance whose subscriber is reconnecting
 * can miss a message. That socket still dies when its access token expires
 * (≤ JWT_ACCESS_TTL_SECONDS, 15 min) — a revoked session cannot refresh,
 * and `auth:refresh` checks the blacklist — the same bound the REST API
 * already accepts on a Redis hiccup (SessionRevocationService doc).
 */
export const SESSION_REVOKED_CHANNEL = 'session:revoked';

export interface SessionRevokedMessage {
  /** The session chain id (the access token's `sid`). */
  sessionId: string;
  userId?: string;
}

/** Best-effort: a failed publish leaves the token-expiry bound above. */
export async function publishSessionRevoked(
  redis: Pick<Redis, 'publish'>,
  message: SessionRevokedMessage,
): Promise<void> {
  try {
    await redis.publish(SESSION_REVOKED_CHANNEL, JSON.stringify(message));
  } catch {
    // See the doc comment: the access token's expiry still ends the socket.
  }
}

/** The message, or null for anything malformed. */
export function parseSessionRevoked(raw: string): SessionRevokedMessage | null {
  try {
    const v = JSON.parse(raw) as Partial<SessionRevokedMessage> | null;
    if (!v || typeof v.sessionId !== 'string' || v.sessionId.length === 0) {
      return null;
    }
    return {
      sessionId: v.sessionId,
      ...(typeof v.userId === 'string' ? { userId: v.userId } : {}),
    };
  } catch {
    return null;
  }
}
