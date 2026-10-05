import type { ConfigService } from '@nestjs/config';
import type { StateBarRegistry } from '@prisma/client';
import type { PrismaService } from '../../../prisma/prisma.service';
import type { StateBarAdapter } from '../providers/bar-lookup/state-bar-adapter';
import { StateRegistryService } from './state-registry.service';

// Test-only values (not real credentials).
const VENDOR_A = 'test-vendor-9876';
const VENDOR_B = 'test-vendor-1111';
const VENDOR_C = 'test-vendor-5678';
const VENDOR_D = 'test-vendor-2222';
const VENDOR_E = 'test-vendor-3333';

const MASTER = 'k1:0123456789abcdef0123456789abcdef';

function setup(opts: { secrets?: boolean; env?: string } = {}) {
  const rows = new Map<string, StateBarRegistry>();
  const upsert = jest.fn(
    (args: {
      where: { state_code: string };
      create: Partial<StateBarRegistry>;
      update: Partial<StateBarRegistry>;
    }) => {
      const prev = rows.get(args.where.state_code);
      const row = {
        state_code: args.where.state_code,
        adapter: 'manual',
        enabled: false,
        config: {},
        secret_enc: null,
        secret_masked: null,
        test_bar_number: null,
        last_test_at: null,
        last_test_result: null,
        updated_by: null,
        created_at: new Date(),
        updated_at: new Date(),
        ...prev,
        ...(prev ? args.update : args.create),
      };
      rows.set(row.state_code, row);
      return Promise.resolve(row);
    },
  );
  const prisma = {
    state: {
      findUnique: ({ where }: { where: { code: string } }) =>
        Promise.resolve(
          ['NY', 'CA', 'TX'].includes(where.code)
            ? { code: where.code, name: where.code }
            : null,
        ),
      findMany: ({ where }: { where: { code: { in: string[] } } }) =>
        Promise.resolve(where.code.in.map((code) => ({ code, name: code }))),
    },
    stateBarRegistry: {
      findUnique: ({ where }: { where: { state_code: string } }) =>
        Promise.resolve(rows.get(where.state_code) ?? null),
      findMany: () => Promise.resolve([...rows.values()]),
      upsert,
      update: jest.fn().mockResolvedValue({}),
    },
  } as unknown as PrismaService;
  const env: Record<string, string> = {
    NODE_ENV: opts.env ?? 'production',
    ...(opts.secrets !== false && {
      SECRETS_MASTER_KEYS: MASTER,
      SECRETS_ACTIVE_KID: 'k1',
    }),
  };
  const config = { get: (k: string) => env[k] } as unknown as ConfigService;
  const lookup = jest.fn().mockResolvedValue({ result: 'pass', details: {} });
  const adapters: StateBarAdapter[] = [{ type: 'generic_rest', lookup }];
  return {
    service: new StateRegistryService(prisma, config, adapters),
    rows,
    lookup,
  };
}

const vendor = {
  urlTemplate: 'https://api.vendor.example/v1?n={bar_number}',
  authType: 'header',
  authName: 'X-API-Key',
  lastNamePath: 'last',
  statusPath: 'status',
};

describe('StateRegistryService (owner 2026-10-05)', () => {
  it('a key + enabled → the state resolves with the decrypted key', async () => {
    const s = setup();
    const saved = await s.service.save(
      'ca',
      {
        adapter: 'generic_rest',
        enabled: true,
        config: vendor,
        secret: VENDOR_A,
      },
      'admin1',
    );
    expect(saved).toMatchObject({
      stateCode: 'CA',
      enabled: true,
      hasSecret: true,
      secretMasked: '••••9876',
    });
    expect(JSON.stringify(saved)).not.toContain(VENDOR_A);
    expect(s.rows.get('CA')!.secret_enc).toMatch(/^v2\.k1\./);
    const resolved = await s.service.resolve('CA');
    expect(resolved).toMatchObject({
      adapter: 'generic_rest',
      secret: VENDOR_A,
      config: expect.objectContaining({ authName: 'X-API-Key' }) as unknown,
    });
    expect(await s.service.enabledStates()).toEqual(['CA']);
  });

  it('a blank key keeps the saved one; disabled → manual at runtime', async () => {
    const s = setup();
    await s.service.save(
      'CA',
      {
        adapter: 'generic_rest',
        enabled: true,
        config: vendor,
        secret: VENDOR_B,
      },
      'a',
    );
    await s.service.save(
      'CA',
      { adapter: 'generic_rest', enabled: false, config: vendor, secret: '' },
      'a',
    );
    expect(s.rows.get('CA')!.secret_masked).toBe('••••1111');
    expect(await s.service.resolve('CA')).toBeNull();
  });

  it('enabling checks the required settings', async () => {
    const s = setup();
    const save = (config: Record<string, string>, secret?: string) =>
      s.service.save(
        'CA',
        { adapter: 'generic_rest', enabled: true, config, secret },
        'a',
      );
    await expect(
      save({ ...vendor, urlTemplate: '' }, VENDOR_C),
    ).rejects.toThrow('Request URL');
    await expect(save(vendor)).rejects.toThrow('API key');
    await expect(
      save({ ...vendor, lastNamePath: '' }, VENDOR_C),
    ).rejects.toThrow('name path');
    await expect(
      save({ ...vendor, authType: 'cookie' }, VENDOR_C),
    ).rejects.toThrow('one of');
    await expect(
      save(
        { ...vendor, urlTemplate: 'https://127.0.0.1/{bar_number}' },
        VENDOR_C,
      ),
    ).rejects.toThrow('private');
    await expect(
      s.service.save('ZZ', { adapter: 'manual', enabled: false }, 'a'),
    ).rejects.toThrow('Unknown state');
  });

  it('keys need the master key on the server', async () => {
    const s = setup({ secrets: false });
    await expect(
      s.service.save(
        'CA',
        {
          adapter: 'generic_rest',
          enabled: false,
          config: vendor,
          secret: VENDOR_C,
        },
        'a',
      ),
    ).rejects.toThrow('SECRETS_MASTER_KEYS');
  });

  it('manual is never enabled and drops any key', async () => {
    const s = setup();
    const saved = await s.service.save(
      'NY',
      { adapter: 'manual', enabled: true, secret: 'x' },
      'a',
    );
    expect(saved).toMatchObject({ enabled: false, hasSecret: false });
  });

  it('copy re-encrypts the key for each state', async () => {
    const s = setup();
    await s.service.save(
      'CA',
      {
        adapter: 'generic_rest',
        enabled: true,
        config: vendor,
        secret: VENDOR_D,
      },
      'a',
    );
    expect(await s.service.copy('CA', ['tx', 'CA'], 'a')).toEqual({
      copied: ['TX'],
    });
    expect(s.rows.get('TX')!.secret_enc).not.toBe(s.rows.get('CA')!.secret_enc);
    expect((await s.service.resolve('TX'))!.secret).toBe(VENDOR_D);
  });

  it('test runs the saved settings and reports errors as text', async () => {
    const s = setup();
    await s.service.save(
      'CA',
      {
        adapter: 'generic_rest',
        enabled: false,
        config: vendor,
        secret: VENDOR_E,
      },
      'a',
    );
    expect((await s.service.test('CA', { barNumber: '1' })).result).toBe(
      'pass',
    );
    s.lookup.mockRejectedValueOnce(
      new Error('The registry refused the key (HTTP 401)'),
    );
    expect(await s.service.test('CA', { barNumber: '1' })).toMatchObject({
      result: 'error',
      error: 'The registry refused the key (HTTP 401)',
    });
  });
});
