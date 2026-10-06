import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * Owner 2026-10-05 («Продвижение»): demo accounts for bloggers live in a
 * SEPARATE database. Whether the current request (or socket event, or job)
 * talks to the demo database is decided once, at the edge, and carried
 * here through the whole async call chain:
 *
 *  - `DemoHeaderMiddleware` reads `X-LawBid-Demo: 1` and runs the request
 *    inside `demoContext.run(true, …)`;
 *  - `JwtAuthGuard` then insists that the token's `demo` claim agrees with
 *    the header (a demo token can never read real data and vice versa);
 *  - `PrismaService` is a proxy that picks the demo PrismaClient while
 *    `demoContext.isDemo()` is true;
 *  - outbound integrations (Stripe, Bunny, SMS, e-mail, push, paid
 *    providers) refuse to run in demo context.
 *
 * Module-level singleton on purpose: PrismaService's constructor and the
 * middleware both need it before Nest's DI graph exists.
 */
export interface DemoStore {
  demo: boolean;
}

class DemoContext {
  private readonly als = new AsyncLocalStorage<DemoStore>();

  /** True while the current async chain works in the demo world. */
  isDemo(): boolean {
    return this.als.getStore()?.demo === true;
  }

  /** Runs `fn` in (or explicitly out of) the demo world. */
  run<T>(demo: boolean, fn: () => T): T {
    return this.als.run({ demo }, fn);
  }

  /** Runs `fn` in the demo world — explicit code paths (admin tab, seed,
   * sweep) use this instead of relying on a header. */
  runDemo<T>(fn: () => T): T {
    return this.run(true, fn);
  }
}

export const demoContext = new DemoContext();

/** Public reference endpoints answered from the REAL database even when
 * the demo header is present: translations, countries, legal texts, health.
 * These tables are not mirrored into the demo world. */
export const DEMO_PASSTHROUGH_PREFIXES = [
  '/api/v1/i18n',
  '/api/v1/countries',
  '/api/v1/legal',
  '/api/v1/health',
  '/health',
] as const;

export const DEMO_HEADER = 'x-lawbid-demo';

export function wantsDemo(headers: Record<string, unknown>): boolean {
  const v = headers[DEMO_HEADER];
  return v === '1' || v === 'true' || (Array.isArray(v) && v[0] === '1');
}

export function isDemoPassthroughPath(path: string): boolean {
  return DEMO_PASSTHROUGH_PREFIXES.some(
    (p) => path === p || path.startsWith(p + '/') || path.startsWith(p + '?'),
  );
}
