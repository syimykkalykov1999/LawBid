import {
  BOOTSTRAP_ETAG_BUCKET_MS,
  BootstrapService,
} from './bootstrap.service';
import {
  CONFIG_VERSION_KEY,
  bumpConfigVersion,
  readConfigVersion,
} from './config-version';

/** Owner 2026-10-22 (client economy plan, package D): the bootstrap's
 * cheap ETag — one Redis GET, no body. */
describe('config version + bootstrap ETag', () => {
  function redis() {
    const store = new Map<string, string>();
    return {
      store,
      get: jest.fn((k: string) => Promise.resolve(store.get(k) ?? null)),
      incr: jest.fn((k: string) => {
        const v = Number(store.get(k) ?? '0') + 1;
        store.set(k, String(v));
        return Promise.resolve(v);
      }),
      del: jest.fn(() => Promise.resolve(1)),
    };
  }

  it('bumps and reads the version; a Redis failure is swallowed', async () => {
    const r = redis();
    expect(await readConfigVersion(r as never)).toBe('0');
    await bumpConfigVersion(r as never);
    await bumpConfigVersion(r as never);
    expect(await readConfigVersion(r as never)).toBe('2');
    expect(r.store.get(CONFIG_VERSION_KEY)).toBe('2');

    const broken = {
      incr: jest.fn().mockRejectedValue(new Error('down')),
      get: jest.fn().mockRejectedValue(new Error('down')),
    };
    await expect(bumpConfigVersion(broken as never)).resolves.toBeUndefined();
    expect(await readConfigVersion(broken as never)).toBe('0');
  });

  it('the ETag changes with the version and with the time bucket only', async () => {
    const r = redis();
    const svc = new BootstrapService(
      {} as never,
      {} as never,
      {} as never,
      r as never,
    );
    const t0 = 5_666_667 * BOOTSTRAP_ETAG_BUCKET_MS;
    const a = await svc.etag(t0);
    expect(a).toBe(await svc.etag(t0 + BOOTSTRAP_ETAG_BUCKET_MS - 1));
    expect(a).not.toBe(await svc.etag(t0 + BOOTSTRAP_ETAG_BUCKET_MS));
    await svc.invalidate();
    expect(a).not.toBe(await svc.etag(t0));
    expect(r.del).toHaveBeenCalled();
  });
});
