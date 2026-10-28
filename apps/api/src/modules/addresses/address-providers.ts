import {
  AutocompleteCommand,
  GeoPlacesClient,
} from '@aws-sdk/client-geo-places';
import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { SecretsService } from '../../common/secrets/secrets.service';

/** What the person is typing: a street address, or only a city. */
export type AddressKind = 'address' | 'city';

/** One line in the drop-down. */
export interface AddressSuggestion {
  /** The full text that goes into the field ("12 Main St, Hays, KS 67601"). */
  label: string;
  /** City (locality) when the provider gives it. */
  city: string | null;
  /** Two-letter US state code when the provider gives it. */
  stateCode: string | null;
}

export interface AddressQuery {
  /** Normalized text, 3..120 characters. */
  text: string;
  kind: AddressKind;
  /** The client's per-field session id (Google bills a session, not a key
   * stroke; AWS ignores it). */
  session?: string;
  limit: number;
}

/**
 * The seam for an address suggestion service. `cacheable` is the
 * provider's terms, not a preference: both Amazon Location (AWS Service
 * Terms §82.5.a: no store / cache of Location Data; Autocomplete has only
 * IntendedUse=SingleUse) and Google Places (Maps Platform terms §3.2.3(b):
 * no caching except place IDs) forbid keeping their answers, so their
 * results never go to Redis.
 */
export interface AddressProvider {
  readonly name: 'aws' | 'google';
  readonly cacheable: boolean;
  /** Keys / region present (admin integrations or env). */
  configured(): Promise<boolean>;
  suggest(q: AddressQuery): Promise<AddressSuggestion[]>;
}

export const ADDRESS_PROVIDERS = Symbol('ADDRESS_PROVIDERS');

const TIMEOUT_MS = 2_500;

/** "…, United States" / ", USA" at the end of a US label is noise. */
export function stripCountry(label: string): string {
  return label
    .replace(/,\s*(United States( of America)?|USA|US)\s*$/i, '')
    .trim();
}

/**
 * Amazon Location Service Places v2 `Autocomplete` (Label bucket: no
 * AdditionalFeatures = $0.20 per 1 000; US only). Credentials: the admin
 * integration `aws_location` (region + optional keys; empty keys = the ECS
 * task role, which Terraform grants geo-places:Autocomplete), env
 * ADDRESS_AWS_* as fallback. One client per key set.
 */
@Injectable()
export class AwsLocationAddressProvider
  implements AddressProvider, OnModuleDestroy
{
  readonly name = 'aws' as const;
  readonly cacheable = false;
  private client?: { fingerprint: string; client: GeoPlacesClient };

  constructor(private readonly secrets: SecretsService) {}

  configured(): Promise<boolean> {
    return this.secrets.has('aws_location', ['region']);
  }

  async suggest(q: AddressQuery): Promise<AddressSuggestion[]> {
    const client = await this.geo();
    const res = await client.send(
      new AutocompleteCommand({
        QueryText: q.text,
        MaxResults: q.limit,
        Language: 'en',
        Filter: {
          IncludeCountries: ['USA'],
          ...(q.kind === 'city' ? { IncludePlaceTypes: ['Locality'] } : {}),
        },
      }),
      { abortSignal: AbortSignal.timeout(TIMEOUT_MS) },
    );
    const out: AddressSuggestion[] = [];
    for (const item of res.ResultItems ?? []) {
      const a = item.Address;
      const city = a?.Locality ?? null;
      const stateCode = a?.Region?.Code ?? null;
      const label =
        q.kind === 'city'
          ? [city, stateCode].filter(Boolean).join(', ')
          : stripCountry(a?.Label ?? item.Title ?? '');
      if (label) out.push({ label, city, stateCode });
    }
    return out;
  }

  private async geo(): Promise<GeoPlacesClient> {
    const c = await this.secrets.get('aws_location');
    if (!c?.fields.region) throw new Error('aws_location not configured');
    if (this.client?.fingerprint === c.fingerprint) return this.client.client;
    this.client?.client.destroy();
    const { region, accessKeyId, secretAccessKey } = c.fields;
    const client = new GeoPlacesClient({
      region,
      maxAttempts: 1,
      ...(accessKeyId && secretAccessKey
        ? { credentials: { accessKeyId, secretAccessKey } }
        : {}),
    });
    this.client = { fingerprint: c.fingerprint, client };
    return client;
  }

  onModuleDestroy(): void {
    this.client?.client.destroy();
  }
}

interface GooglePrediction {
  placePrediction?: {
    text?: { text?: string };
    structuredFormat?: {
      mainText?: { text?: string };
      secondaryText?: { text?: string };
    };
  };
}

/**
 * Google Places API (New) `places:autocomplete` (US only). The client's
 * session id is passed as `sessionToken`. Key: the admin integration
 * `google_places` (env GOOGLE_PLACES_API_KEY), sent only from the server.
 */
@Injectable()
export class GooglePlacesAddressProvider implements AddressProvider {
  readonly name = 'google' as const;
  readonly cacheable = false;

  constructor(private readonly secrets: SecretsService) {}

  configured(): Promise<boolean> {
    return this.secrets.has('google_places', ['apiKey']);
  }

  async suggest(q: AddressQuery): Promise<AddressSuggestion[]> {
    const key = await this.secrets.field('google_places', 'apiKey');
    if (!key) throw new Error('google_places not configured');
    const res = await fetch(
      'https://places.googleapis.com/v1/places:autocomplete',
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'X-Goog-Api-Key': key,
          'X-Goog-FieldMask':
            'suggestions.placePrediction.text,suggestions.placePrediction.structuredFormat',
        },
        body: JSON.stringify({
          input: q.text,
          includedRegionCodes: ['us'],
          languageCode: 'en',
          ...(q.kind === 'city' ? { includedPrimaryTypes: ['locality'] } : {}),
          ...(q.session ? { sessionToken: q.session } : {}),
        }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      },
    );
    if (!res.ok) throw new Error(`google places HTTP ${res.status}`);
    const body = (await res.json()) as { suggestions?: GooglePrediction[] };
    const out: AddressSuggestion[] = [];
    for (const s of body.suggestions ?? []) {
      const p = s.placePrediction;
      const full = stripCountry(p?.text?.text ?? '');
      if (!full) continue;
      const secondary = p?.structuredFormat?.secondaryText?.text ?? '';
      const state = /\b([A-Z]{2})\b(?:,\s*USA)?\s*$/.exec(secondary)?.[1];
      const city =
        q.kind === 'city'
          ? (p?.structuredFormat?.mainText?.text ?? null)
          : secondary.split(',')[0]?.trim() || null;
      out.push({ label: full, city, stateCode: state ?? null });
      if (out.length >= q.limit) break;
    }
    return out;
  }
}
