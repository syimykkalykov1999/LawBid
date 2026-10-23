import { lookup as dnsLookup } from 'node:dns';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { isIP } from 'node:net';
import { createBrotliDecompress, createGunzip, createInflate } from 'node:zlib';
import { isPrivateAddress } from '../../common/net/private-address';

/**
 * Owner 2026-10-22: the SSRF-safe GET behind the chat link previews.
 *
 * Telegram, Slack and Instagram all fetch the page on the server, so the
 * server is the thing an attacker aims at ("preview http://169.254.169.254/").
 * Defence in depth:
 *  - https only (http and local hosts only when `allowLocal`: dev and tests);
 *  - the DNS answer is checked by the socket's own lookup, so the address
 *    that is validated is the address that is connected to (no
 *    check-then-connect gap for DNS rebinding);
 *  - every redirect hop (max 3) goes through the same checks again;
 *  - 5 s for the whole exchange, 1 MB of body (after decompression), only
 *    text/html answers, no cookies, no credentials in the URL.
 */
export const PREVIEW_TIMEOUT_MS = 5_000;
export const PREVIEW_MAX_BYTES = 1024 * 1024;
export const PREVIEW_MAX_REDIRECTS = 3;
const USER_AGENT =
  'Mozilla/5.0 (compatible; LawBidLinkPreview/1.0; +https://lawbid.app)';

export type FetchFailure =
  | 'invalid_url'
  | 'blocked_host'
  | 'dns'
  | 'timeout'
  | 'too_large'
  | 'not_html'
  | 'http_status'
  | 'redirects'
  | 'network';

export class SafeFetchError extends Error {
  constructor(
    readonly reason: FetchFailure,
    message?: string,
  ) {
    super(message ?? reason);
  }
}

export interface SafeFetchOptions {
  /** http and private/loopback hosts allowed (dev and tests only). */
  allowLocal: boolean;
  /** Extra host check (the admin's deny-list), applied to every hop. */
  isDenied?: (host: string) => boolean;
  timeoutMs?: number;
  maxBytes?: number;
  /** Test hook: replaces dns.lookup. */
  resolver?: typeof dnsLookup;
}

export interface SafeFetchResult {
  finalUrl: URL;
  html: string;
  status: number;
}

/** Hostnames that are never public, whatever DNS says. */
export function isLocalHostname(host: string): boolean {
  const h = host.toLowerCase().replace(/\.$/, '');
  return (
    h === 'localhost' ||
    h.endsWith('.localhost') ||
    h.endsWith('.local') ||
    h.endsWith('.internal') ||
    h.endsWith('.lan') ||
    h.endsWith('.home.arpa') ||
    isPrivateAddress(h)
  );
}

/** The URL the person pasted → a URL we may fetch, or a reason why not. */
export function checkPreviewUrl(
  raw: string,
  opts: Pick<SafeFetchOptions, 'allowLocal' | 'isDenied'>,
): URL {
  if (raw.length > 2048) throw new SafeFetchError('invalid_url');
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new SafeFetchError('invalid_url');
  }
  if (url.username || url.password) throw new SafeFetchError('invalid_url');
  const okProtocol =
    url.protocol === 'https:' || (opts.allowLocal && url.protocol === 'http:');
  if (!okProtocol) throw new SafeFetchError('invalid_url');
  const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (!host) throw new SafeFetchError('invalid_url');
  if (!opts.allowLocal) {
    // Literal addresses (WHATWG URL has already normalised 0x7f.1 and
    // decimal forms to dotted quads) and bare names are refused; a real
    // site has a dotted public name.
    if (isIP(host) !== 0 || !host.includes('.') || isLocalHostname(host)) {
      throw new SafeFetchError('blocked_host');
    }
    // Only the standard https port: no probing of other services.
    if (url.port !== '' && url.port !== '443') {
      throw new SafeFetchError('blocked_host');
    }
  }
  if (opts.isDenied?.(host)) throw new SafeFetchError('blocked_host');
  url.hash = '';
  return url;
}

function makeLookup(opts: SafeFetchOptions) {
  const resolve = opts.resolver ?? dnsLookup;
  // Signature of net.connect's `lookup` option.
  return (
    hostname: string,
    options: unknown,
    callback: (
      err: NodeJS.ErrnoException | null,
      address: string | { address: string; family: number }[],
      family?: number,
    ) => void,
  ): void => {
    const wantsAll =
      typeof options === 'object' &&
      options !== null &&
      (options as { all?: boolean }).all === true;
    resolve(hostname, { all: true, verbatim: true }, (err, addresses) => {
      if (err) return callback(err, '', 0);
      const list = addresses as unknown as {
        address: string;
        family: number;
      }[];
      if (list.length === 0) {
        return callback(
          Object.assign(new Error('no address'), { code: 'ENOTFOUND' }),
          '',
          0,
        );
      }
      if (!opts.allowLocal && list.some((a) => isPrivateAddress(a.address))) {
        return callback(
          Object.assign(new Error('blocked address'), { code: 'EBLOCKED' }),
          '',
          0,
        );
      }
      if (wantsAll) return callback(null, list);
      callback(null, list[0].address, list[0].family);
    });
  };
}

