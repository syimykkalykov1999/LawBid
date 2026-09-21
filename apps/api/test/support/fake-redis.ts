/**
 * Minimal in-memory stand-in for the ioredis client, used only in e2e
 * tests so stage 1.2's plumbing (idempotency replay, throttler storage)
 * can be exercised without a live Redis — docker-compose isn't runnable
 * in the build sandbox. Implements only the subset of the ioredis API
 * this codebase actually calls.
 */
export class FakeRedis {
  private store = new Map<
    string,
    { value: string; expiresAt: number | null }
  >();

  private read(key: string): string | null {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (entry.expiresAt !== null && entry.expiresAt <= Date.now()) {
      this.store.delete(key);
      return null;
    }
    return entry.value;
  }

  get(key: string): Promise<string | null> {
    return Promise.resolve(this.read(key));
  }

  set(key: string, value: string, ...args: unknown[]): Promise<'OK'> {
    let expiresAt: number | null = null;
    const exIdx = args.indexOf('EX');
    const pxIdx = args.indexOf('PX');
    if (exIdx !== -1) expiresAt = Date.now() + Number(args[exIdx + 1]) * 1000;
    if (pxIdx !== -1) expiresAt = Date.now() + Number(args[pxIdx + 1]);
    this.store.set(key, { value, expiresAt });
    return Promise.resolve('OK');
  }

  incr(key: string): Promise<number> {
    const current = Number(this.read(key) ?? '0') + 1;
    const existing = this.store.get(key);
    this.store.set(key, {
      value: String(current),
      expiresAt: existing?.expiresAt ?? null,
    });
    return Promise.resolve(current);
  }

  pexpire(key: string, ms: number): Promise<number> {
    const entry = this.store.get(key);
    if (!entry) return Promise.resolve(0);
    entry.expiresAt = Date.now() + ms;
    return Promise.resolve(1);
  }

  pttl(key: string): Promise<number> {
    const entry = this.store.get(key);
    if (!entry || entry.expiresAt === null) return Promise.resolve(-1);
    return Promise.resolve(Math.max(0, entry.expiresAt - Date.now()));
  }
}
