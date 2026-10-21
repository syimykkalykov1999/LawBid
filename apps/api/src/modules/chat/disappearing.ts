/**
 * Owner 2026-10-21 (WhatsApp «Disappearing messages»): the timers a chat or a
 * group can use. `null` is off. A message sent while a timer runs carries
 * `expires_at = sent + timer`; messages from before keep living.
 */
export const DISAPPEAR_OPTIONS_S = [86_400, 604_800, 7_776_000] as const;

export type DisappearAfterS = (typeof DISAPPEAR_OPTIONS_S)[number];

/** The `expires_at` of a message sent at [now] under timer [afterS]. */
export function expiresAtFor(
  afterS: number | null | undefined,
  now: Date = new Date(),
): Date | null {
  return afterS ? new Date(now.getTime() + afterS * 1000) : null;
}

/** Prisma filter: the message has not run out yet (the sweep may lag the
 * clock by a few minutes, the lists must not). */
export function notExpired(now: Date = new Date()) {
  return { OR: [{ expires_at: null }, { expires_at: { gt: now } }] };
}
