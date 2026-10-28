import { extract, parseHtml } from './html-extract';
import { HtmlPageAdapter } from './html-page.adapter';
import { toIsoDate } from './registry-http';
import { RegistryRateLimitedError } from './registry-session';
import { clearRobotsCache } from './robots';
import type { ResolvedRegistry } from './state-bar-adapter';
import { formatBarNumber } from './state-bar-adapter';

jest.mock('node:dns/promises', () => ({
  lookup: jest.fn(() =>
    Promise.resolve([{ address: '93.184.216.34', family: 4 }]),
  ),
}));

const PAGE = `<html><body>
<h2 class="name">Jane Q. Example</h2>
<dl><dt>Bar No.</dt><dd>00123</dd><dt>Status</dt><dd>Active</dd></dl>
<table><tr><td><b>Admitted:</b></td><td>March 3, 2004</td></tr></table>
<p><strong>Valid until:</strong> 12/31/2027<br><strong>Firm:</strong> Example LLP</p>
<div class="b"><span>Good Standing</span></div>
</body></html>`;

const registry = (config: Record<string, string>): ResolvedRegistry => ({
  stateCode: 'ZZ',
  adapter: 'html_page',
  config: {
    urlTemplate: 'https://bar.example/attorney/{bar_number}',
    nameSelector: 'css:h2.name',
    numberSelector: 'label:Bar No.',
    statusSelector: 'label:Status',
    activeValues: 'Active',
    admittedSelector: 'label:Admitted:',
    expiresSelector: 'label:Valid until:',
    firmSelector: 'label:Firm:',
    ...config,
  },
  secret: null,
});

function stub(
  ...answers: {
    status?: number;
    body?: string;
    headers?: Record<string, string>;
  }[]
) {
  const calls: { url: string; init: RequestInit }[] = [];
  let i = 0;
  const impl = ((u: URL | string, init: RequestInit = {}) => {
    if (u.toString().endsWith('/robots.txt')) {
      return Promise.resolve(new Response('', { status: 404 }));
    }
    calls.push({ url: u.toString(), init });
    const a = answers[Math.min(i, answers.length - 1)];
    i += 1;
    const status = a.status ?? 200;
    return Promise.resolve(
      new Response(status >= 300 && status < 400 ? null : (a.body ?? ''), {
        status,
        headers: a.headers,
      }),
    );
  }) as typeof fetch;
  return { impl, calls };
}

const input = {
  stateCode: 'ZZ',
  barNumber: ' 123 ',
  firstName: 'Jane',
  lastName: 'Example',
};

