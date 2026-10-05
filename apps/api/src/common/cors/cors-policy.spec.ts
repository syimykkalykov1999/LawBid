import { CorsPolicy, normalizeOrigin } from './cors-policy';

describe('CorsPolicy', () => {
  const web = ['https://lawbid.dev', 'https://www.lawbid.dev/'];

  it('normalizes origins and rejects wildcards / paths', () => {
    expect(normalizeOrigin(' https://LawBid.dev/ ')).toBe('https://lawbid.dev');
    expect(normalizeOrigin('*')).toBeNull();
    expect(normalizeOrigin('https://lawbid.dev/x')).toBeNull();
  });

  it('classifies admin, web and unknown origins', async () => {
    const p = new CorsPolicy(['https://admin.lawbid.dev'], 'production', () =>
      Promise.resolve(web),
    );
    expect(await p.classify('https://admin.lawbid.dev')).toBe('admin');
    expect(await p.classify('https://www.lawbid.dev')).toBe('web');
    expect(await p.classify('https://evil.example')).toBeNull();
    expect(await p.classify(undefined)).toBeNull();
  });

  it('allows localhost only outside production', async () => {
    const load = () => Promise.resolve(web);
    expect(
      await new CorsPolicy([], 'production', load).classify(
        'http://localhost:3000',
      ),
    ).toBeNull();
    expect(
      await new CorsPolicy([], 'development', load).classify(
        'http://localhost:3000',
      ),
    ).toBe('web');
  });

  it('drops http web origins in production', async () => {
    const p = new CorsPolicy([], 'production', () =>
      Promise.resolve(['http://lawbid.dev']),
    );
    expect(await p.classify('http://lawbid.dev')).toBeNull();
  });

  it('caches the admin-edited list and keeps it when a reload fails', async () => {
    let t = 0;
    const load = jest
      .fn<Promise<string[]>, []>()
      .mockResolvedValueOnce(web)
      .mockRejectedValueOnce(new Error('redis down'));
    const p = new CorsPolicy([], 'production', load, () => t);
    expect(await p.classify('https://lawbid.dev')).toBe('web');
    t = 10_000;
    expect(await p.classify('https://lawbid.dev')).toBe('web');
    expect(load).toHaveBeenCalledTimes(1);
    t = 60_000;
    expect(await p.classify('https://lawbid.dev')).toBe('web');
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('delegate: credentials only for the admin origin', async () => {
    const p = new CorsPolicy(['https://admin.lawbid.dev'], 'production', () =>
      Promise.resolve(web),
    );
    const run = (origin?: string) =>
      new Promise<Record<string, unknown>>((resolve) =>
        p.delegate({ maxAge: 600 })(
          { header: () => origin } as never,
          (_e, o) => resolve(o as Record<string, unknown>),
        ),
      );
    expect(await run('https://admin.lawbid.dev')).toMatchObject({
      origin: true,
      credentials: true,
      maxAge: 600,
    });
    expect(await run('https://lawbid.dev')).toMatchObject({
      origin: true,
      credentials: false,
    });
    expect(await run('https://evil.example')).toMatchObject({ origin: false });
  });
});
