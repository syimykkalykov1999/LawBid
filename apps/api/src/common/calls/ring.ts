/**
 * Owner 2026-10-28 (M2 of docs/dev/CALLS_REFERENCE_2026-10-28.md): ONE ring
 * length for every side of a call. It was 45 s on the iPhone (CallKit),
 * 60 s in the app and on Android, 65 s on the server, 30 s by the call
 * plugin's default. The server owns the number and sends it in every ring
 * push (`ringSeconds`); the phones ring exactly that long (older apps keep
 * their own 60 s).
 */
export const CALL_RING_SECONDS = 60;

/** The server waits this much longer before it records «missed»: a push
 * or an answer still on its way must not lose the call. */
export const CALL_RING_GRACE_MS = 5_000;

/** Unanswered after this → missed. */
export const CALL_RING_TIMEOUT_MS =
  CALL_RING_SECONDS * 1000 + CALL_RING_GRACE_MS;