describe('HtmlPageAdapter (owner 2026-10-28)', () => {
  beforeEach(() => clearRobotsCache());

  it('reads name, number, status, dates and firm with css / label selectors', async () => {
    const s = stub({ body: PAGE });
    const out = await new HtmlPageAdapter(false, s.impl).lookup(
      input,
      registry({ numberPad: '5' }),
    );
    expect(out.result).toBe('pass');
    expect(out.details).toMatchObject({
      provider: 'html_page:ZZ',
      found: true,
      name: 'Jane Q. Example',
      registryStatus: 'Active',
      admittedAt: 'March 3, 2004',
      firm: 'Example LLP',
      registryExpiresAt: '2027-12-31',
      sourceUrl: 'https://bar.example/attorney/00123',
    });
    expect(s.calls[0].url).toBe('https://bar.example/attorney/00123');
    expect(s.calls[0].init.redirect).toBe('manual');
  });

  it('another number on the page → not_found', async () => {
    const s = stub({ body: PAGE.replace('00123', '00999') });
    const out = await new HtmlPageAdapter(false, s.impl).lookup(
      input,
      registry({}),
    );
    expect(out.result).toBe('fail');
    expect(out.details.reason).toBe('not_found');
  });

  it('a status outside the active list → fail not_active', async () => {
    const s = stub({
      body: PAGE.replace('<dd>Active</dd>', '<dd>Suspended</dd>'),
    });
    const out = await new HtmlPageAdapter(false, s.impl).lookup(
      input,
      registry({}),
    );
    expect(out.result).toBe('fail');
    expect(out.details).toMatchObject({
      reason: 'not_active',
      licenseStatus: 'inactive',
    });
  });

  it('no status selector → a match is manual_review (status_unknown)', async () => {
    const s = stub({ body: PAGE });
    const out = await new HtmlPageAdapter(false, s.impl).lookup(
      input,
      registry({ statusSelector: '' }),
    );
    expect(out.result).toBe('manual_review');
    expect(out.details).toMatchObject({
      reason: 'status_unknown',
      licenseStatus: null,
    });
  });

  it('POST form after a start page: hidden fields, cookie and Referer', async () => {
    const start = `<form><input type="hidden" name="__VIEWSTATE" value="vs1"><input type="text" name="q"></form>`;
    const s = stub(
      { body: start, headers: { 'set-cookie': 'sid=abc; path=/' } },
      { body: PAGE },
    );
    const out = await new HtmlPageAdapter(false, s.impl).lookup(
      input,
      registry({
        bootstrapUrl: 'https://bar.example/search',
        bootstrapHidden: 'yes',
        urlTemplate: 'https://bar.example/search',
        method: 'POST',
        bodyTemplate: 'num={bar_number}&go=Find',
        numberFormat: 'digits',
      }),
    );
    expect(out.result).toBe('pass');
    const post = s.calls[1];
    expect(post.init.method).toBe('POST');
    const form = new URLSearchParams(post.init.body as string);
    expect(form.get('__VIEWSTATE')).toBe('vs1');
    expect(form.get('num')).toBe('123');
    const h = post.init.headers as Record<string, string>;
    expect(h.Cookie).toBe('sid=abc');
    expect(h.Referer).toBe('https://bar.example/search');
    expect(h['Content-Type']).toBe('application/x-www-form-urlencoded');
  });

  it('HTTP 429 → RegistryRateLimitedError with Retry-After', async () => {
    const s = stub({ status: 429, headers: { 'retry-after': '120' } });
    const err = await new HtmlPageAdapter(false, s.impl)
      .lookup(input, registry({}))
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(RegistryRateLimitedError);
    expect((err as RegistryRateLimitedError).retryAfterSeconds).toBe(120);
  });

  it('HTTP 403 / 500 → error (the caller turns it into manual_review)', async () => {
    for (const status of [403, 500]) {
      const s = stub({ status, body: 'blocked' });
      await expect(
        new HtmlPageAdapter(false, s.impl).lookup(input, registry({})),
      ).rejects.toThrow(`HTTP ${status}`);
    }
  });

  it('refuses plain http and private hosts in production', async () => {
    const s = stub({ body: PAGE });
    await expect(
      new HtmlPageAdapter(false, s.impl).lookup(
        input,
        registry({ urlTemplate: 'http://bar.example/{bar_number}' }),
      ),
    ).rejects.toThrow(/https/);
    await expect(
      new HtmlPageAdapter(false, s.impl).lookup(
        input,
        registry({ urlTemplate: 'https://127.0.0.1/{bar_number}' }),
      ),
    ).rejects.toThrow(/private/);
    expect(s.calls).toHaveLength(0);
  });

  it('a page without the name selector set is refused', async () => {
    await expect(
      new HtmlPageAdapter().lookup(input, registry({ nameSelector: '' })),
    ).rejects.toThrow(/name selector/);
  });
});

describe('html-extract selectors', () => {
  const doc = parseHtml(PAGE);
  it.each([
    ['css:h2.name', 'Jane Q. Example'],
    ['h2.name', 'Jane Q. Example'],
    ['css:h2@class', 'name'],
    ['label:Bar No.', '00123'],
    ['label:Valid until:', '12/31/2027'],
    ['regex:Firm:\\s*(\\w+ \\w+)', 'Example LLP'],
    ['label:Status && css:.b span', 'Active / Good Standing'],
    ['css:h2.name|re:^(\\w+)', 'Jane'],
    ['css:h2.name|re:^(\\w+) ++ label:Status', 'Jane Active'],
    ['css:.missing', null],
    ['label:Nothing here', null],
  ])('%s → %s', (sel, want) => {
    expect(extract(doc, doc.root, sel)).toBe(want);
  });

  it('bad selectors are readable errors', () => {
    expect(() => extract(doc, doc.root, 'css:[[[')).toThrow(/Bad CSS/);
    expect(() => extract(doc, doc.root, 'regex:(')).toThrow(/Bad pattern/);
  });
});

describe('number and date helpers', () => {
  it.each([
    [' 123 ', {}, '123'],
    ['A-123', { numberFormat: 'digits' }, '123'],
    ['8000', { numberPad: '5' }, '08000'],
    ['0001000', { numberPad: '6' }, '001000'],
    ['10000', { numberPad: '12' }, '000000010000'],
    ['7187-45', {}, '7187-45'],
  ])('formatBarNumber(%p, %p) = %p', (raw, cfg, want) => {
    expect(formatBarNumber(raw, cfg as Record<string, string>)).toBe(want);
  });

  it.each([
    ['10/26/1992', '1992-10-26'],
    ['1965-09-29', '1965-09-29'],
    ['October 9, 1979', '1979-10-09'],
    ['10-29-1984', '1984-10-29'],
    ['Sept 3, 2001', '2001-09-03'],
    ['2/30/2001', null],
    ['N/A', null],
    ['', null],
  ])('toIsoDate(%p) = %p', (raw, want) => {
    expect(toIsoDate(raw)).toBe(want);
  });
});
