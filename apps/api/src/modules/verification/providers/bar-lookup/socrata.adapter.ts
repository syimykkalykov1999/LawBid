import type { BarLookupInput, CheckOutcome } from '../verification-providers';
import {
  assertPublicResolution,
  assertRegistryUrl,
  fetchJson,
  outcomeFor,
  splitValues,
} from './registry-http';
import {
  fillTemplate,
  type ResolvedRegistry,
  type StateBarAdapter,
} from './state-bar-adapter';

const COLUMN = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/;
const DATASET = /^[a-z0-9]{4}-[a-z0-9]{4}$/;

/**
 * Owner 2026-10-05: a state that publishes its attorney list on a Socrata
 * open data portal (the platform behind data.ny.gov and most data.<state>.gov
 * sites). The admin enters the portal, the dataset id and the column names;
 * the lookup is `GET https://<domain>/resource/<id>.json?<number column>=…`.
 */
export class SocrataAdapter implements StateBarAdapter {
  readonly type = 'socrata' as const;

  /** [allowLocal]: http and local hosts (tests, dev) — never in production. */
  constructor(private readonly allowLocal = false) {}

  async lookup(
    input: BarLookupInput,
    registry: ResolvedRegistry,
  ): Promise<CheckOutcome> {
    const c = registry.config;
    for (const col of [c.numberField, c.lastNameField]) {
      if (!col || !COLUMN.test(col))
        throw new Error('Column names are not set');
    }
    if (!DATASET.test(c.datasetId ?? '')) throw new Error('Wrong dataset id');
    const url = assertRegistryUrl(
      `https://${c.domain}/resource/${c.datasetId}.json`,
      this.allowLocal,
    );
    url.searchParams.set(c.numberField, input.barNumber.trim());
    url.searchParams.set('$limit', '1');
    await assertPublicResolution(url, this.allowLocal);
    const rows = await fetchJson(
      url,
      registry.secret ? { 'X-App-Token': registry.secret } : {},
    );
    const row = Array.isArray(rows)
      ? ((rows[0] as Record<string, unknown> | undefined) ?? null)
      : null;
    return outcomeFor(
      `socrata:${c.domain}`,
      input,
      row && {
        status: c.statusField ? row[c.statusField] : undefined,
        first: c.firstNameField ? row[c.firstNameField] : undefined,
        last: row[c.lastNameField],
        full: undefined,
        admitted: c.admittedField ? row[c.admittedField] : undefined,
        raw: row,
      },
      c.statusField ? splitValues(c.activeValues) : [],
      c.profileUrl ? fillTemplate(c.profileUrl, input) : null,
    );
  }
}
