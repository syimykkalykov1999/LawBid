import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  DEPLOY_PATHS,
  isDeployPath,
  LaunchChecksService,
} from './launch-checks.service';

const NOW = new Date('2026-10-25T10:00:00Z');

interface Opts {
  env?: Record<string, string>;
  overview?: unknown[];
  fields?: Record<string, Record<string, string> | undefined>;
  setting?: Record<string, string>;
  paging?: Record<string, unknown>;
  budgets?: unknown[];
  budgetsAvailable?: boolean;
  tags?: string[];
  drill?: unknown;
}

function make(o: Opts = {}) {
  const store = new Map<string, unknown>();
  if (o.drill) store.set('ops.restore_drill', o.drill);
  const prisma = {
    appConfig: {
      findUnique: jest.fn(({ where }) =>
        Promise.resolve(
          store.has(where.key) ? { value: store.get(where.key) } : null,
        ),
      ),
      upsert: jest.fn(({ where, create }) => {
        store.set(where.key, create.value);
        return Promise.resolve({});
      }),
    },
  };
  const secrets = {
    overview: jest.fn().mockResolvedValue(o.overview ?? []),
    get: jest.fn((p: string) =>
      Promise.resolve(o.fields?.[p] ? { fields: o.fields[p] } : null),
    ),
    field: jest.fn((p: string, f: string) =>
      Promise.resolve(o.fields?.[p]?.[f]),
    ),
    has: jest.fn().mockResolvedValue(false),
  };
  const svc = new LaunchChecksService(
    { get: (k: string) => o.env?.[k] } as never,
    secrets as never,
    {
      string: jest.fn((k: string) => Promise.resolve(o.setting?.[k] ?? '')),
    } as never,
    prisma as never,
    {
      status: jest.fn().mockResolvedValue({
        available: true,
        configured: true,
        state: 'confirmed',
        ...o.paging,
      }),
    } as never,
    {
      available: o.budgetsAvailable ?? true,
      list: jest.fn().mockResolvedValue(o.budgets ?? []),
    } as never,
    { activeTagKeys: jest.fn().mockResolvedValue(o.tags ?? []) } as never,
  );
  svc.resolveNs = jest
    .fn()
    .mockResolvedValue(['a.ns.cloudflare.com', 'b.ns.cloudflare.com']);
  return { svc, store };
}

const item = async (svc: LaunchChecksService, id: string) =>
  (await svc.report(NOW, true)).items.find((i) => i.id === id)!;

