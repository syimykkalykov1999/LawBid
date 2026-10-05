import { Injectable } from '@nestjs/common';
import { SecretsService } from '../../common/secrets/secrets.service';
import type { ParsedLead } from './lead-csv';
import { normalizePhone } from './outreach.settings';

/** "NYS Attorney Registrations" (Office of Court Administration), the
 * free SODA dataset the licence check already uses. Public business
 * contact data only; no paid service (owner 2026-10-05). */
const DATASET_URL = 'https://data.ny.gov/resource/eqw2-r5nb.json';
const TIMEOUT_MS = 15_000;
export const MAX_REGISTRY_ROWS = 500;

interface NyRow {
  registration_number?: string;
  first_name?: string;
  middle_name?: string;
  last_name?: string;
  company_name?: string;
  city?: string;
  county?: string;
  state?: string;
  zip?: string;
  phone_number?: string;
  year_admitted?: string;
  status?: string;
}

export interface RegistryQuery {
  /** County as the dataset spells it ("NEW YORK", "KINGS"); optional. */
  county?: string;
  city?: string;
  /** Admitted in or after this year (newer lawyers answer cold calls more). */
  admittedFrom?: number;
  limit: number;
  offset: number;
}

const soql = (s: string) => `'${s.replace(/'/g, "''")}'`;

/** Rows of the dataset → leads; rows without a phone are dropped (the
 * registry publishes no emails, so a phone is the only way to reach them). */
export function leadsFromRegistry(rows: NyRow[]): ParsedLead[] {
  const out: ParsedLead[] = [];
  rows.forEach((r, i) => {
    const phone = normalizePhone(r.phone_number);
    if (!phone) return;
    out.push({
      row: i + 1,
      firstName: (r.first_name ?? '').trim() || null,
      lastName: (r.last_name ?? '').trim() || null,
      company: (r.company_name ?? '').trim().slice(0, 160) || null,
      stateCode: 'NY',
      city: (r.city ?? '').trim().slice(0, 80) || null,
      practice: null,
      phone,
      email: null,
      kind: 'attorney',
      note: r.registration_number
        ? `NY registration ${r.registration_number}`
        : null,
    });
  });
  return out;
}

@Injectable()
export class NyRegistrySource {
  constructor(private readonly secrets: SecretsService) {}

  buildUrl(q: RegistryQuery): string {
    const where = [`status=${soql('Currently registered')}`];
    if (q.county) where.push(`upper(county)=${soql(q.county.toUpperCase())}`);
    if (q.city) where.push(`upper(city)=${soql(q.city.toUpperCase())}`);
    if (q.admittedFrom)
      where.push(`year_admitted>=${soql(String(q.admittedFrom))}`);
    const params = new URLSearchParams({
      $where: where.join(' AND '),
      $limit: String(Math.min(q.limit, MAX_REGISTRY_ROWS)),
      $offset: String(q.offset),
      $order: 'registration_number',
    });
    return `${DATASET_URL}?${params.toString()}`;
  }

  async fetch(q: RegistryQuery): Promise<{ rows: NyRow[]; url: string }> {
    const url = this.buildUrl(q);
    const token = await this.secrets.field('ny_registry', 'appToken');
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        headers: token ? { 'X-App-Token': token } : {},
        signal: ctrl.signal,
      });
      if (!res.ok) throw new Error(`data.ny.gov answered HTTP ${res.status}`);
      return { rows: (await res.json()) as NyRow[], url };
    } finally {
      clearTimeout(timer);
    }
  }
}
