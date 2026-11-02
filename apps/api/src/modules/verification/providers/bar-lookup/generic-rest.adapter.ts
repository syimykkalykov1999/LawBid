import type { BarLookupInput, CheckOutcome } from '../verification-providers';
import {
  assertPublicResolution,
  assertRegistryUrl,
  fetchJson,
  getPath,
  outcomeFor,
  RegistryHttpError,
  splitValues,
  toIsoDate,
} from './registry-http';
import { extract, numberKey, parseHtml } from './html-extract';
import { RegistrySession } from './registry-session';
import {
  fillTemplate,
  type ResolvedRegistry,
  type StateBarAdapter,
} from './state-bar-adapter';

/**
 * Owner 2026-10-05 ("если вдруг достану API"): any JSON API — a state
 * bar's own or a paid verification service. The admin types the request
 * URL with {bar_number} / {state} / {first_name} / {last_name}, how the
 * key is sent, and where the status and name sit in the answer. HTTP 404
 * or an empty record is "not found". Requests go to https public hosts
 * only, without redirects, 8 s timeout (registry-http.ts).
 */
export class GenericRestAdapter implements StateBarAdapter {
  readonly type = 'generic_rest' as const;

  /** [allowLocal]: http and local hosts (tests, dev) — never in production. */
  constructor(
    private readonly allowLocal = false,
    private readonly fetchImpl?: typeof fetch,
  ) {}

  async lookup(
    input: BarLookupInput,
    registry: ResolvedRegistry,
    providerName?: string,
  ): Promise<CheckOutcome> {
    const c = registry.config;
    if (!c.urlTemplate) throw new Error('Request URL is not set');
    const url = assertRegistryUrl(
      fillTemplate(c.urlTemplate, {
        ...input,
        barNumber: input.barNumber.trim(),
      }),
      this.allowLocal,
    );
    const headers: Record<string, string> = {};
    const key = registry.secret;
    const auth = c.authType || 'none';
    if (auth !== 'none') {
      if (!key) throw new Error('The API key is not set');
      if (auth === 'bearer') headers.Authorization = `Bearer ${key}`;
      else if (!c.authName)
        throw new Error('Header / parameter name is not set');
      else if (auth === 'header') headers[c.authName] = key;
      else if (auth === 'query') url.searchParams.set(c.authName, key);
    }
    const session = c.method === 'POST' || c.bootstrapUrl || c.headers;
    let body: unknown;
    if (session) {
      body = await this.sessionLookup(
        url,
        { ...input, barNumber: input.barNumber.trim() },
        c,
        headers,
      );
    } else {
      await assertPublicResolution(url, this.allowLocal);
      body = await fetchJson(url, headers);
    }
    let record = getPath(body, c.recordPath);
    if (Array.isArray(record)) {
      // Owner 2026-10-28: a search answer lists several attorneys — take
      // the one whose number is the one asked for (IN "7187-45", OH 12345).
      const want = numberKey(input.barNumber);
      record = c.numberPath
        ? record.find(
            (r) => numberKey(scalar(getPath(r, c.numberPath))) === want,
          )
        : record[0];
    }
    const found =
      record !== null &&
      record !== undefined &&
      typeof record === 'object' &&
      Object.keys(record).length > 0;
    return outcomeFor(
      providerName ?? `generic_rest:${url.hostname}`,
      input,
      found
        ? {
            status: c.statusPath ? getPath(record, c.statusPath) : undefined,
            first: c.firstNamePath
              ? getPath(record, c.firstNamePath)
              : undefined,
            last: c.lastNamePath ? getPath(record, c.lastNamePath) : undefined,
            full: c.fullNamePath ? getPath(record, c.fullNamePath) : undefined,
            admitted: c.admittedPath
              ? getPath(record, c.admittedPath)
              : undefined,
            expiresAt: c.expiresPath
              ? toIsoDate(scalar(getPath(record, c.expiresPath)))
              : null,
            raw: record,
          }
        : null,
      c.statusPath ? splitValues(c.activeValues) : [],
      c.profileUrl ? fillTemplate(c.profileUrl, input) : null,
    );
  }

  /**
   * Owner 2026-10-28: POST and session APIs (Indiana's roll of attorneys,
   * Ohio's attorney search): optional start page for cookies and a CSRF
   * token, a JSON or form body, extra headers. Same safety as GET: https
   * public host, no redirects off the host, timeout, size cap.
   */
  private async sessionLookup(
    url: URL,
    input: BarLookupInput,
    c: Record<string, string>,
    keyHeaders: Record<string, string>,
  ): Promise<unknown> {
    const s = new RegistrySession(this.allowLocal, this.fetchImpl);
    const headers: Record<string, string> = {
      ...parseHeaders(c.headers),
      ...keyHeaders,
    };
    let referer: string | undefined;
    if (c.bootstrapUrl) {
      const start = await s.request(fillTemplate(c.bootstrapUrl, input));
      if (start.status >= 400) {
        throw new RegistryHttpError(
          start.status,
          `The registry start page answered HTTP ${start.status}`,
        );
      }
      if (c.csrfSelector && c.csrfHeader) {
        const doc = parseHtml(start.text);
        const token = extract(doc, doc.root, c.csrfSelector);
        if (!token) throw new Error('No CSRF token on the start page');
        headers[c.csrfHeader] = token;
      }
      referer = start.url.toString();
    }
    const post = c.method === 'POST';
    const json = (c.bodyType ?? 'json') === 'json';
    const res = await s.request(url, {
      method: post ? 'POST' : 'GET',
      body: post
        ? fillTemplate(c.bodyTemplate ?? '', input, json ? 'json' : 'url')
        : undefined,
      contentType: json
        ? 'application/json'
        : 'application/x-www-form-urlencoded; charset=UTF-8',
      accept: 'application/json, text/javascript, */*; q=0.01',
      headers,
      referer,
    });
    if (res.status === 404) return null;
    if (res.status === 401 || res.status === 403) {
      throw new RegistryHttpError(
        res.status,
        `The registry refused the request (HTTP ${res.status})`,
      );
    }
    if (res.status >= 400) {
      throw new RegistryHttpError(
        res.status,
        `The registry answered HTTP ${res.status}`,
      );
    }
    const text = res.text.replace(/^\uFEFF/, '').trim();
    if (!text) return null;
    try {
      return JSON.parse(text) as unknown;
    } catch {
      throw new Error('The registry answer is not JSON');
    }
  }
}

/** '{"X-Requested-With":"XMLHttpRequest"}' → headers; bad JSON throws. */
function parseHeaders(raw: string | undefined): Record<string, string> {
  if (!raw?.trim()) return {};
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch {
    throw new Error('Extra headers must be a JSON object');
  }
  if (!v || typeof v !== 'object' || Array.isArray(v)) {
    throw new Error('Extra headers must be a JSON object');
  }
  const out: Record<string, string> = {};
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
    if (typeof val === 'string' && /^[A-Za-z0-9-]+$/.test(k)) out[k] = val;
  }
  return out;
}

/** A string or number from a JSON answer, '' for anything else. */
function scalar(v: unknown): string {
  return typeof v === 'string' || typeof v === 'number' ? String(v) : '';
}
