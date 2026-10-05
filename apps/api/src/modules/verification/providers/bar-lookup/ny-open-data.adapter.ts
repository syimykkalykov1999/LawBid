import { Injectable } from '@nestjs/common';
import { SecretsService } from '../../../../common/secrets/secrets.service';
import type { BarLookupInput, CheckOutcome } from '../verification-providers';
import { fetchJson, outcomeFor } from './registry-http';
import type { ResolvedRegistry, StateBarAdapter } from './state-bar-adapter';

const DATASET_URL = 'https://data.ny.gov/resource/eqw2-r5nb.json';
const PROFILE_URL =
  'https://iapps.courts.state.ny.us/attorneyservices/search?0=';

/** Row of the "NYS Attorney Registrations" open dataset (Office of Court
 * Administration, data.ny.gov `eqw2-r5nb`, free SODA API). */
interface NyRegistrationRow {
  registration_number?: string;
  first_name?: string;
  middle_name?: string;
  last_name?: string;
  year_admitted?: string;
  status?: string;
  company_name?: string;
}

/** Status of an attorney in good standing in the dataset. */
const ACTIVE_STATUSES = ['currently registered'];

/**
 * New York (owner 2026-10-04: "только номер"): the registration number is
 * looked up in the court system's open dataset (see outcomeFor for the
 * rule). The app token comes from the NY row of the state registries, or
 * — for keys saved before 2026-10-05 — from Admin → Integrations → "NY
 * attorney registry"; it only raises the anonymous rate limit.
 */
@Injectable()
export class NyOpenDataAdapter implements StateBarAdapter {
  readonly type = 'ny_open_data' as const;

  constructor(private readonly secrets: SecretsService) {}

  async lookup(
    input: BarLookupInput,
    registry?: ResolvedRegistry,
  ): Promise<CheckOutcome> {
    const number = input.barNumber.replace(/\D/g, '');
    const token =
      registry?.secret ?? (await this.secrets.field('ny_registry', 'appToken'));
    const url = new URL(DATASET_URL);
    url.searchParams.set('registration_number', number);
    url.searchParams.set('$limit', '1');
    const rows = number
      ? ((await fetchJson(url, token ? { 'X-App-Token': token } : {})) as
          NyRegistrationRow[] | null)
      : null;
    const row = Array.isArray(rows) ? (rows[0] ?? null) : null;
    return outcomeFor(
      'ny_open_data',
      input,
      row && {
        status: row.status,
        first: row.first_name,
        last: row.last_name,
        full: [row.first_name, row.middle_name, row.last_name]
          .filter(Boolean)
          .join(' '),
        admitted: row.year_admitted,
        firm: row.company_name,
        raw: row,
      },
      ACTIVE_STATUSES,
      PROFILE_URL,
    );
  }
}
