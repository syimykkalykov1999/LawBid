/** Log fields for a caught value. An Error with an empty `message` (an
 * AggregateError, a driver error carrying only a code, a closed-connection
 * rejection) logged as `err: error.message` printed "" and hid the cause:
 * this always names something (message, else name/code, else the inner
 * errors) and adds the stack. */
export interface ErrorLogFields {
  err: string;
  errName?: string;
  errCode?: string;
  errStack?: string;
}

export function errorLogFields(error: unknown): ErrorLogFields {
  if (!(error instanceof Error)) return { err: String(error) || 'unknown' };
  const code = (error as { code?: unknown }).code;
  const inner =
    error instanceof AggregateError
      ? error.errors
          .map((e: unknown) => (e instanceof Error ? e.message : String(e)))
          .filter(Boolean)
          .join('; ')
      : '';
  return {
    err:
      error.message ||
      inner ||
      (typeof code === 'string' || typeof code === 'number'
        ? String(code)
        : error.name),
    errName: error.name,
    ...(typeof code === 'string' || typeof code === 'number'
      ? { errCode: String(code) }
      : {}),
    ...(error.stack ? { errStack: error.stack } : {}),
  };
}

/** The final flush on shutdown must fit in the ECS stop window. */
export const SHUTDOWN_FLUSH_MS = 5_000;

/** Resolves when `work` settles or after `ms`, whichever is first (the
 * timer is cleared); never rejects. A rejection is reported to `onError`
 * even when it comes after the timeout. Returns whether `work` finished
 * in time. */
export async function settleWithin(
  work: Promise<unknown>,
  ms: number,
  onError: (error: unknown) => void,
): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<false>((resolve) => {
    timer = setTimeout(() => resolve(false), ms);
  });
  const settled = work.then(
    () => true as const,
    (error: unknown) => {
      onError(error);
      return true as const;
    },
  );
  try {
    return await Promise.race([settled, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
