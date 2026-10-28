import type { BarLookupInput, CheckOutcome } from '../verification-providers';
import {
  clean,
  extract,
  hiddenInputs,
  numberKey,
  parseHtml,
  scopes,
  type HtmlDoc,
} from './html-extract';
import {
  outcomeFor,
  RegistryHttpError,
  splitValues,
  toIsoDate,
} from './registry-http';
import { RegistrySession } from './registry-session';
import {
  fillTemplate,
  formatBarNumber,
  type ResolvedRegistry,
  type StateBarAdapter,
} from './state-bar-adapter';

/**
 * Owner 2026-10-28 ("все штаты, где технически возможно"): a state whose
 * only registry is a public web page. One lookup = the page of that bar
 * number (GET, or the site's own search form sent as POST), optionally
 * after the start page for cookies / hidden form fields / a Referer, and
 * optionally one detail page linked from the result. The record is read
 * with the selectors of the state's settings (html-extract.ts).
 *
 * Found = a name was read (and, when a number selector is set, the number
 * on the page is the one asked for). A page without a license status (MS,
 * AR, ME publish only the roll) never passes on its own: a found record
 * with the right name is `manual_review` (`status_unknown`).
 */
export class HtmlPageAdapter implements StateBarAdapter {
  readonly type = 'html_page' as const;

  constructor(
    private readonly allowLocal = false,
    private readonly fetchImpl?: typeof fetch,
  ) {}

  async lookup(
    input: BarLookupInput,
    registry: ResolvedRegistry,
    providerName = `html_page:${registry.stateCode}`,
  ): Promise<CheckOutcome> {
    const c = registry.config;
    if (!c.urlTemplate) throw new Error('Request URL is not set');
    if (!c.nameSelector && !c.lastNameSelector) {
      throw new Error('Set the name selector');
    }
    const number = formatBarNumber(input.barNumber, c);
    const filled = { ...input, barNumber: number };
    const session = new RegistrySession(this.allowLocal, this.fetchImpl);

    // 1. Start page: cookies, hidden fields, CSRF token.
    let referer = c.referer ? fillTemplate(c.referer, filled) : undefined;
    let hidden: Record<string, string> = {};
    const headers: Record<string, string> = {};
    if (c.bootstrapUrl) {
      const start = await session.request(fillTemplate(c.bootstrapUrl, filled));
      if (start.status >= 400) {
        throw new RegistryHttpError(
          start.status,
          `The registry start page answered HTTP ${start.status}`,
        );
      }
      const doc = parseHtml(start.text);
      if (c.bootstrapHidden === 'yes') hidden = hiddenInputs(doc);
      if (c.csrfSelector && c.csrfHeader) {
        const token = extract(doc, doc.root, c.csrfSelector);
        if (!token) throw new Error('No CSRF token on the start page');
        headers[c.csrfHeader] = token;
      }
      referer ??= start.url.toString();
    }

    // 2. The search / profile page.
    const method = c.method === 'POST' ? 'POST' : 'GET';
    let body: string | undefined;
    if (method === 'POST') {
      const form = new URLSearchParams(hidden);
      for (const [k, v] of new URLSearchParams(
        fillTemplate(c.bodyTemplate ?? '', filled),
      )) {
        form.set(k, v);
      }
      body = form.toString();
    }
    let page = await session.request(fillTemplate(c.urlTemplate, filled), {
      method,
      body,
      referer,
      headers,
    });
    const sourceUrl = c.profileUrl ? fillTemplate(c.profileUrl, filled) : null;
    if (page.status === 404)
      return this.notFound(providerName, input, sourceUrl);
    if (page.status >= 400) {
      throw new RegistryHttpError(
        page.status,
        `The registry answered HTTP ${page.status}`,
      );
    }
    let doc = parseHtml(page.text);

    // 3. Optional detail page linked from the result (TX).
    if (c.detailLinkSelector) {
      const href = extract(doc, doc.root, `${c.detailLinkSelector}@href`);
      if (!href) return this.notFound(providerName, input, sourceUrl);
      page = await session.request(new URL(href, page.url), {
        referer: page.url.toString(),
      });
      if (page.status === 404) {
        return this.notFound(providerName, input, sourceUrl);
      }
      if (page.status >= 400) {
        throw new RegistryHttpError(
          page.status,
          `The registry answered HTTP ${page.status}`,
        );
      }
      doc = parseHtml(page.text);
    }

    const record = pickRecord(doc, c, number);
    const out = outcomeFor(
      providerName,
      input,
      record,
      c.statusSelector ? splitValues(c.activeValues) : [],
      sourceUrl ?? (method === 'GET' ? page.url.toString() : null),
    );
    if (record && !c.statusSelector && out.result === 'pass') {
      return {
        result: 'manual_review',
        details: {
          ...out.details,
          licenseStatus: null,
          reason: 'status_unknown',
        },
      };
    }
    return out;
  }

  private notFound(
    provider: string,
    input: BarLookupInput,
    sourceUrl: string | null,
  ): CheckOutcome {
    return outcomeFor(provider, input, null, [], sourceUrl);
  }
}

/** The record of [number] on the page, read with the state's selectors. */
function pickRecord(
  doc: HtmlDoc,
  c: Record<string, string>,
  number: string,
): Parameters<typeof outcomeFor>[2] {
  const want = numberKey(number);
  const candidates = scopes(doc, c.recordSelector)
    .map((scope) => ({
      scope,
      number: extract(doc, scope, c.numberSelector),
      full: extract(doc, scope, c.nameSelector),
      first: extract(doc, scope, c.firstNameSelector),
      last: extract(doc, scope, c.lastNameSelector),
    }))
    .filter((r) => r.full || r.last);
  const matching = c.numberSelector
    ? candidates.filter((r) => numberKey(r.number) === want)
    : candidates;
  if (matching.length === 0) return null;
  if (matching.length > 1 && !c.numberSelector) {
    throw new Error('The registry returned several attorneys for this number');
  }
  const r = matching[0];
  const status = extract(doc, r.scope, c.statusSelector);
  const expires = extract(doc, r.scope, c.expiresSelector);
  const admitted = extract(doc, r.scope, c.admittedSelector);
  const firm = extract(doc, r.scope, c.firmSelector);
  return {
    status,
    first: c.lastNameSelector ? (r.first ?? undefined) : undefined,
    last: c.lastNameSelector ? (r.last ?? undefined) : undefined,
    full: r.full ?? ([r.first, r.last].filter(Boolean).join(' ') || undefined),
    admitted,
    firm,
    expiresAt: toIsoDate(expires),
    raw: {
      number: r.number ?? number,
      name: r.full ?? clean([r.first, r.last].filter(Boolean).join(' ')),
      status,
      admitted,
      ...(firm && { firm }),
      ...(expires && { expires }),
    },
  };
}