describe('LaunchChecksService', () => {
  it('provider lights: no keys red, keys untested yellow, tested ok green, failed red', async () => {
    const ov = (extra: object) => [
      {
        provider: 'cloudflare_turn',
        configured: true,
        testable: true,
        active: null,
        ...extra,
      },
    ];
    expect(
      (await item(make({ overview: [] }).svc, 'cloudflare_turn')).status,
    ).toBe('red');
    expect(
      (await item(make({ overview: ov({}) }).svc, 'cloudflare_turn')).status,
    ).toBe('yellow');
    expect(
      (
        await item(
          make({
            overview: ov({
              active: { lastTestOk: true, lastTestAt: '2026-10-24T00:00:00Z' },
            }),
          }).svc,
          'cloudflare_turn',
        )
      ).status,
    ).toBe('green');
    const bad = await item(
      make({
        overview: ov({
          active: { lastTestOk: false, lastTestError: 'HTTP 403' },
        }),
      }).svc,
      'cloudflare_turn',
    );
    expect(bad.status).toBe('red');
    expect(bad.detail).toContain('403');
  });

  it('DNS: Cloudflare name servers green, anything else red', async () => {
    expect((await item(make().svc, 'dns')).status).toBe('green');
    const other = make();
    other.svc.resolveNs = jest.fn().mockResolvedValue(['ns1.registrar.com']);
    expect((await item(other.svc, 'dns')).status).toBe('red');
  });

  it('PagerDuty follows the subscription: confirmed green, pending yellow, none red', async () => {
    expect((await item(make().svc, 'pagerduty')).status).toBe('green');
    expect(
      (await item(make({ paging: { state: 'pending' } }).svc, 'pagerduty'))
        .status,
    ).toBe('yellow');
    expect(
      (await item(make({ paging: { state: 'none' } }).svc, 'pagerduty')).status,
    ).toBe('red');
    expect(
      (
        await item(
          make({ paging: { configured: false, state: 'none' } }).svc,
          'pagerduty',
        )
      ).status,
    ).toBe('red');
  });

  it('budget: under 80 % green, near yellow, over red; old budget red until removed', async () => {
    const row = (used: number, extra = {}) => ({
      name: 'lawbid-prod-monthly',
      prod: true,
      obsolete: false,
      limitUsd: 100,
      actualUsd: used,
      forecastUsd: null,
      timeUnit: 'MONTHLY',
      ...extra,
    });
    expect(
      (await item(make({ budgets: [row(10)] }).svc, 'budget')).status,
    ).toBe('green');
    expect(
      (await item(make({ budgets: [row(85)] }).svc, 'budget')).status,
    ).toBe('yellow');
    expect(
      (await item(make({ budgets: [row(120)] }).svc, 'budget')).status,
    ).toBe('red');
    const old = {
      name: 'LawBid Monthly',
      prod: false,
      obsolete: true,
      limitUsd: 50,
    };
    const red = await item(make({ budgets: [row(1), old] }).svc, 'old_budget');
    expect(red.status).toBe('red');
    // Owner 2026-11-08: the owner deletes it alone with his 2FA code.
    expect(red.hint).toContain('2FA');
    expect(red.hint).not.toMatch(/втор/i);
    expect(
      (await item(make({ budgets: [row(1)] }).svc, 'old_budget')).status,
    ).toBe('green');
  });

  it('budget items fall back to a manual tick off AWS', async () => {
    const i = await item(make({ budgetsAvailable: false }).svc, 'budget');
    expect(i).toMatchObject({
      status: 'manual',
      manualTick: true,
      ticked: false,
    });
  });

  it('cost tags: all expected tags active is green, a missing one red', async () => {
    const env = { OPS_COST_TAG_KEYS: 'Env,Project' };
    expect(
      (
        await item(
          make({ env, tags: ['Env', 'Project', 'X'] }).svc,
          'cost_tags',
        )
      ).status,
    ).toBe('green');
    const miss = await item(make({ env, tags: ['Env'] }).svc, 'cost_tags');
    expect(miss.status).toBe('red');
    expect(miss.detail).toContain('Project');
  });

  it('Stripe needs a live key and all three prices', async () => {
    const f = (key: string, n: number) => ({
      stripe: {
        secretKey: key,
        ...(n > 0 ? { priceId: 'price_1' } : {}),
        ...(n > 1 ? { priceSeatId: 'price_2' } : {}),
        ...(n > 2 ? { priceYearlyId: 'price_3' } : {}),
      },
    });
    expect(
      (await item(make({ fields: f('sk_test_abc', 3) }).svc, 'stripe')).status,
    ).toBe('red');
    expect(
      (await item(make({ fields: f('sk_live_abc', 3) }).svc, 'stripe')).status,
    ).toBe('green');
    expect(
      (await item(make({ fields: f('sk_live_abc', 1) }).svc, 'stripe')).status,
    ).toBe('yellow');
    expect(
      (await item(make({ fields: f('sk_live_abc', 0) }).svc, 'stripe')).status,
    ).toBe('red');
  });

  it('App Check: enforce green, monitor yellow, off red', async () => {
    const mk = (m: string) =>
      make({ setting: { 'security.app_check.mode': m } }).svc;
    expect((await item(mk('enforce'), 'app_check')).status).toBe('green');
    expect((await item(mk('monitor'), 'app_check')).status).toBe('yellow');
    expect((await item(mk('off'), 'app_check')).status).toBe('red');
  });

  it('restore drill: none red, recent green, older than 90 days red; recording it turns it green', async () => {
    expect((await item(make().svc, 'restore_drill')).status).toBe('red');
    expect(
      (
        await item(
          make({ drill: { at: '2026-09-01T00:00:00Z' } }).svc,
          'restore_drill',
        )
      ).status,
    ).toBe('green');
    expect(
      (
        await item(
          make({ drill: { at: '2026-05-01T00:00:00Z' } }).svc,
          'restore_drill',
        )
      ).status,
    ).toBe('red');
    const { svc } = make();
    await svc.recordDrill('RTO 41 min', NOW);
    const i = await item(svc, 'restore_drill');
    expect(i.status).toBe('green');
    expect(i.action).toBe('restore_drill');
  });

  it('a manual tick turns a manual row green and can be removed', async () => {
    const { svc } = make();
    expect((await item(svc, 'sign_required')).status).toBe('manual');
    await svc.setTick('sign_required', true, NOW);
    expect(await item(svc, 'sign_required')).toMatchObject({
      status: 'green',
      ticked: true,
    });
    await svc.setTick('sign_required', false);
    expect((await item(svc, 'sign_required')).status).toBe('manual');
  });

  it('deploy: running = main head green, behind red, no GitHub keys manual', async () => {
    const realFetch = global.fetch;
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ sha: 'abcdef1234567890' }),
    }) as never;
    try {
      const fields = { github: { repo: 'o/r' } };
      expect(
        (
          await item(
            make({ env: { APP_VERSION: 'abcdef1234567890' }, fields }).svc,
            'deploy',
          )
        ).status,
      ).toBe('green');
      expect(
        (
          await item(
            make({ env: { APP_VERSION: '1111111' }, fields }).svc,
            'deploy',
          )
        ).status,
      ).toBe('red');
      expect(
        (await item(make({ env: { APP_VERSION: '1111111' } }).svc, 'deploy'))
          .status,
      ).toBe('manual');
    } finally {
      global.fetch = realFetch;
    }
  });

  it('one failing probe only turns its own row into «не удалось проверить»', async () => {
    const { svc } = make({ budgets: [], env: { OPS_COST_TAG_KEYS: 'Env' } });
    (
      svc as unknown as { cost: { activeTagKeys: jest.Mock } }
    ).cost.activeTagKeys.mockRejectedValue(new Error('AccessDenied'));
    const r = await svc.report(NOW, true);
    const tags = r.items.find((i) => i.id === 'cost_tags')!;
    expect(tags.status).toBe('manual');
    expect(tags.detail).toContain('AccessDenied');
    expect(r.items.length).toBeGreaterThan(10);
  });

  /** fetch stub: answers by URL suffix; anything else is a 404. */
  const stubFetch = (
    routes: Record<string, { status?: number; body?: unknown }>,
  ) =>
    jest.fn((url: string) => {
      const hit = Object.entries(routes).find(([k]) => url.endsWith(k));
      const status = hit ? (hit[1].status ?? 200) : 404;
      return Promise.resolve({
        ok: status >= 200 && status < 300,
        status,
        json: () => Promise.resolve(hit?.[1].body ?? {}),
      });
    }) as never;

  it('deploy: main moved only outside the deploy paths is green «нечего выкатывать»', async () => {
    const realFetch = global.fetch;
    const fields = { github: { repo: 'o/r', token: 'ghp_x' } };
    const env = { APP_VERSION: '1111111' };
    const cmp = '/compare/1111111...abcdef1234567890';
    const main = { '/commits/main': { body: { sha: 'abcdef1234567890' } } };
    try {
      global.fetch = stubFetch({
        ...main,
        [cmp]: {
          body: {
            files: [
              { filename: 'infra/envs/prod/main.tf' },
              { filename: 'docs/dev/KNOWN_ERRORS.md' },
              { filename: 'apps/mobile/lib/main.dart' },
              { filename: '.github/workflows/infra-apply.yml' },
            ],
          },
        },
      });
      const green = await item(make({ env, fields }).svc, 'deploy');
      expect(green.status).toBe('green');
      expect(green.detail).toContain('нечего выкатывать');

      global.fetch = stubFetch({
        ...main,
        [cmp]: {
          body: {
            files: [
              { filename: 'docs/a.md' },
              { filename: 'apps/api/src/main.ts' },
            ],
          },
        },
      });
      const red = await item(make({ env, fields }).svc, 'deploy');
      expect(red.status).toBe('red');
      expect(red.detail).toContain('для выката 1');

      // GitHub cannot compare (unknown commit) or cuts the list: stay red.
      global.fetch = stubFetch(main);
      expect((await item(make({ env, fields }).svc, 'deploy')).status).toBe(
        'red',
      );
      global.fetch = stubFetch({
        ...main,
        [cmp]: {
          body: {
            files: Array.from({ length: 300 }, (_, i) => ({
              filename: `docs/${i}.md`,
            })),
          },
        },
      });
      expect((await item(make({ env, fields }).svc, 'deploy')).status).toBe(
        'red',
      );
    } finally {
      global.fetch = realFetch;
    }
  });

  it('deploy paths match the on.push.paths of deploy.yml', () => {
    const yml = readFileSync(
      join(__dirname, '../../../../../../.github/workflows/deploy.yml'),
      'utf8',
    );
    const block = yml.slice(
      yml.indexOf('    paths:'),
      yml.indexOf('  workflow_dispatch:'),
    );
    const paths = [...block.matchAll(/^\s+- "([^"]+)"$/gm)].map((m) => m[1]);
    expect(paths.length).toBeGreaterThan(0);
    expect(DEPLOY_PATHS).toEqual(paths);
    expect(isDeployPath('apps/admin/src/x.tsx')).toBe(true);
    expect(isDeployPath('package.json')).toBe(true);
    expect(isDeployPath('apps/mobile/package.json')).toBe(false);
    expect(isDeployPath('apps/api-extra/x.ts')).toBe(false);
  });

  it('SIGN_REQUIRED: read from the GitHub repo variable; no rights keeps the hand tick', async () => {
    const realFetch = global.fetch;
    const fields = { github: { repo: 'o/r', token: 'ghp_x' } };
    const v = '/actions/variables/SIGN_REQUIRED';
    try {
      global.fetch = stubFetch({ [v]: { body: { value: 'true' } } });
      expect(await item(make({ fields }).svc, 'sign_required')).toMatchObject({
        status: 'green',
        manualTick: false,
      });

      global.fetch = stubFetch({ [v]: { body: { value: 'false' } } });
      expect(await item(make({ fields }).svc, 'sign_required')).toMatchObject({
        status: 'red',
        manualTick: false,
      });

      global.fetch = stubFetch({});
      expect((await item(make({ fields }).svc, 'sign_required')).status).toBe(
        'red',
      );

      global.fetch = stubFetch({ [v]: { status: 403 } });
      const noRight = await item(make({ fields }).svc, 'sign_required');
      expect(noRight).toMatchObject({ status: 'manual', manualTick: true });
      expect(noRight.hint).toContain('Variables: read');

      const noKeys = await item(make().svc, 'sign_required');
      expect(noKeys.status).toBe('manual');
      expect(noKeys.hint).toContain('SIGN_REQUIRED = true');
      expect(noKeys.hint).not.toContain('сборке приложения');
    } finally {
      global.fetch = realFetch;
    }
  });
});
