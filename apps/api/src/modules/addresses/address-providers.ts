import {
  AutocompleteCommand,
  GeoPlacesClient,
} from '@aws-sdk/client-geo-places';
import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { AppSettingsService } from '../../common/app-settings/app-settings.service';
import { US_STATES } from '../../common/reference-data/us-states';
import { SecretsService } from '../../common/secrets/secrets.service';
import { awsRequestHandler } from '../../common/http/aws-request-handler';

/** What the person is typing: a street address, only a city, or any
 * place (venue, city, address, anywhere in the world) like the Instagram
 * post location (owner 26.11). */
export type AddressKind = 'address' | 'city' | 'place';

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
  /** The app's language (two letters, from Accept-Language). */
  lang?: string;
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
  readonly name: 'aws' | 'google' | 'photon';
  readonly cacheable: boolean;
  /** Credit line the app shows under the results (data licence), or null. */
  readonly attribution?: string | null;
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
        // AWS Autocomplete has no venues; kind=place is served by the
        // place provider (addresses.place_provider), else address search.
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
      // The caller's abortSignal (TIMEOUT_MS) ends the wait; this frees the
      // socket on the same limit (M5 26.11).
      requestHandler: awsRequestHandler(TIMEOUT_MS),
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
          // kind=place: venues, cities, addresses anywhere (post location).
          ...(q.kind === 'place' ? {} : { includedRegionCodes: ['us'] }),
          languageCode: q.kind === 'place' ? (q.lang ?? 'en') : 'en',
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
      const raw = p?.text?.text ?? '';
      const full = q.kind === 'place' ? raw.trim() : stripCountry(raw);
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

/** Languages the public Photon instance answers in (live check 26.11:
 * "Supported are: default, de, en, fr"); anything else = local names. */
const PHOTON_LANGS = new Set(['en', 'de', 'fr']);
const US_STATE_CODE = new Map(
  US_STATES.map((s) => [s.name.toLowerCase(), s.code]),
);

interface PhotonFeature {
  properties?: {
    name?: string;
    housenumber?: string;
    street?: string;
    city?: string;
    district?: string;
    county?: string;
    state?: string;
    country?: string;
    countrycode?: string;
    postcode?: string;
    type?: string;
  };
}

/** One Photon (GeoJSON) feature as a line for the field. */
export function photonSuggestion(
  f: PhotonFeature,
  kind: AddressKind,
): AddressSuggestion | null {
  const p = f.properties ?? {};
  const us = p.countrycode?.toUpperCase() === 'US';
  const state = p.state?.trim() || null;
  const stateCode =
    us && state ? (US_STATE_CODE.get(state.toLowerCase()) ?? null) : null;
  const isCity = p.type === 'city';
  const city = (isCity ? p.name : p.city)?.trim() || null;
  const street = [p.housenumber, p.street].filter(Boolean).join(' ').trim();
  const region = stateCode ?? state;
  let parts: (string | null | undefined)[];
  if (kind === 'city') {
    parts = [city, region];
  } else if (kind === 'address') {
    parts = [
      street || p.name,
      isCity ? null : city,
      [region, p.postcode].filter(Boolean).join(' '),
    ];
  } else {
    parts = [
      p.name,
      street,
      isCity ? null : (city ?? p.district ?? p.county),
      region,
      us ? null : p.country,
    ];
  }
  const seen = new Set<string>();
  const label = parts
    .map((x) => x?.trim())
    .filter((x): x is string => {
      if (!x || seen.has(x.toLowerCase())) return false;
      seen.add(x.toLowerCase());
      return true;
    })
    .join(', ');
  return label ? { label, city, stateCode } : null;
}

/**
 * Photon by komoot (Apache-2.0, https://github.com/komoot/photon), built
 * for search-as-you-type over OpenStreetMap: venues, cities, streets and
 * house numbers worldwide, no key. Default endpoint: the public instance
 * https://photon.komoot.io («please be fair - extensive usage will be
 * throttled», checked 26.11); `addresses.photon_url` points it at our own
 * Photon later. OSM data is ODbL: answers may be kept (so `cacheable` —
 * the 7-day Redis cache cuts calls to the public instance) and the app
 * shows «© OpenStreetMap» under them.
 */
@Injectable()
export class PhotonAddressProvider implements AddressProvider {
  readonly name = 'photon' as const;
  readonly cacheable = true;
  readonly attribution = '© OpenStreetMap';

  constructor(private readonly settings: AppSettingsService) {}

  /** `off` (or anything but an https URL) = Photon off. */
  private async baseUrl(): Promise<string | null> {
    const raw = (await this.settings.string('addresses.photon_url')).trim();
    return /^https:\/\/[^\s/]+/i.test(raw) ? raw.replace(/\/+$/, '') : null;
  }

  async configured(): Promise<boolean> {
    return (await this.baseUrl()) !== null;
  }

  async suggest(q: AddressQuery): Promise<AddressSuggestion[]> {
    const base = await this.baseUrl();
    if (!base) throw new Error('photon not configured');
    const params = new URLSearchParams({ q: q.text });
    // US kinds are filtered to the US; ask for more so 5 remain.
    params.set('limit', String(q.kind === 'place' ? q.limit : q.limit * 2));
    if (q.lang && PHOTON_LANGS.has(q.lang)) params.set('lang', q.lang);
    if (q.kind !== 'place') params.set('countrycode', 'US');
    if (q.kind === 'city') params.set('layer', 'city');
    const res = await fetch(`${base}/api/?${params.toString()}`, {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`photon HTTP ${res.status}`);
    const body = (await res.json()) as { features?: PhotonFeature[] };
    const out: AddressSuggestion[] = [];
    const labels = new Set<string>();
    for (const f of body.features ?? []) {
      const cc = f.properties?.countrycode?.toUpperCase();
      if (q.kind !== 'place' && cc !== 'US') continue;
      const s = photonSuggestion(f, q.kind);
      if (!s || labels.has(s.label)) continue;
      labels.add(s.label);
      out.push(s);
      if (out.length >= q.limit) break;
    }
    return out;
  }
}
