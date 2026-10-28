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

describe('GenericRestAdapter POST / session (owner 2026-10-28)', () => {
  const answer = {
    Results: [
      { AttorneyNumber: '9-11', Status: 'Active', FullName: 'Other, Person' },
      { AttorneyNumber: '300123', Status: 'Active', FullName: 'Wexler, Kim' },
    ],
  };

  function session(
    body: string,
    start = '<meta name="csrf-token" content="test-csrf-token">',
  ) {
    const calls: { url: string; init: RequestInit }[] = [];
    const impl = ((u: URL | string, init: RequestInit = {}) => {
      const url = u.toString();
      if (url.endsWith('/robots.txt'))
        return Promise.resolve(new Response('', { status: 404 }));
      calls.push({ url, init });
      return Promise.resolve(
        new Response(url.endsWith('/start') ? start : body, {
          status: 200,
          headers: url.endsWith('/start')
            ? { 'set-cookie': 'sid=1; path=/' }
            : {},
        }),
      );
    }) as typeof fetch;
    return { impl, calls };
  }

  const post = (config: Record<string, string> = {}) =>
    registry(
      {
        urlTemplate: 'https://api.vendor.example/search',
        authType: 'none',
        method: 'POST',
        bodyType: 'json',
        bodyTemplate: '{"AttorneyNumber":"{bar_number}","Name":"{last_name}"}',
        recordPath: 'Results',
        numberPath: 'AttorneyNumber',
        statusPath: 'Status',
        fullNamePath: 'FullName',
        firstNamePath: '',
        lastNamePath: '',
        activeValues: 'Active',
        ...config,
      },
      null,
    );

  it('JSON body (escaped), picks the record with the same number', async () => {
    const s = session(JSON.stringify(answer));
    const out = await new GenericRestAdapter(false, s.impl).lookup(
      { ...input, lastName: 'We"xler' },
      post(),
    );
    expect(out.details).toMatchObject({ found: true, name: 'Wexler, Kim' });
    const [call] = s.calls;
    expect(call.init.method).toBe('POST');
    expect(JSON.parse(call.init.body as string)).toEqual({
      AttorneyNumber: '300123',
      Name: 'We"xler',
    });
    expect((call.init.headers as Record<string, string>)['Content-Type']).toBe(
      'application/json',
    );
  });

  it('form body with a CSRF token and cookie from the start page', async () => {
    const s = session(JSON.stringify(answer));
    const out = await new GenericRestAdapter(false, s.impl).lookup(
      input,
      post({
        bootstrapUrl: 'https://api.vendor.example/start',
        csrfSelector: 'css:meta[name=csrf-token]@content',
        csrfHeader: 'X-CSRF-TOKEN',
        bodyType: 'form',
        bodyTemplate: 'action=Search&n={bar_number}',
        headers: '{"X-Requested-With":"XMLHttpRequest"}',
      }),
    );
    expect(out.result).toBe('pass');
    const h = s.calls[1].init.headers as Record<string, string>;
    expect(h['X-CSRF-TOKEN']).toBe('test-csrf-token');
    expect(h['X-Requested-With']).toBe('XMLHttpRequest');
    expect(h.Cookie).toBe('sid=1');
    expect(s.calls[1].init.body as string).toBe('action=Search&n=300123');
  });

  it('no record with that number / empty body → not_found; not JSON → error', async () => {
    const none = await new GenericRestAdapter(
      false,
      session(JSON.stringify({ Results: [answer.Results[0]] })).impl,
    ).lookup(input, post());
    expect(none.details.reason).toBe('not_found');
    const empty = await new GenericRestAdapter(false, session('').impl).lookup(
      input,
      post(),
    );
    expect(empty.details.reason).toBe('not_found');
    await expect(
      new GenericRestAdapter(false, session('<html>').impl).lookup(
        input,
        post(),
      ),
    ).rejects.toThrow(/not JSON/);
  });
});
