import type { SecretsService } from '../../../../common/secrets/secrets.service';
import { NyOpenDataAdapter } from './ny-open-data.adapter';
import { normalizeName } from './registry-http';

// Test-only values (not real credentials).
const OLD_T = 'test-old-0001';
const ROW_T = 'test-row-0002';
const APP_T = 'test-app-0003';

const input = {
  stateCode: 'NY',
  barNumber: '6366132',
  firstName: 'Matthew',
  lastName: 'Parenti',
};

function adapter(rows: unknown[] | Error, token?: string) {
  const fetchMock = jest.fn<Promise<unknown>, [string, RequestInit?]>(() =>
    rows instanceof Error
      ? Promise.reject(rows)
      : Promise.resolve({
          ok: true,
          status: 200,
          text: () => Promise.resolve(JSON.stringify(rows)),
        }),
  );
  global.fetch = fetchMock as unknown as typeof fetch;
  const secrets = {
    field: jest.fn(() => Promise.resolve(token)),
  } as unknown as SecretsService;
  return { ny: new NyOpenDataAdapter(secrets), fetchMock };
}

const row = {
  registration_number: '6366132',
  first_name: 'MATTHEW',
  middle_name: 'ALEXANDER',
  last_name: 'PARENTI',
  year_admitted: '2026',
  status: 'Currently registered',
};

describe('NyOpenDataAdapter (owner 2026-10-04)', () => {
  afterEach(() => jest.restoreAllMocks());

  it('number, active status and name match → pass', async () => {
    const { ny, fetchMock } = adapter([row]);
    const out = await ny.lookup(input);
    expect(out.result).toBe('pass');
    expect(out.details).toMatchObject({
      found: true,
      licenseStatus: 'active',
      name: 'MATTHEW ALEXANDER PARENTI',
      admittedAt: '2026',
    });
    expect(String(fetchMock.mock.calls[0][0])).toContain(
      'registration_number=6366132',
    );
  });

  it('keeps a short copy of the registry record', async () => {
    const { ny } = adapter([row]);
    const out = await ny.lookup(input);
    expect(String(out.details.raw)).toContain(
      '"registration_number":"6366132"',
    );
  });

  it("the NY row's token wins over the old integration key", async () => {
    const { ny, fetchMock } = adapter([row], OLD_T);
    await ny.lookup(input, {
      stateCode: 'NY',
      adapter: 'ny_open_data',
      config: {},
      secret: ROW_T,
    });
    expect(fetchMock.mock.calls[0][1]).toMatchObject({
      headers: { 'X-App-Token': ROW_T },
    });
  });

  it('sends the optional app token', async () => {
    const { ny, fetchMock } = adapter([row], APP_T);
    await ny.lookup(input);
    expect(fetchMock.mock.calls[0][1]).toMatchObject({
      headers: { 'X-App-Token': APP_T },
    });
  });

  it('a different first name → manual_review', async () => {
    const { ny } = adapter([row]);
    const out = await ny.lookup({ ...input, firstName: 'Matt' });
    expect(out.result).toBe('manual_review');
    expect(out.details.reason).toBe('name_mismatch');
  });

  it('not registered any more → fail', async () => {
    const { ny } = adapter([{ ...row, status: 'Suspended' }]);
    const out = await ny.lookup(input);
    expect(out.result).toBe('fail');
    expect(out.details).toMatchObject({
      reason: 'not_active',
      licenseStatus: 'inactive',
    });
  });

  it('unknown number → fail', async () => {
    const { ny } = adapter([]);
    expect((await ny.lookup(input)).details.reason).toBe('not_found');
  });

  it('registry errors propagate (AutoBarLookupProvider → manual_review)', async () => {
    const { ny } = adapter(new Error('down'));
    await expect(ny.lookup(input)).rejects.toThrow('down');
  });

  it('normalizes names to letters only', () => {
    expect(normalizeName("O'Brien-Smith")).toBe(normalizeName('OBRIEN SMITH'));
    expect(normalizeName('José')).toBe('JOSE');
  });
});
