import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { clearRobotsCache } from './robots';
import { StatePresetAdapter } from './state-preset.adapter';
import {
  MANUAL_REASONS,
  registrySupport,
  STATE_PRESETS,
} from './state-presets';

// The registry hosts must resolve to a public address.
jest.mock('node:dns/promises', () => ({
  lookup: jest.fn(() =>
    Promise.resolve([{ address: '93.184.216.34', family: 4 }]),
  ),
}));

/**
 * Owner 2026-10-28: every ready-made state preset against a page with the
 * structure its registry answered with on 2026-10-28 (synthetic attorney
 * "Jane Q. Example", no real person's data), found and not found.
 */

const fx = (name: string) =>
  readFileSync(join(__dirname, '__fixtures__', 'presets', name), 'utf8');

interface Route {
  method?: 'GET' | 'POST';
  match: RegExp;
  status?: number;
  body?: string;
  headers?: Record<string, string>;
}

interface Call {
  method: string;
  url: string;
  headers: Record<string, string>;
  body: string;
}

function fakeFetch(routes: Route[]) {
  const calls: Call[] = [];
  const impl = ((input: URL | string, init: RequestInit = {}) => {
    const url = input.toString();
    const method = (init.method ?? 'GET').toUpperCase();
    calls.push({
      method,
      url,
      headers: { ...(init.headers as Record<string, string>) },
      body: typeof init.body === 'string' ? init.body : '',
    });
    if (url.endsWith('/robots.txt')) {
      return Promise.resolve(new Response('', { status: 404 }));
    }
    const r = routes.find(
      (x) => x.match.test(url) && (!x.method || x.method === method),
    );
    if (!r) {
      return Promise.resolve(new Response('nope', { status: 500 }));
    }
    const status = r.status ?? 200;
    return Promise.resolve(
      new Response(status >= 300 && status < 400 ? null : (r.body ?? ''), {
        status,
        headers: r.headers ?? {},
      }),
    );
  }) as typeof fetch;
  return {
    impl,
    calls: () => calls.filter((c) => !c.url.endsWith('/robots.txt')),
  };
}

const reg = (stateCode: string) => ({
  stateCode,
  adapter: 'state_preset' as const,
  config: {},
  secret: null,
});

async function run(
  state: string,
  barNumber: string,
  routes: Route[],
  name: [string, string] = ['Jane', 'Example'],
) {
  clearRobotsCache();
  const f = fakeFetch(routes);
  const out = await new StatePresetAdapter(false, f.impl).lookup(
    { stateCode: state, barNumber, firstName: name[0], lastName: name[1] },
    reg(state),
  );
  return { out, d: out.details, calls: f.calls() };
}

