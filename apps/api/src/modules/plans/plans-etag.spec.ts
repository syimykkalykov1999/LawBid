import type { Request, Response } from 'express';
import { StickersController } from '../stickers/stickers.controller';
import { PlansController } from './plans.controller';

/** Delta audit P7: GET /plans and GET /stickers/featured answer 304
 * (no body built) when the phone's If-None-Match is current. */
function http(ifNoneMatch?: string) {
  const headers: Record<string, string> = {};
  const res = {
    setHeader: jest.fn((k: string, v: string) => {
      headers[k] = v;
    }),
    status: jest.fn(),
  };
  const req = {
    headers: ifNoneMatch ? { 'if-none-match': ifNoneMatch } : {},
  };
  return {
    req: req as unknown as Request,
    res: res as unknown as Response,
    status: res.status,
    headers,
  };
}

describe('GET /plans cheap ETag', () => {
  const stamp = [new Date('2026-10-01T00:00:00Z'), 4, null, 0];
  const build = () => {
    const plans = {
      etagStamp: jest.fn().mockResolvedValue(stamp),
      purchasable: jest.fn().mockResolvedValue([]),
      baseline: jest.fn().mockResolvedValue(null),
    };
    const c = new PlansController(plans as never, {} as never, {} as never);
    return { c, plans };
  };

  it('first call sets the ETag and builds the body', async () => {
    const { c, plans } = build();
    const h = http();
    const body = await c.listPlans({ audience: 'attorney' }, h.req, h.res);
    expect(body).toMatchObject({ audience: 'attorney', plans: [] });
    expect(h.headers.ETag).toMatch(/^W\/"plans-/);
    expect(plans.purchasable).toHaveBeenCalledTimes(1);
  });

  it('a matching If-None-Match gives 304 and builds nothing', async () => {
    const { c, plans } = build();
    const first = http();
    await c.listPlans({ audience: 'attorney' }, first.req, first.res);
    plans.purchasable.mockClear();
    const again = http(first.headers.ETag);
    const body = await c.listPlans(
      { audience: 'attorney' },
      again.req,
      again.res,
    );
    expect(body).toBeUndefined();
    expect(again.status).toHaveBeenCalledWith(304);
    expect(plans.purchasable).not.toHaveBeenCalled();
  });

  it('a changed plan stamp changes the tag', async () => {
    const { c, plans } = build();
    const first = http();
    await c.listPlans({ audience: 'attorney' }, first.req, first.res);
    plans.etagStamp.mockResolvedValue([
      new Date('2026-10-02T00:00:00Z'),
      4,
      null,
      0,
    ]);
    const again = http(first.headers.ETag);
    const body = await c.listPlans(
      { audience: 'attorney' },
      again.req,
      again.res,
    );
    expect(body).toBeDefined();
    expect(again.status).not.toHaveBeenCalled();
  });
});

describe('GET /stickers/featured cheap ETag', () => {
  const build = () => {
    const stickers = {
      featuredStamp: jest
        .fn()
        .mockResolvedValue([null, 0, 0, null, 0, null, 0]),
      featured: jest.fn().mockResolvedValue([]),
    };
    return { c: new StickersController(stickers as never), stickers };
  };
  const user = { sub: 'u1' } as never;

  it('304 on a matching tag, without loading packs', async () => {
    const { c, stickers } = build();
    const first = http();
    await c.listFeaturedStickerPacks(user, first.req, first.res);
    expect(stickers.featured).toHaveBeenCalledTimes(1);
    const again = http(first.headers.ETag);
    const body = await c.listFeaturedStickerPacks(user, again.req, again.res);
    expect(body).toBeUndefined();
    expect(again.status).toHaveBeenCalledWith(304);
    expect(stickers.featured).toHaveBeenCalledTimes(1);
  });

  it('the tag is per person', async () => {
    const { c } = build();
    const a = http();
    const b = http();
    await c.listFeaturedStickerPacks({ sub: 'u1' } as never, a.req, a.res);
    await c.listFeaturedStickerPacks({ sub: 'u2' } as never, b.req, b.res);
    expect(a.headers.ETag).not.toBe(b.headers.ETag);
  });
});

describe('GET /plans ETag across processes (review R-17)', () => {
  const tagOf = async (now: number, version: string): Promise<string> => {
    let tag = '';
    const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(now);
    process.env.APP_VERSION = version;
    let Fresh: typeof PlansController | undefined;
    /* eslint-disable @typescript-eslint/no-require-imports */
    jest.isolateModules(() => {
      Fresh = (
        require('./plans.controller') as {
          PlansController: typeof PlansController;
        }
      ).PlansController;
    });
    /* eslint-enable @typescript-eslint/no-require-imports */
    const plans = {
      etagStamp: jest
        .fn()
        .mockResolvedValue([new Date('2026-10-01T00:00:00Z'), 4, null, 0]),
      purchasable: jest.fn().mockResolvedValue([]),
      baseline: jest.fn().mockResolvedValue(null),
    };
    const c = new (Fresh as typeof PlansController)(
      plans as never,
      {} as never,
      {} as never,
    );
    const h = http();
    await c.listPlans({ audience: 'attorney' }, h.req, h.res);
    tag = h.headers.ETag;
    nowSpy.mockRestore();
    return tag;
  };

  it('two tasks of the same build send the same tag (no per-process clock)', async () => {
    // Same 5-minute bucket, different "process start" clocks.
    const a = await tagOf(1_800_000_000_000, 'abc1234');
    const b = await tagOf(1_800_000_001_000, 'abc1234');
    expect(a).toBe(b);
  });

  it('a new build still changes the tag', async () => {
    const a = await tagOf(1_800_000_000_000, 'abc1234');
    const c = await tagOf(1_800_000_000_000, 'def5678');
    expect(c).not.toBe(a);
  });
});