type Hop =
  | { kind: 'redirect'; location: string }
  | { kind: 'page'; status: number; html: string };

function once(
  url: URL,
  opts: SafeFetchOptions,
  deadline: number,
  maxBytes: number,
): Promise<Hop> {
  return new Promise((resolve, reject) => {
    const left = deadline - Date.now();
    if (left <= 0) return reject(new SafeFetchError('timeout'));
    const make = url.protocol === 'https:' ? httpsRequest : httpRequest;
    let settled = false;
    const timers: { t?: NodeJS.Timeout } = {};
    const done = (fn: () => void) => {
      if (settled) return;
      settled = true;
      if (timers.t) clearTimeout(timers.t);
      fn();
    };
    const req = make(
      url,
      {
        method: 'GET',
        lookup: makeLookup(opts),
        headers: {
          'User-Agent': USER_AGENT,
          Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.1',
          'Accept-Language': 'en,*;q=0.5',
          'Accept-Encoding': 'gzip, deflate, br',
        },
        // A fresh socket per request: nothing is shared between people.
        agent: false,
      },
      (res) => {
        const status = res.statusCode ?? 0;
        if (status >= 300 && status < 400 && res.headers.location) {
          res.resume();
          return done(() =>
            resolve({ kind: 'redirect', location: res.headers.location! }),
          );
        }
        if (status < 200 || status >= 300) {
          res.resume();
          return done(() => reject(new SafeFetchError('http_status')));
        }
        const type = String(res.headers['content-type'] ?? '').toLowerCase();
        if (!/^(text\/html|application\/xhtml\+xml)\b/.test(type)) {
          res.resume();
          return done(() => reject(new SafeFetchError('not_html')));
        }
        const declared = Number(res.headers['content-length']);
        const enc = String(res.headers['content-encoding'] ?? '')
          .toLowerCase()
          .trim();
        const zopts = { maxOutputLength: maxBytes + 1 };
        let stream: NodeJS.ReadableStream = res;
        if (enc === 'gzip' || enc === 'x-gzip') {
          stream = res.pipe(createGunzip(zopts));
        } else if (enc === 'deflate') {
          stream = res.pipe(createInflate(zopts));
        } else if (enc === 'br') {
          stream = res.pipe(createBrotliDecompress(zopts));
        } else if (enc && enc !== 'identity') {
          res.resume();
          return done(() => reject(new SafeFetchError('not_html')));
        }
        if (enc === '' && Number.isFinite(declared) && declared > maxBytes) {
          res.destroy();
          return done(() => reject(new SafeFetchError('too_large')));
        }
        const chunks: Buffer[] = [];
        let total = 0;
        stream.on('data', (c: Buffer) => {
          total += c.length;
          if (total > maxBytes) {
            res.destroy();
            req.destroy();
            return done(() => reject(new SafeFetchError('too_large')));
          }
          chunks.push(c);
        });
        stream.on('end', () =>
          done(() =>
            resolve({
              kind: 'page',
              status,
              html: Buffer.concat(chunks).toString('utf8'),
            }),
          ),
        );
        stream.on('error', (e: NodeJS.ErrnoException) =>
          done(() =>
            reject(
              e.code === 'ERR_BUFFER_TOO_LARGE'
                ? new SafeFetchError('too_large')
                : new SafeFetchError('network', e.message),
            ),
          ),
        );
      },
    );
    timers.t = setTimeout(() => {
      req.destroy();
      done(() => reject(new SafeFetchError('timeout')));
    }, left);
    req.on('error', (e: NodeJS.ErrnoException) =>
      done(() =>
        reject(
          e.code === 'EBLOCKED'
            ? new SafeFetchError('blocked_host')
            : e.code === 'ENOTFOUND' || e.code === 'EAI_AGAIN'
              ? new SafeFetchError('dns')
              : new SafeFetchError('network', e.message),
        ),
      ),
    );
    req.end();
  });
}

/** GET [raw] with every safeguard above; throws SafeFetchError. */
export async function safeFetchHtml(
  raw: string,
  opts: SafeFetchOptions,
): Promise<SafeFetchResult> {
  const deadline = Date.now() + (opts.timeoutMs ?? PREVIEW_TIMEOUT_MS);
  const maxBytes = opts.maxBytes ?? PREVIEW_MAX_BYTES;
  let url = checkPreviewUrl(raw, opts);
  for (let hop = 0; hop <= PREVIEW_MAX_REDIRECTS; hop++) {
    const r = await once(url, opts, deadline, maxBytes);
    if (r.kind === 'page') {
      return { finalUrl: url, html: r.html, status: r.status };
    }
    // Every hop is a brand-new, fully checked URL.
    let next: URL;
    try {
      next = new URL(r.location, url);
    } catch {
      throw new SafeFetchError('invalid_url');
    }
    url = checkPreviewUrl(next.toString(), opts);
  }
  throw new SafeFetchError('redirects');
}