describe('state presets (owner 2026-10-28)', () => {
  it('every state is either a preset, NY open data or manual with a reason', () => {
    const all =
      'AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY'.split(
        ' ',
      );
    expect(all).toHaveLength(51);
    for (const st of all) {
      const s = registrySupport(st);
      if (s.mode === 'manual') expect(MANUAL_REASONS[st]).toBeTruthy();
      expect(Boolean(STATE_PRESETS[st]) && Boolean(MANUAL_REASONS[st])).toBe(
        false,
      );
    }
    expect(Object.keys(STATE_PRESETS).sort()).toEqual(
      'AR CA CO FL IN MO MS NC ND OH OK OR PA TX WA'.split(' '),
    );
    // Captcha, login, robots.txt bans: never automatic.
    for (const st of ['CT', 'ME', 'MN', 'WI', 'DC', 'RI', 'NH']) {
      expect(registrySupport(st).mode).toBe('manual');
    }
  });

  it('CA: profile page → pass with name, status and admission', async () => {
    const { out, d, calls } = await run('CA', '123456', [
      { match: /Licensee\/Detail\/123456$/, body: fx('ca.found.html') },
    ]);
    expect(out.result).toBe('pass');
    expect(d).toMatchObject({
      provider: 'preset:CA',
      found: true,
      name: 'Jane Quinn Example',
      registryStatus: 'Active',
      licenseStatus: 'active',
      admittedAt: '6/14/2001',
      sourceUrl: 'https://apps.calbar.ca.gov/attorney/Licensee/Detail/123456',
    });
    expect(calls[0].headers['User-Agent']).toMatch(/LawBid-LicenseCheck/);
  });

  it('CA: number without a public profile → not_found', async () => {
    const { out, d } = await run('CA', '9999999', [
      { match: /Licensee\/Detail/, body: fx('ca.none.html') },
    ]);
    expect(out.result).toBe('fail');
    expect(d.reason).toBe('not_found');
  });

  it('CO: profile, status after the screen-reader caption', async () => {
    const { out, d } = await run('CO', '54321', [
      { match: /regnum=54321/, body: fx('co.found.html') },
    ]);
    expect(out.result).toBe('pass');
    expect(d).toMatchObject({
      name: 'JANE QUINN EXAMPLE',
      registryStatus: 'ACTIVE',
      admittedAt: 'October 9, 2005',
      firm: 'EXAMPLE LAW LLC',
    });
    const none = await run('CO', '99999999', [
      { match: /regnum=/, body: fx('co.none.html') },
    ]);
    expect(none.d.reason).toBe('not_found');
  });

  it('FL: start page cookie is sent with the profile request', async () => {
    const { out, d, calls } = await run('FL', '123456', [
      {
        match: /find-mbr\/$/,
        body: fx('fl.start.html'),
        headers: { 'set-cookie': 'cf_test=abc; path=/; secure' },
      },
      { match: /profile\/\?num=123456/, body: fx('fl.found.html') },
    ]);
    expect(out.result).toBe('pass');
    expect(d).toMatchObject({
      registryStatus:
        'Member in Good Standing / Eligible to Practice Law in Florida',
      admittedAt: '05/18/2001',
    });
    expect(calls[1].headers.Cookie).toBe('cf_test=abc');
    const none = await run('FL', '1', [
      { match: /find-mbr\/$/, body: fx('fl.start.html') },
      { match: /profile/, body: fx('fl.none.html') },
    ]);
    expect(none.d.reason).toBe('not_found');
  });

  it('IN: POST JSON, the record with the same number', async () => {
    const { out, d, calls } = await run('IN', '12345-49', [
      {
        method: 'POST',
        match: /roll-of-attorneys\/search/,
        body: fx('in.found.json'),
      },
    ]);
    expect(out.result).toBe('pass');
    expect(d).toMatchObject({
      name: 'Example, Jane Q.',
      registryStatus: 'Active In Good Standing',
      admittedAt: '2001-09-29',
    });
    expect(calls[0].method).toBe('POST');
    expect(JSON.parse(calls[0].body)).toEqual({
      AttorneyNumber: '12345-49',
      Page: 1,
    });
    expect(calls[0].headers['Content-Type']).toBe('application/json');
    const none = await run('IN', '99999-49', [
      { method: 'POST', match: /search/, body: fx('in.none.json') },
    ]);
    expect(none.d.reason).toBe('not_found');
  });

  it('MO: ASP.NET form — hidden fields of the start page are posted back', async () => {
    const { out, d, calls } = await run('MO', '30001', [
      {
        method: 'GET',
        match: /Lawyer_Directory\.aspx$/,
        body: fx('mo.start.html'),
      },
      {
        method: 'POST',
        match: /Lawyer_Directory\.aspx$/,
        body: fx('mo.result.html'),
      },
    ]);
    expect(out.result).toBe('pass');
    expect(d.registryStatus).toBe('Active');
    const form = new URLSearchParams(calls[1].body);
    expect(form.get('__VIEWSTATE')).toBe('test-viewstate');
    expect(
      form.get(
        'ctl01$TemplateBody$WebPartManager1$gwpciLawyerDirectory$ciLawyerDirectory$ResultsGrid$Sheet0$Input4$TextBox1',
      ),
    ).toBe('30001');
    expect(calls[1].headers.Referer).toMatch(/Lawyer_Directory\.aspx$/);
  });

  it('MO: two rows for one number → error (the caller sends it to a verifier)', async () => {
    await expect(
      run('MO', '30001', [
        { method: 'GET', match: /Lawyer_Directory/, body: fx('mo.start.html') },
        { method: 'POST', match: /Lawyer_Directory/, body: fx('mo.two.html') },
      ]),
    ).rejects.toThrow(/several attorneys/);
  });

  it('MS: roll without a status → manual_review (status_unknown)', async () => {
    const { out, d, calls } = await run('MS', '10001', [
      { method: 'POST', match: /brdetail\.php/, body: fx('ms.found.html') },
    ]);
    expect(out.result).toBe('manual_review');
    expect(d).toMatchObject({
      reason: 'status_unknown',
      found: true,
      name: 'Example, Jane Q.',
      admittedAt: '4/27/2001',
      licenseStatus: null,
    });
    expect(calls[0].body).toBe('brnum=10001');
    const none = await run('MS', '1', [
      { method: 'POST', match: /brdetail/, body: fx('ms.none.html') },
    ]);
    expect(none.out.result).toBe('fail');
  });

  it('AR: roll without a status → manual_review; empty grid → not_found', async () => {
    const routes = (result: string): Route[] => [
      {
        method: 'GET',
        match: /attorneysearch\.aspx$/,
        body: fx('ar.start.html'),
      },
      { method: 'POST', match: /attorneysearch\.aspx$/, body: fx(result) },
    ];
    const found = await run('AR', '90100', routes('ar.result.html'), [
      'Jane',
      'Example',
    ]);
    expect(found.out.result).toBe('manual_review');
    expect(found.d).toMatchObject({
      name: 'Jane Quinn Example',
      admittedAt: '8/27/1990',
    });
    const none = await run('AR', '1', routes('ar.none.html'));
    expect(none.d.reason).toBe('not_found');
  });

  it('NC: form POST, redirect to the results page (same host), cookies kept', async () => {
    const { out, d, calls } = await run('NC', '23456', [
      {
        method: 'GET',
        match: /search\.aspx$/,
        body: fx('nc.start.html'),
        headers: { 'set-cookie': 'ASP.NET_SessionId=s1; path=/' },
      },
      {
        method: 'POST',
        match: /search\.aspx$/,
        status: 302,
        headers: { location: '/Verification/results.aspx' },
      },
      { method: 'GET', match: /results\.aspx$/, body: fx('nc.results.html') },
    ]);
    expect(out.result).toBe('pass');
    expect(d.name).toBe('Ms. Jane Q. Example');
    expect(calls.map((c) => c.method)).toEqual(['GET', 'POST', 'GET']);
    expect(calls[2].headers.Cookie).toBe('ASP.NET_SessionId=s1');
  });

  it('ND: zero-padded number; 404 → not_found', async () => {
    const { out, d, calls } = await run('ND', '6789', [
      { match: /lawyers\/06789$/, body: fx('nd.found.html') },
    ]);
    expect(out.result).toBe('pass');
    expect(d).toMatchObject({
      registryStatus: 'Active',
      admittedAt: '08/29/2014',
      firm: 'Example Law PLLC',
    });
    expect(calls[0].url).toBe('https://www.ndcourts.gov/lawyers/06789');
    const none = await run('ND', '99999', [
      { match: /lawyers/, status: 404, body: fx('nd.none.html') },
    ]);
    expect(none.d.reason).toBe('not_found');
  });

  it('OH: CSRF token from the start page goes in the X-CSRF-TOKEN header', async () => {
    const { out, d, calls } = await run('OH', '76543', [
      { method: 'GET', match: /AttorneySearch\/$/, body: fx('oh.start.html') },
      { method: 'POST', match: /Ajax\.ashx$/, body: fx('oh.found.json') },
    ]);
    expect(out.result).toBe('pass');
    expect(d).toMatchObject({
      registryStatus: 'Active',
      admittedAt: '10-29-2004',
    });
    expect(calls[1].headers['X-CSRF-TOKEN']).toBe('test-csrf-token');
    expect(new URLSearchParams(calls[1].body).get('attyReg')).toBe('76543');
    // Empty answer = not found.
    const none = await run('OH', '1', [
      { method: 'GET', match: /AttorneySearch\/$/, body: fx('oh.start.html') },
      { method: 'POST', match: /Ajax\.ashx$/, body: '' },
    ]);
    expect(none.d.reason).toBe('not_found');
  });

  it('OK: picks the card with the same Bar ID among several', async () => {
    const { out, d } = await run('OK', '8429', [
      { match: /keyword=8429/, body: fx('ok.found.html') },
    ]);
    expect(out.result).toBe('pass');
    expect(d).toMatchObject({
      name: 'Jane Quinn Example',
      registryStatus: 'Active / Good Standing',
      admittedAt: 'October 14, 2002',
    });
    const none = await run('OK', '1', [
      { match: /keyword/, body: fx('ok.none.html') },
    ]);
    expect(none.d.reason).toBe('not_found');
  });

  it('OR: Referer of the search page; redirect to the start page = not found', async () => {
    const { out, calls } = await run('OR', '987654', [
      {
        match: /membersearch_display\.asp\?b=987654/,
        body: fx('or.found.html'),
      },
    ]);
    expect(out.result).toBe('pass');
    expect(calls[0].headers.Referer).toBe(
      'https://www.osbar.org/members/membersearch_start.asp',
    );
    const none = await run('OR', '1', [
      {
        match: /membersearch_display/,
        status: 302,
        headers: { location: '/members/membersearch_start.asp?e=3&clue=2' },
      },
      { match: /membersearch_start/, body: fx('or.start.html') },
    ]);
    expect(none.d.reason).toBe('not_found');
  });

  it('PA: profile → pass; 404 → not_found', async () => {
    const { out, d } = await run('PA', '50001', [
      { match: /attorney-detail\/50001$/, body: fx('pa.found.html') },
    ]);
    expect(out.result).toBe('pass');
    expect(d).toMatchObject({
      name: 'Example, Jane Q.',
      admittedAt: '11/17/2007',
      firm: 'Example Law LLC',
    });
    const none = await run('PA', '1', [
      { match: /attorney-detail/, status: 404 },
    ]);
    expect(none.d.reason).toBe('not_found');
  });

  it('TX: search by bar card, then the linked profile', async () => {
    const { out, d, calls } = await run(
      'TX',
      '24012345',
      [
        {
          method: 'POST',
          match: /Result_form_client\.cfm/,
          body: fx('tx.results.html'),
        },
        {
          method: 'GET',
          match: /MemberDirectoryDetail\.cfm&ContactID=100001/,
          body: fx('tx.profile.html'),
        },
      ],
      ['Jane', 'Example'],
    );
    expect(out.result).toBe('pass');
    expect(d).toMatchObject({
      name: 'Jane Q. Example',
      registryStatus: 'Eligible to Practice in Texas',
      admittedAt: '11/08/2005',
    });
    expect(new URLSearchParams(calls[0].body).get('BarCardNumber')).toBe(
      '24012345',
    );
    const none = await run('TX', '1', [
      { method: 'POST', match: /Result_form_client/, body: fx('tx.none.html') },
    ]);
    expect(none.d.reason).toBe('not_found');
  });

  it('WA: start page sets cookies (via a redirect), 12-digit number', async () => {
    const { out, d, calls } = await run('WA', '45678', [
      {
        match: /LegalDirectory\.aspx$/,
        status: 302,
        headers: {
          location: '/SSO/Login.aspx?vi=7',
          'set-cookie': 'ASP.NET_SessionId=w1; path=/; secure; HttpOnly',
        },
      },
      { match: /SSO\/Login\.aspx/, body: fx('wa.start.html') },
      { match: /Usr_ID=000000045678$/, body: fx('wa.found.html') },
    ]);
    expect(out.result).toBe('pass');
    expect(d).toMatchObject({
      registryStatus: 'Active / Yes',
      admittedAt: '5/14/2009',
    });
    expect(calls[2].headers.Cookie).toBe('ASP.NET_SessionId=w1');
    const none = await run('WA', '1', [
      { match: /LegalDirectory\.aspx$/, body: fx('wa.start.html') },
      { match: /LegalProfile/, body: fx('wa.none.html') },
    ]);
    expect(none.d.reason).toBe('not_found');
  });

  it('a different name on a found record → manual_review (name_mismatch)', async () => {
    const { out, d } = await run(
      'PA',
      '50001',
      [{ match: /attorney-detail\/50001$/, body: fx('pa.found.html') }],
      ['Saul', 'Goodman'],
    );
    expect(out.result).toBe('manual_review');
    expect(d.reason).toBe('name_mismatch');
  });

  it('robots.txt that disallows the page → error, no page request', async () => {
    clearRobotsCache();
    const calls: string[] = [];
    const impl = ((u: URL | string) => {
      calls.push(u.toString());
      return Promise.resolve(
        u.toString().endsWith('/robots.txt')
          ? new Response('User-agent: *\nDisallow: /lawyers/\n', {
              status: 200,
            })
          : new Response(fx('nd.found.html')),
      );
    }) as typeof fetch;
    await expect(
      new StatePresetAdapter(false, impl).lookup(
        {
          stateCode: 'ND',
          barNumber: '6789',
          firstName: 'Jane',
          lastName: 'Example',
        },
        reg('ND'),
      ),
    ).rejects.toThrow(/robots\.txt/);
    expect(calls).toEqual(['https://www.ndcourts.gov/robots.txt']);
  });

  it('a redirect to another site is refused', async () => {
    await expect(
      run('PA', '50001', [
        {
          match: /attorney-detail/,
          status: 302,
          headers: { location: 'https://evil.example/x' },
        },
      ]),
    ).rejects.toThrow(/another site/);
  });

  it('a state without a preset is refused', async () => {
    await expect(
      new StatePresetAdapter().lookup(
        { stateCode: 'MN', barNumber: '1', firstName: 'A', lastName: 'B' },
        reg('MN'),
      ),
    ).rejects.toThrow(/No ready-made/);
  });
});
