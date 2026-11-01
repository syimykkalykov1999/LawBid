import { assertRobotsAllowed } from './robots';
import {
  assertPublicResolution,
  assertRegistryUrl,
  REGISTRY_TIMEOUT_MS,
  RegistryHttpError,
} from './registry-http';

/**
 * Owner 2026-10-28 (all states): one polite visit to a state's public
 * lookup page — at most a start page (cookies, hidden form fields, a CSRF
 * token), the search itself and one detail page. Cookies live only for the
 * one lookup. Every address (and every redirect) must be https to a public
 * host and stay on the registry's own host; answers are capped in size;
 * HTTP 429 becomes [RegistryRateLimitedError] so the circuit breaker backs
 * off. The User-Agent says who we are — no browser disguise, no captcha.
 */

/** Pages of the bars run to 600 KB (CA); anything bigger is refused. */
const MAX_PAGE_BYTES = 2 * 1024 * 1024;
const MAX_REDIRECTS = 4;
/** Requests one lookup may make (start page + search + redirects + detail). */
const MAX_REQUESTS = 8;

/** Standard crawler form ("compatible; <name>; +<url>"): says who we are
 * without pretending to be a browser. Ohio's search answers nothing to a
 * User-Agent that does not start with "Mozilla/5.0". */
export const REGISTRY_USER_AGENT =
  'Mozilla/5.0 (compatible; LawBid-LicenseCheck/1.0; +https://lawbid.dev)';
/** Our name in robots.txt groups. */
export const REGISTRY_ROBOTS_TOKEN = 'LawBid-LicenseCheck';

export class RegistryRateLimitedError extends Error {
  constructor(readonly retryAfterSeconds: number | null) {
    super('The registry asked us to slow down (HTTP 429)');
  }
}

export interface SessionResponse {
  status: number;
  url: URL;
  text: string;
  contentType: string;
}

export interface SessionRequest {
  method?: 'GET' | 'POST';
  headers?: Record<string, string>;
  body?: string;
  contentType?: string;
  referer?: string;
  accept?: string;
}

export class RegistrySession {
  private readonly cookies = new Map<string, string>();
  private requests = 0;
  private host: string | null = null;

  constructor(
    private readonly allowLocal: boolean,
    private readonly fetchImpl: typeof fetch = (...a) => fetch(...a),
  ) {}

  /** The host the lookup started on; redirects and links must stay there. */
  get registryHost(): string | null {
    return this.host;
  }

  async request(
    rawUrl: string | URL,
    req: SessionRequest = {},
  ): Promise<SessionResponse> {
    let url = await this.check(rawUrl);
    let method = req.method ?? 'GET';
    let body = req.body;
    let referer = req.referer;
    for (let hop = 0; ; hop += 1) {
      const res = await this.once(url, method, body, referer, req);
      if (res.status >= 300 && res.status < 400) {
        const loc = res.headers.get('location');
        if (!loc)
          throw new RegistryHttpError(res.status, 'Redirect without address');
        if (hop >= MAX_REDIRECTS) throw new Error('Too many redirects');
        const next = await this.check(new URL(loc, url));
        // 301/302/303 after a form POST continue as GET (browser rule).
        if (res.status !== 307 && res.status !== 308) {
          method = 'GET';
          body = undefined;
        }
        referer = url.toString();
        url = next;
        continue;
      }
      if (res.status === 429) {
        const ra = Number(res.headers.get('retry-after'));
        throw new RegistryRateLimitedError(
          Number.isFinite(ra) && ra > 0 ? ra : null,
        );
      }
      const text = await readCapped(res);
      return {
        status: res.status,
        url,
        text,
        contentType: res.headers.get('content-type') ?? '',
      };
    }
  }

  private async once(
    url: URL,
    method: 'GET' | 'POST',
    body: string | undefined,
    referer: string | undefined,
    req: SessionRequest,
  ): Promise<Response> {
    this.requests += 1;
    if (this.requests > MAX_REQUESTS) {
      throw new Error('Too many requests for one lookup');
    }
    const headers: Record<string, string> = {
      'User-Agent': REGISTRY_USER_AGENT,
      Accept:
        req.accept ??
        'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.8',
      ...(req.headers ?? {}),
    };
    if (referer) headers.Referer = referer;
    const cookie = this.cookieHeader();
    if (cookie) headers.Cookie = cookie;
    if (method === 'POST') {
      headers['Content-Type'] =
        req.contentType ?? 'application/x-www-form-urlencoded';
    }
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), REGISTRY_TIMEOUT_MS);
    try {
      const res = await this.fetchImpl(url, {
        method,
        headers,
        body: method === 'POST' ? (body ?? '') : undefined,
        signal: ctrl.signal,
        redirect: 'manual',
      });
      this.keepCookies(res);
      return res;
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') {
        throw new Error(
          `The registry did not answer in ${REGISTRY_TIMEOUT_MS / 1000} s`,
        );
      }
      throw e;
    } finally {
      clearTimeout(timer);
    }
  }

  /** https, public, and on the host the lookup started on. */
  private async check(raw: string | URL): Promise<URL> {
    const url = assertRegistryUrl(raw.toString(), this.allowLocal);
    if (this.host === null) this.host = url.host;
    else if (url.host !== this.host) {
      throw new Error(`The registry sent us to another site (${url.host})`);
    }
    await assertPublicResolution(url, this.allowLocal);
    await assertRobotsAllowed(
      url,
      { token: REGISTRY_ROBOTS_TOKEN, userAgent: REGISTRY_USER_AGENT },
      this.fetchImpl,
    );
    return url;
  }

  private keepCookies(res: Response): void {
    const h = res.headers as Headers & { getSetCookie?: () => string[] };
    const list =
      typeof h.getSetCookie === 'function'
        ? h.getSetCookie()
        : (h.get?.('set-cookie') ?? '')
            .split(/,(?=\s*[A-Za-z0-9_.-]+=)/)
            .filter(Boolean);
    for (const line of list) {
      const pair = line.split(';')[0] ?? '';
      const eq = pair.indexOf('=');
      if (eq <= 0) continue;
      const name = pair.slice(0, eq).trim();
      const value = pair.slice(eq + 1).trim();
      if (name) this.cookies.set(name, value);
    }
  }

  private cookieHeader(): string {
    return [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; ');
  }
}

async function readCapped(res: Response): Promise<string> {
  const text = await res.text();
  if (text.length > MAX_PAGE_BYTES) {
    throw new Error('The registry answer is too large');
  }
  return text;
}
