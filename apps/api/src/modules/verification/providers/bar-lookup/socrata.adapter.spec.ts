import rows from './__fixtures__/socrata-row.json';
import { SocrataAdapter } from './socrata.adapter';
import type { ResolvedRegistry } from './state-bar-adapter';

// The adapters check that the registry host resolves to a public address.
jest.mock('node:dns/promises', () => ({
  lookup: jest.fn(() =>
    Promise.resolve([{ address: '93.184.216.34', family: 4 }]),
  ),
}));

// Test-only values (not real credentials).
const PORTAL_T = 'test-portal-0001';

const registry: ResolvedRegistry = {
  stateCode: 'NM',
  adapter: 'socrata',
  secret: PORTAL_T,
  config: {
    domain: 'data.example.gov',
    datasetId: 'abcd-1234',
    numberField: 'bar_no',
    firstNameField: 'first',
    lastNameField: 'last',
    statusField: 'member_status',
    admittedField: 'admit_date',
    activeValues: 'active member',
  },
};

const input = {
  stateCode: 'NM',
  barNumber: '41234',
  firstName: 'Saul',
  lastName: 'Goodman',
};

describe('SocrataAdapter (owner 2026-10-05)', () => {
  afterEach(() => jest.restoreAllMocks());

  function mockFetch(body: unknown) {
    const fetchMock = jest.fn<Promise<unknown>, [URL, RequestInit?]>(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        text: () => Promise.resolve(JSON.stringify(body)),
      }),
    );
    global.fetch = fetchMock as unknown as typeof fetch;
    return fetchMock;
  }

  it('queries the dataset by the number column → pass', async () => {
    const fetchMock = mockFetch(rows);
    const out = await new SocrataAdapter().lookup(input, registry);
    expect(out.result).toBe('pass');
    expect(out.details).toMatchObject({
      provider: 'socrata:data.example.gov',
      licenseStatus: 'active',
      admittedAt: '1998-01-15T00:00:00.000',
    });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url.toString()).toBe(
      'https://data.example.gov/resource/abcd-1234.json?bar_no=41234&%24limit=1',
    );
    expect(init).toMatchObject({ headers: { 'X-App-Token': PORTAL_T } });
  });

  it('no row → fail (not_found)', async () => {
    mockFetch([]);
    expect(
      (await new SocrataAdapter().lookup(input, registry)).details.reason,
    ).toBe('not_found');
  });

  it('bad column names never reach the URL', async () => {
    mockFetch(rows);
    await expect(
      new SocrataAdapter().lookup(input, {
        ...registry,
        config: { ...registry.config, numberField: 'bar_no&$where=1' },
      }),
    ).rejects.toThrow('Column names');
  });
});
