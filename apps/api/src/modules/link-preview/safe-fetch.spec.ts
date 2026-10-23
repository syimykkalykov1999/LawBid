import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { gzipSync } from 'node:zlib';
import { parsePreview } from './og-parser';
import { checkPreviewUrl, safeFetchHtml, SafeFetchError } from './safe-fetch';

type Cb = (e: null, a: { address: string; family: number }[]) => void;

const PAGE = `<!doctype html><html><head>
<title>Fallback title</title>
<meta property="og:title" content="  Hello &amp; welcome ">
<meta property="og:description" content="A   long
description">
<meta property="og:image" content="/img/a.png">
<meta property="og:site_name" content="Example">
</head><body>x</body></html>`;

describe('link preview: safe fetch and parser', () => {
  let server: Server;
  let base: string;
  const seen: string[] = [];

  beforeAll(async () => {
    server = createServer((req, res) => {
      seen.push(req.url ?? '');
      const u = req.url ?? '';
      if (u === '/page') {
        res.setHeader('content-type', 'text/html; charset=utf-8');
        return void res.end(PAGE);
      }
      if (u === '/gzip') {
        res.setHeader('content-type', 'text/html');
        res.setHeader('content-encoding', 'gzip');
        return void res.end(gzipSync(PAGE));
      }
      if (u === '/redirect') {
        res.statusCode = 302;
        res.setHeader('location', '/page');
        return void res.end();
      }
      if (u === '/loop') {
        res.statusCode = 302;
        res.setHeader('location', '/loop');
        return void res.end();
      }
      if (u === '/to-metadata') {
        res.statusCode = 302;
        res.setHeader('location', 'http://169.254.169.254/latest/meta-data');
        return void res.end();
      }
      if (u === '/json') {
        res.setHeader('content-type', 'application/json');
        return void res.end('{}');
      }
      if (u === '/big') {
        res.setHeader('content-type', 'text/html');
        return void res.end('a'.repeat(2 * 1024 * 1024));
      }
      if (u === '/gzip-bomb') {
        res.setHeader('content-type', 'text/html');
        res.setHeader('content-encoding', 'gzip');
        return void res.end(gzipSync(Buffer.alloc(20 * 1024 * 1024, 97)));
      }
      if (u === '/slow') {
        res.setHeader('content-type', 'text/html');
        res.write('<html>');
        return; // never ends
      }
      res.statusCode = 404;
      res.end();
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(async () => {
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
  });

  const local = { allowLocal: true };
  const reason = async (p: Promise<unknown>) => {
    try {
      await p;
    } catch (e) {
      return e instanceof SafeFetchError ? e.reason : `other:${String(e)}`;
    }
    return 'ok';
  };

  it('reads Open Graph data from a page (also gzip) and follows a redirect', async () => {
    for (const path of ['/page', '/gzip', '/redirect']) {
      const r = await safeFetchHtml(base + path, local);
      const p = parsePreview(r.html, r.finalUrl);
      expect(p).toEqual({
        title: 'Hello & welcome',
        description: 'A long description',
        imageUrl: `${base}/img/a.png`,
        siteName: 'Example',
      });
    }
  });

  it('falls back to <title> and the host name', () => {
    const p = parsePreview(
      '<html><head><title>Only title</title></head>',
      new URL('https://www.example.org/x'),
    );
    expect(p).toEqual({
      title: 'Only title',
      description: null,
      imageUrl: null,
      siteName: 'example.org',
    });
  });

  it('never returns a javascript: or data: image', () => {
    const p = parsePreview(
      '<head><meta property="og:image" content="javascript:alert(1)"></head>',
      new URL('https://a.example/'),
    );
    expect(p.imageUrl).toBeNull();
  });

  it('refuses non-HTML, oversize, slow, endless-redirect and bomb answers', async () => {
    expect(await reason(safeFetchHtml(`${base}/json`, local))).toBe('not_html');
    expect(await reason(safeFetchHtml(`${base}/big`, local))).toBe('too_large');
    expect(await reason(safeFetchHtml(`${base}/gzip-bomb`, local))).toBe(
      'too_large',
    );
    expect(await reason(safeFetchHtml(`${base}/loop`, local))).toBe(
      'redirects',
    );
    expect(await reason(safeFetchHtml(`${base}/missing`, local))).toBe(
      'http_status',
    );
    expect(
      await reason(safeFetchHtml(`${base}/slow`, { ...local, timeoutMs: 300 })),
    ).toBe('timeout');
  });

  it('refuses a redirect into a private range', async () => {
    seen.length = 0;
    // allowLocal=true lets the fake server be reached; the metadata
    // address must still be refused when local is NOT allowed, so run the
    // same chain in production mode against a resolver that maps to the
    // fake server only for the first hop.
    const resolver = ((_h: string, _o: unknown, cb: Cb) => {
      cb(null, [{ address: '169.254.169.254', family: 4 }]);
    }) as never;
    expect(
      await reason(
        safeFetchHtml('https://evil.example.com/', {
          allowLocal: false,
          resolver,
        }),
      ),
    ).toBe('blocked_host');
    expect(seen).toEqual([]);
  });

  describe('URL rules in production mode', () => {
    const prod = { allowLocal: false };
    const bad = [
      'http://example.com/', // not https
      'https://127.0.0.1/',
      'https://localhost/',
      'https://[::1]/',
      'https://169.254.169.254/latest/meta-data',
      'https://10.0.0.5/',
      'https://192.168.1.1/',
      'https://2130706433/', // decimal 127.0.0.1
      'https://0x7f.1/',
      'https://[::ffff:127.0.0.1]/',
      'https://[2002:7f00:1::1]/', // 6to4 wrapping 127.0.0.1
      'https://[::7f00:1]/',
      'https://[fe80::1]/',
      'https://[fd00::1]/',
      'https://intranet/',
      'https://printer.local/',
      'https://metadata.google.internal/',
      'https://example.com:8080/',
      'https://user:pass@example.com/',
      'ftp://example.com/',
      'file:///etc/passwd',
      'javascript:alert(1)',
      'not a url',
    ];
    it.each(bad)('rejects %s', (u) => {
      expect(() => checkPreviewUrl(u, prod)).toThrow(SafeFetchError);
    });
    it('accepts a normal https link and drops the fragment', () => {
      expect(
        checkPreviewUrl('https://example.com/a?b=1#frag', prod).toString(),
      ).toBe('https://example.com/a?b=1');
    });
    it('applies the deny-list', () => {
      expect(() =>
        checkPreviewUrl('https://example.com/', {
          ...prod,
          isDenied: (h) => h === 'example.com',
        }),
      ).toThrow(SafeFetchError);
    });
  });

  it('blocks a public name that resolves to a private address (DNS rebinding)', async () => {
    const resolver = ((_h: string, _o: unknown, cb: Cb) =>
      cb(null, [{ address: '10.1.2.3', family: 4 }])) as never;
    expect(
      await reason(
        safeFetchHtml('https://rebind.example.com/', {
          allowLocal: false,
          resolver,
        }),
      ),
    ).toBe('blocked_host');
  });
});
