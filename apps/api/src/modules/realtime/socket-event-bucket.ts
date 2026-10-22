/**
 * Security research #5 (2026-10-22), A5: a token bucket per socket. The
 * REST API has a per-user rate limit (throttler/); the socket had none, so
 * one client could send thousands of `conversation:join` / `typing` /
 * `call:signal` packets a second and each one cost a database or Redis
 * round trip. Every incoming packet takes one token; the bucket refills at
 * `refillPerSecond` up to `capacity`. In memory, per socket (no Redis: a
 * socket lives on one instance).
 */
export interface SocketEventBucket {
  tokens: number;
  updatedAt: number;
}

/** Packets a quiet socket may send at once (a chat opening: join, a few
 * presence subscriptions, a read receipt). */
export const SOCKET_EVENT_CAPACITY = 30;
/** Sustained packets per second (typing is already capped at 1/s by the
 * gateway; signaling bursts a few packets per call). */
export const SOCKET_EVENT_REFILL_PER_SECOND = 3;

export function newSocketEventBucket(
  now = Date.now(),
  capacity = SOCKET_EVENT_CAPACITY,
): SocketEventBucket {
  return { tokens: capacity, updatedAt: now };
}

/** Takes one token; false when the bucket is empty (the packet is over
 * the limit). */
export function takeSocketEvent(
  bucket: SocketEventBucket,
  now = Date.now(),
  capacity = SOCKET_EVENT_CAPACITY,
  refillPerSecond = SOCKET_EVENT_REFILL_PER_SECOND,
): boolean {
  const elapsed = Math.max(0, now - bucket.updatedAt) / 1000;
  bucket.tokens = Math.min(capacity, bucket.tokens + elapsed * refillPerSecond);
  bucket.updatedAt = now;
  if (bucket.tokens < 1) return false;
  bucket.tokens -= 1;
  return true;
}
