import type { Logger } from '@nestjs/common';

/** A warning that fires at most once per [everyMs]: the Redis fallbacks log
 * one line a minute during an outage, not one per request. */
export function throttledWarn(
  logger: Pick<Logger, 'warn'>,
  everyMs = 60_000,
  now: () => number = Date.now,
): (context: Record<string, unknown>, message: string) => void {
  let last = -Infinity;
  return (context, message) => {
    const t = now();
    if (t - last < everyMs) return;
    last = t;
    logger.warn(context, message);
  };
}
