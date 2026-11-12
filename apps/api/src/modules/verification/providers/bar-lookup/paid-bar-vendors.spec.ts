import fixture from './__fixtures__/vendor-license-middle.json';
import type { AppSettingsService } from '../../../../common/app-settings/app-settings.service';
import type { SecretsService } from '../../../../common/secrets/secrets.service';
import { APP_SETTINGS } from '../../../../common/app-settings/app-settings.defaults';
import { providerById } from '../../../../common/secrets/provider-registry';
import { GenericRestAdapter } from './generic-rest.adapter';
import { PAID_BAR_VENDORS, PaidBarVendorService } from './paid-bar-vendors';

jest.mock('node:dns/promises', () => ({
  lookup: jest.fn(() =>
    Promise.resolve([{ address: '93.184.216.34', family: 4 }]),
  ),
}));

// Test-only value (not a real credential).
const VENDOR_KEY = 'test-vendor-paid-token';

function service(on: Record<string, boolean>, fields?: Record<string, string>) {
  const settings = {
    boolean: (k: string) => Promise.resolve(on[k] ?? false),
  } as unknown as AppSettingsService;
  const get = jest.fn((id: string) =>
    Promise.resolve(
      fields && id === 'bar_vendor_microbilt'
        ? { fields, fingerprint: 'f', slot: null }
        : null,
    ),
  );
  const secrets = { get } as unknown as SecretsService;
  return { svc: new PaidBarVendorService(settings, secrets), get };
}

const saved = {
  apiKey: VENDOR_KEY,
  urlTemplate:
    'https://api.vendor.example/v1/licenses?state={state}&number={bar_number}',
  recordPath: 'data',
  numberPath: 'license_number',
  statusPath: 'status',
  activeValues: 'Active',
  firstNamePath: 'first_name',
  middleNamePath: 'middle_name',
  lastNamePath: 'last_name',
  expiresPath: 'expiration_date',
};

describe('paid bar vendors (owner 2026-11-12: wired, OFF by default)', () => {
  afterEach(() => jest.restoreAllMocks());

  it('every paid service has its switch off by default and a key slot', () => {
    for (const v of PAID_BAR_VENDORS) {
      expect(APP_SETTINGS[v.settingKey]).toBe(false);
      const def = providerById(v.id);
      expect(def).toBeTruthy();
      const fields = def?.fields ?? [];
      expect(fields.find((f) => f.name === 'apiKey')?.secret).toBe(true);
      expect(fields.find((f) => f.name === 'urlTemplate')?.required).toBe(true);
    }
  });

  it('off → never asked, the key is not even read', async () => {
    const { svc, get } = service({}, saved);
    expect(await svc.resolve('WY')).toBeNull();
    expect(get).not.toHaveBeenCalled();
  });

  it('on without a key or URL → still nothing', async () => {
    const { svc } = service({
      'verification.bar_vendor_microbilt_enabled': true,
    });
    expect(await svc.resolve('WY')).toBeNull();
  });

  it('on with a key → generic_rest; the recorded answer passes with the middle name', async () => {
    const { svc } = service(
      { 'verification.bar_vendor_microbilt_enabled': true },
      saved,
    );
    const reg = await svc.resolve('WY');
    expect(reg).toMatchObject({
      stateCode: 'WY',
      adapter: 'generic_rest',
      secret: VENDOR_KEY,
      config: { authType: 'bearer', vendor: 'bar_vendor_microbilt' },
    });
    if (!reg) throw new Error('no registry');
    expect(reg.config.apiKey).toBeUndefined();

    const fetchMock = jest.fn<Promise<unknown>, [URL, RequestInit?]>(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        text: () => Promise.resolve(JSON.stringify(fixture)),
      }),
    );
    global.fetch = fetchMock as unknown as typeof fetch;
    const adapter = new GenericRestAdapter();
    const pass = await adapter.lookup(
      {
        stateCode: 'WY',
        barNumber: '88231',
        firstName: 'Kimberly Anne',
        lastName: 'Wexler',
      },
      reg,
    );
    expect(pass.result).toBe('pass');
    expect(pass.details).toMatchObject({
      licenseStatus: 'active',
      name: 'Kimberly A Wexler',
      registryExpiresAt: '2027-12-31',
    });
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe(
      'https://api.vendor.example/v1/licenses?state=WY&number=88231',
    );
    expect((init?.headers as Record<string, string>).Authorization).toBe(
      `Bearer ${VENDOR_KEY}`,
    );

    // A different middle name → a person looks (never a rejection).
    const other = await adapter.lookup(
      {
        stateCode: 'WY',
        barNumber: '88231',
        firstName: 'Kimberly Joan',
        lastName: 'Wexler',
      },
      reg,
    );
    expect(other).toMatchObject({
      result: 'manual_review',
      details: { reason: 'name_mismatch' },
    });
  });
});
