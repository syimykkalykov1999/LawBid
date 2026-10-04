import { Injectable } from '@nestjs/common';
import { SecretsService } from '../../../../common/secrets/secrets.service';
import type { BarLookupInput, CheckOutcome } from '../verification-providers';
import type { BarLookupDetails, StateBarAdapter } from './state-bar-adapter';

const DATASET_URL = 'https://data.ny.gov/resource/eqw2-r5nb.json';
const PROFILE_URL =
  'https://iapps.courts.state.ny.us/attorneyservices/search?0=';
const TIMEOUT_MS = 8000;

/** Row of the "NYS Attorney Registrations" open dataset (Office of Court
 * Administration, data.ny.gov `eqw2-r5nb`, free SODA API). */
interface NyRegistrationRow {
  registration_number?: string;
  first_name?: string;
  middle_name?: string;
  last_name?: string;
  year_admitted?: string;
  status?: string;
}

/** Status of an attorney in good standing in the dataset. */
const ACTIVE_STATUS = 'currently registered';

/** Upper-case letters only: "O'Brien-Smith" and "OBRIEN SMITH" match. */
export function normalizeName(s: string | null | undefined): string {
  return (s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z]/g, '');
}

/**
 * New York (owner 2026-10-04: "только номер"): the registration number is
 * looked up in the court system's open dataset. `pass` needs the number
 * found, status "Currently registered" and first + last name equal to the
 * account's; that `pass` lets the request be approved without a verifier.
 * A name that differs is `manual_review` (nicknames, married names); a
 * number not found or a non-active status is `fail` — the verifier still
 * decides. An optional Socrata app token (Admin → Integrations → "NY
 * attorney registry") raises the anonymous rate limit.
 */
@Injectable()
export class NyOpenDataAdapter implements StateBarAdapter {
  readonly name = 'ny_open_data';
  readonly states = ['NY'] as const;

  constructor(private readonly secrets: SecretsService) {}

  async lookup(input: BarLookupInput): Promise<CheckOutcome> {
    const number = input.barNumber.replace(/\D/g, '');
    const row = number ? await this.fetchRow(number) : null;
    const details: BarLookupDetails & Record<string, unknown> = {
      provider: this.name,
      found: row !== null,
      licenseStatus: null,
      name: null,
      admittedAt: null,
      sourceUrl: PROFILE_URL,
    };
    if (!row) {
      return { result: 'fail', details: { ...details, reason: 'not_found' } };
    }

    const active = (row.status ?? '').trim().toLowerCase() === ACTIVE_STATUS;
    details.licenseStatus = active ? 'active' : 'inactive';
    details.registryStatus = row.status ?? null;
    details.name = [row.first_name, row.middle_name, row.last_name]
      .filter(Boolean)
      .join(' ');
    details.admittedAt = row.year_admitted ?? null;
    if (!active) {
      return { result: 'fail', details: { ...details, reason: 'not_active' } };
    }
    const nameMatches =
      normalizeName(input.lastName) !== '' &&
      normalizeName(row.last_name) === normalizeName(input.lastName) &&
      normalizeName(row.first_name) === normalizeName(input.firstName);
    return nameMatches
      ? { result: 'pass', details }
      : {
          result: 'manual_review',
          details: { ...details, reason: 'name_mismatch' },
        };
  }

  private async fetchRow(number: string): Promise<NyRegistrationRow | null> {
    const url = `${DATASET_URL}?registration_number=${encodeURIComponent(number)}&$limit=1`;
    const token = await this.secrets.field('ny_registry', 'appToken');
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        headers: token ? { 'X-App-Token': token } : {},
        signal: ctrl.signal,
      });
      if (!res.ok) throw new Error(`data.ny.gov answered HTTP ${res.status}`);
      const rows = (await res.json()) as NyRegistrationRow[];
      return rows[0] ?? null;
    } finally {
      clearTimeout(timer);
    }
  }
}
