import { AdminConfigService } from './admin-config.service';

/** Feature reality audit 2026-11-08: an admin switch that cannot work is
 * refused at save time instead of showing «on» and doing nothing. */
type Svc = {
  assertTextDetectorReady(k: string, v: unknown): Promise<void>;
  assertSearchEngineReady(k: string, v: unknown): Promise<void>;
};

function svc(opts: {
  has?: boolean;
  opensearch?: Record<string, string> | null;
  kind?: string | null;
  env?: Record<string, string>;
}) {
  const s = Object.create(AdminConfigService.prototype) as AdminConfigService;
  Object.assign(s, {
    secrets: {
      has: jest.fn().mockResolvedValue(opts.has ?? false),
      get: jest
        .fn()
        .mockResolvedValue(
          opts.opensearch ? { fields: opts.opensearch } : null,
        ),
    },
    config: { get: (k: string) => opts.env?.[k] },
    prisma: {
      appConfig: {
        findUnique: jest
          .fn()
          .mockResolvedValue(opts.kind ? { value: opts.kind } : null),
      },
    },
  });
  return s as unknown as Svc;
}

describe('moderation.detect.mode needs the OpenAI moderation key', () => {
  it('shadow / enforce without the key: 400', async () => {
    for (const v of ['shadow', 'enforce']) {
      await expect(
        svc({}).assertTextDetectorReady('moderation.detect.mode', v),
      ).rejects.toMatchObject({ status: 400 });
    }
  });

  it('with the key, or off, or another key: saved', async () => {
    await svc({ has: true }).assertTextDetectorReady(
      'moderation.detect.mode',
      'enforce',
    );
    await svc({}).assertTextDetectorReady('moderation.detect.mode', 'off');
    await svc({}).assertTextDetectorReady('moderation.detect.hold_at', 0.5);
  });
});

describe('search.engine with the serverless kind', () => {
  it('a domain URL alone does not do for serverless', async () => {
    await expect(
      svc({
        opensearch: { url: 'https://domain.example' },
        kind: 'serverless',
      }).assertSearchEngineReady('search.engine', 'engine'),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('the serverless address does', async () => {
    await svc({
      kind: 'serverless',
      env: { OPENSEARCH_SERVERLESS_URL: 'https://aoss.example' },
    }).assertSearchEngineReady('search.engine', 'shadow');
  });

  it('the domain kind still needs the domain URL', async () => {
    await expect(
      svc({ kind: 'domain' }).assertSearchEngineReady(
        'search.engine',
        'engine',
      ),
    ).rejects.toMatchObject({ status: 400 });
    await svc({
      kind: 'domain',
      opensearch: { url: 'https://domain.example' },
    }).assertSearchEngineReady('search.engine', 'engine');
  });
});
