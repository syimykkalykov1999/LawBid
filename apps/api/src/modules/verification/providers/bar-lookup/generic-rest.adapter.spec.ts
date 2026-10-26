import found from './__fixtures__/vendor-found.json';
import inactive from './__fixtures__/vendor-inactive.json';
import empty from './__fixtures__/vendor-empty.json';
import { GenericRestAdapter } from './generic-rest.adapter';
import type { ResolvedRegistry } from './state-bar-adapter';

// The adapters check that the registry host resolves to a public address.
jest.mock('node:dns/promises', () => ({
  lookup: jest.fn(() =>
    Promise.resolve([{ address: '93.184.216.34', family: 4 }]),
  ),
}));

// Test-only value (not a real credential).
const VENDOR_A = 'test-vendor-1234';

const input = {
  stateCode: 'CA',
  barNumber: ' 300123 ',
  firstName: 'Kim',
  lastName: 'Wexler',
};

const registry = (
  config: Record<string, string> = {},
  secret: string | null = VENDOR_A,
): ResolvedRegistry => ({
  stateCode: 'CA',
  adapter: 'generic_rest',
  secret,
  config: {
    urlTemplate:
      'https://api.vendor.example/v1/licenses?state={state}&number={bar_number}',
    authType: 'header',
    authName: 'X-API-Key',
    recordPath: 'results',
    statusPath: 'status',
    firstNamePath: 'person.first',
    lastNamePath: 'person.last',
    admittedPath: 'admitted',
    activeValues: 'Active, Active - Good Standing',
    profileUrl: 'https://vendor.example/attorney/{bar_number}',
    ...config,
  },
});

function mockFetch(status: number, body: unknown) {
  const fetchMock = jest.fn<Promise<unknown>, [URL, RequestInit?]>(() =>
    Promise.resolve({
      ok: status >= 200 && status < 300,
      status,
      text: () => Promise.resolve(JSON.stringify(body)),
    }),
  );
  global.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

describe('GenericRestAdapter (owner 2026-10-05)', () => {
  const adapter = new GenericRestAdapter();
  afterEach(() => jest.restoreAllMocks());

  it('active + same name → pass, with URL, key header and record copy', async () => {
    const fetchMock = mockFetch(200, found);
    const out = await adapter.lookup(input, registry());
    expect(out.result).toBe('pass');
    expect(out.details).toMatchObject({
      provider: 'generic_rest:api.vendor.example',
      found: true,
      licenseStatus: 'active',
      registryStatus: 'Active',
      admittedAt: '2009-06-01',
      sourceUrl: 'https://vendor.example/attorney/%20300123%20',
    });
    expect(String(out.details.raw)).toContain('"license_number":"300123"');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url.toString()).toBe(
      'https://api.vendor.example/v1/licenses?state=CA&number=300123',
    );
    expect(init).toMatchObject({
      redirect: 'error',
      headers: { 'X-API-Key': VENDOR_A },
    });
  });

  it('bearer and query keys', async () => {
    const f1 = mockFetch(200, found);
    await adapter.lookup(input, registry({ authType: 'bearer' }));
    expect(f1.mock.calls[0][1]).toMatchObject({
      headers: { Authorization: `Bearer ${VENDOR_A}` },
    });
    const f2 = mockFetch(200, found);
    await adapter.lookup(
      input,
      registry({ authType: 'query', authName: 'api_key' }),
    );
    expect(f2.mock.calls[0][0].searchParams.get('api_key')).toBe(VENDOR_A);
  });

  it('a different last name → manual_review (name_mismatch)', async () => {
    mockFetch(200, found);
    const out = await adapter.lookup(
      { ...input, lastName: 'McGill' },
      registry(),
    );
    expect(out.result).toBe('manual_review');
    expect(out.details.reason).toBe('name_mismatch');
  });

  it('full name only: both names inside it', async () => {
    mockFetch(200, found);
    const out = await adapter.lookup(
      { ...input, firstName: 'Kimberly' },
      registry({
        firstNamePath: '',
        lastNamePath: '',
        fullNamePath: 'person.full',
      }),
    );
    expect(out.result).toBe('pass');
  });

  it('inactive status → fail (not_active)', async () => {
    mockFetch(200, inactive);
    const out = await adapter.lookup(input, registry());
    expect(out.result).toBe('fail');
    expect(out.details).toMatchObject({
      reason: 'not_active',
      licenseStatus: 'inactive',
    });
  });

  it('empty list or HTTP 404 → fail (not_found)', async () => {
    mockFetch(200, empty);
    expect((await adapter.lookup(input, registry())).details.reason).toBe(
      'not_found',
    );
    mockFetch(404, { error: 'no such license' });
    expect((await adapter.lookup(input, registry())).details.reason).toBe(
      'not_found',
    );
  });

  it('no status path: any record found counts as active', async () => {
    mockFetch(200, inactive);
    const out = await adapter.lookup(input, registry({ statusPath: '' }));
    expect(out.result).toBe('pass');
  });

  it('a refused key and server errors throw (→ manual review upstream)', async () => {
    mockFetch(401, {});
    await expect(adapter.lookup(input, registry())).rejects.toThrow(
      'refused the key',
    );
    mockFetch(500, {});
    await expect(adapter.lookup(input, registry())).rejects.toThrow('HTTP 500');
  });

  it('missing key or a local address is refused before any call', async () => {
    const fetchMock = mockFetch(200, found);
    await expect(adapter.lookup(input, registry({}, null))).rejects.toThrow(
      'API key',
    );
    await expect(
      adapter.lookup(
        input,
        registry({
          urlTemplate: 'https://169.254.169.254/latest/{bar_number}',
        }),
      ),
    ).rejects.toThrow('private');
    await expect(
      adapter.lookup(
        input,
        registry({ urlTemplate: 'http://api.vendor.example/{bar_number}' }),
      ),
    ).rejects.toThrow('https');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
