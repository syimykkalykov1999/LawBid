import type { BarLookupInput, CheckOutcome } from '../verification-providers';
import {
  assertPublicResolution,
  assertRegistryUrl,
  fetchJson,
  getPath,
  outcomeFor,
  splitValues,
} from './registry-http';
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
  constructor(private readonly allowLocal = false) {}

  async lookup(
    input: BarLookupInput,
    registry: ResolvedRegistry,
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
    await assertPublicResolution(url, this.allowLocal);
    const body = await fetchJson(url, headers);
    let record = getPath(body, c.recordPath);
    if (Array.isArray(record)) record = record[0];
    const found =
      record !== null &&
      record !== undefined &&
      typeof record === 'object' &&
      Object.keys(record).length > 0;
    return outcomeFor(
      `generic_rest:${url.hostname}`,
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
            raw: record,
          }
        : null,
      c.statusPath ? splitValues(c.activeValues) : [],
      c.profileUrl ? fillTemplate(c.profileUrl, input) : null,
    );
  }
}
