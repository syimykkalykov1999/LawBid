import { ForbiddenException } from '@nestjs/common';
import { ErrorCode } from '../errors/error-code.enum';
import { demoContext } from './demo-context';

/**
 * Owner 2026-10-05 (demo mode): the demo world must never reach a real
 * person or a paid provider. These helpers sit at the choke points —
 * e-mail and SMS providers, push queue, Stripe client, Bunny client, the
 * cost guard — and turn a demo-context call into a no-op or a plain 403.
 */
export function demoDisabledError(what: string): ForbiddenException {
  return new ForbiddenException({
    code: ErrorCode.FEATURE_DISABLED,
    message: `${what} is not available in demo mode.`,
    details: { demo: true },
  });
}

/** Throws FEATURE_DISABLED when called inside the demo world. */
export function assertNotDemo(what: string): void {
  if (demoContext.isDemo()) throw demoDisabledError(what);
}

/**
 * Wraps an SDK client so that ANY use of it inside the demo world throws
 * FEATURE_DISABLED — `stripe.customers.create(...)`, `stripe.webhooks…`,
 * whatever the caller reaches for. Outside demo context it is the client
 * itself, untouched.
 */
export function demoDenyProxy<T extends object>(client: T, what: string): T {
  return new Proxy(client, {
    get(target, prop, receiver) {
      if (demoContext.isDemo()) throw demoDisabledError(what);
      const value = Reflect.get(target, prop, receiver) as unknown;
      return typeof value === 'function'
        ? (value as (...a: unknown[]) => unknown).bind(target)
        : value;
    },
  });
}

/** Message-sending providers: silently skipped in the demo world (the
 * demo user has no real address anyway; the row is still written). */
export function demoNoop<T extends object>(
  inner: T,
  methods: readonly (keyof T)[],
): T {
  return new Proxy(inner, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver) as unknown;
      if (
        typeof value === 'function' &&
        (methods as readonly PropertyKey[]).includes(prop)
      ) {
        return (...args: unknown[]) =>
          demoContext.isDemo()
            ? Promise.resolve(undefined)
            : (value as (...a: unknown[]) => unknown).apply(target, args);
      }
      return typeof value === 'function'
        ? (value as (...a: unknown[]) => unknown).bind(target)
        : value;
    },
  });
}
