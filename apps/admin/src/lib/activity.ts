/**
 * Owner 2026-10-25 (S18-1): the 30-minute idle timeout counts what the admin
 * does, not what the open tab does by itself. This file remembers the last
 * real input (mouse, keys, touch, scroll) so that
 * - requests made while nobody is at the screen carry `x-background: 1`
 *   (the API then does not extend the session), and
 * - the live polls stop after IDLE_STOP_MS without input.
 */
export const BACKGROUND_AFTER_MS = 2 * 60_000;
export const IDLE_STOP_MS = 15 * 60_000;

let lastInput = Date.now();
let started = false;

export function startActivityTracking(): void {
  if (started || typeof window === 'undefined') return;
  started = true;
  const mark = () => {
    lastInput = Date.now();
  };
  for (const ev of ['pointerdown', 'keydown', 'wheel', 'touchstart', 'scroll']) {
    window.addEventListener(ev, mark, { passive: true, capture: true });
  }
  // Moving the mouse counts too, but is sampled so it stays cheap.
  let last = 0;
  window.addEventListener(
    'mousemove',
    () => {
      const now = Date.now();
      if (now - last > 5_000) {
        last = now;
        lastInput = now;
      }
    },
    { passive: true },
  );
}

export function idleMs(now: number = Date.now()): number {
  return now - lastInput;
}

/** True when a request right now is most likely the tab, not the person. */
export function isBackgroundNow(now: number = Date.now()): boolean {
  return idleMs(now) > BACKGROUND_AFTER_MS;
}

/** Test helper. */
export function __setLastInput(ms: number): void {
  lastInput = ms;
}
