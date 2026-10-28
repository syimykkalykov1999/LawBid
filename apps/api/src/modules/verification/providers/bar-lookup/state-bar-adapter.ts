import type { BarLookupInput, CheckOutcome } from '../verification-providers';

/**
 * Owner 2026-10-05: every state picks how its attorney registry is
 * checked, in Admin → Ключи и сервисы → "Реестры адвокатов по штатам"
 * (table `state_bar_registries`). An adapter is one way of asking a
 * registry; the state's row gives it its settings and API key, so a new
 * state with an API is switched on by typing its key — no release.
 *
 * Result details (docs/03 §2.4): found/not found, license status
 * (active/inactive), name, admission date, source URL and a short copy of
 * the registry record (`raw`) — stored in `attorney_licenses.
 * auto_check_result` and in the request's `bar_lookup` check.
 */
export const REGISTRY_ADAPTER_TYPES = [
  'manual',
  'ny_open_data',
  'socrata',
  'generic_rest',
  // Owner 2026-10-28: public lookup pages, and the ready-made per-state
  // settings for them (state-presets.ts).
  'html_page',
  'state_preset',
] as const;
export type RegistryAdapterType = (typeof REGISTRY_ADAPTER_TYPES)[number];

/**
 * Owner 2026-10-28 (polite use): adapters that ask a state's public web
 * page or a third-party API go through the per-state rate limit, the 24 h
 * cache and the circuit breaker (registry-guard.ts).
 */
export const GUARDED_ADAPTERS: ReadonlySet<RegistryAdapterType> = new Set([
  'generic_rest',
  'html_page',
  'state_preset',
]);

/**
 * Owner 2026-10-28: "one lookup per new attorney submission plus the
 * admin's re-check" — public web pages are never swept by the monthly
 * re-check of every verified license (licenses.registry-recheck); only
 * open-data datasets and keyed APIs are.
 */
export const NO_BULK_RECHECK: ReadonlySet<RegistryAdapterType> = new Set([
  'html_page',
  'state_preset',
]);

/** Requests per minute to one state's registry unless the admin sets it. */
export const DEFAULT_RATE_PER_MIN = 10;

/** A state's registry settings, the key decrypted. */
export interface ResolvedRegistry {
  stateCode: string;
  adapter: RegistryAdapterType;
  config: Record<string, string>;
  secret: string | null;
}

export interface StateBarAdapter {
  readonly type: RegistryAdapterType;
  lookup(
    input: BarLookupInput,
    registry: ResolvedRegistry,
  ): Promise<CheckOutcome>;
}

export const STATE_BAR_ADAPTERS = Symbol('STATE_BAR_ADAPTERS');

/** One setting of an adapter, as the admin form shows it. */
export interface RegistryFieldDescriptor {
  name: string;
  label: string;
  required: boolean;
  placeholder?: string;
  help?: string;
  /** Allowed values (a select in the form). */
  options?: string[];
}

export interface RegistryAdapterDescriptor {
  type: RegistryAdapterType;
  label: string;
  description: string;
  fields: RegistryFieldDescriptor[];
  /** Whether the adapter uses the key field, and if it must be set. */
  secret: 'none' | 'optional' | 'required';
  secretLabel?: string;
}

const RATE_FIELD: RegistryFieldDescriptor = {
  name: 'ratePerMin',
  label: 'Requests per minute (limit)',
  required: false,
  placeholder: String(10),
  help: 'Polite use: at most this many lookups a minute to this registry (default 10).',
};

const NAME_HELP =
  'Path in the JSON answer, dots between keys, numbers for list items: results.0.last_name';

export const REGISTRY_ADAPTERS: RegistryAdapterDescriptor[] = [
  {
    type: 'manual',
    label: 'Вручную (ссылка на сайт коллегии)',
    description:
      'No automatic check. Lawyers are approved on their sworn statement; a verifier opens the bar profile link when needed.',
    fields: [],
    secret: 'none',
  },
  {
    type: 'ny_open_data',
    label: 'New York — data.ny.gov (готовый)',
    description:
      'Official NYS Attorney Registrations dataset (eqw2-r5nb). Free; works without a key, an app token raises the rate limit.',
    fields: [],
    secret: 'optional',
    secretLabel: 'App token (optional)',
  },
  {
    type: 'socrata',
    label: 'Open data portal (Socrata)',
    description:
      'Any state that publishes its attorney list on a Socrata portal (data.<state>.gov): enter the dataset and its column names.',
    fields: [
      {
        name: 'domain',
        label: 'Portal domain',
        required: true,
        placeholder: 'data.ny.gov',
      },
      {
        name: 'datasetId',
        label: 'Dataset id',
        required: true,
        placeholder: 'eqw2-r5nb',
      },
      {
        name: 'numberField',
        label: 'Bar number column',
        required: true,
        placeholder: 'registration_number',
      },
      {
        name: 'firstNameField',
        label: 'First name column',
        required: false,
        placeholder: 'first_name',
      },
      {
        name: 'lastNameField',
        label: 'Last name column',
        required: true,
        placeholder: 'last_name',
      },
      {
        name: 'statusField',
        label: 'Status column',
        required: false,
        placeholder: 'status',
      },
      {
        name: 'admittedField',
        label: 'Admission date column',
        required: false,
        placeholder: 'year_admitted',
      },
      {
        name: 'activeValues',
        label: 'Statuses that mean "active"',
        required: false,
        placeholder: 'Currently registered, Active',
        help: 'Comma separated, any case. Empty = any record found counts as active.',
      },
      {
        name: 'profileUrl',
        label: 'Public profile link (optional)',
        required: false,
        placeholder: 'https://…/{bar_number}',
      },
    ],
    secret: 'optional',
    secretLabel: 'App token (optional)',
  },
  {
    type: 'generic_rest',
    label: 'Любой REST API (ключ от коллегии или сервиса)',
    description:
      'A state bar or a paid verification service with a JSON API. The URL takes {bar_number}, {state}, {first_name}, {last_name}; the answer is read by the paths below.',
    fields: [
      {
        name: 'urlTemplate',
        label: 'Request URL',
        required: true,
        placeholder:
          'https://api.example.com/v1/attorneys?state={state}&number={bar_number}',
      },
      {
        name: 'authType',
        label: 'How the key is sent',
        required: true,
        options: ['none', 'header', 'bearer', 'query'],
        help: 'header = a header named below; bearer = Authorization: Bearer <key>; query = a URL parameter named below.',
      },
      {
        name: 'authName',
        label: 'Header / parameter name',
        required: false,
        placeholder: 'X-API-Key',
      },
      {
        name: 'recordPath',
        label: 'Path to the record',
        required: false,
        placeholder: 'results.0',
        help: 'Empty = the whole answer; a list answer uses its first item.',
      },
      {
        name: 'statusPath',
        label: 'Status path',
        required: false,
        placeholder: 'status',
        help: NAME_HELP,
      },
      {
        name: 'firstNamePath',
        label: 'First name path',
        required: false,
        placeholder: 'first_name',
      },
      {
        name: 'lastNamePath',
        label: 'Last name path',
        required: false,
        placeholder: 'last_name',
      },
      {
        name: 'fullNamePath',
        label: 'Full name path (when there is no last name)',
        required: false,
        placeholder: 'name',
      },
      {
        name: 'admittedPath',
        label: 'Admission date path',
        required: false,
        placeholder: 'admitted',
      },
      {
        name: 'expiresPath',
        label: 'Valid-until date path',
        required: false,
        placeholder: 'expires',
      },
      {
        name: 'activeValues',
        label: 'Statuses that mean "active"',
        required: false,
        placeholder: 'Active, Active - Good Standing',
        help: 'Comma separated, any case. Empty = any record found counts as active.',
      },
      {
        name: 'method',
        label: 'HTTP method',
        required: false,
        options: ['GET', 'POST'],
        help: 'POST sends the body below (Indiana, Ohio).',
      },
      {
        name: 'bodyType',
        label: 'POST body type',
        required: false,
        options: ['json', 'form'],
      },
      {
        name: 'bodyTemplate',
        label: 'POST body',
        required: false,
        placeholder: '{"AttorneyNumber":"{bar_number}","Page":1}',
        help: 'Takes {bar_number}, {state}, {first_name}, {last_name}.',
      },
      {
        name: 'headers',
        label: 'Extra headers (JSON)',
        required: false,
        placeholder: '{"X-Requested-With":"XMLHttpRequest"}',
      },
      {
        name: 'bootstrapUrl',
        label: 'Start page (cookies / CSRF token)',
        required: false,
        placeholder: 'https://registry.example/search/',
      },
      {
        name: 'csrfSelector',
        label: 'CSRF token on the start page',
        required: false,
        placeholder: 'css:meta[name=csrf-token]@content',
      },
      {
        name: 'csrfHeader',
        label: 'CSRF header name',
        required: false,
        placeholder: 'X-CSRF-TOKEN',
      },
      {
        name: 'numberPath',
        label: 'Bar number path (pick the record from a list)',
        required: false,
        placeholder: 'AttorneyNumber',
      },
      {
        name: 'profileUrl',
        label: 'Public profile link (optional)',
        required: false,
        placeholder: 'https://…/{bar_number}',
      },
      RATE_FIELD,
    ],
    secret: 'optional',
    secretLabel: 'API key',
  },
  {
    type: 'state_preset',
    label: 'Готовый: официальный сайт штата',
    description:
      "Ready-made settings for this state's public lookup page or API (tested 2026-10-28). Nothing to fill in; one lookup per new license, 24 h cache, rate limit and circuit breaker.",
    fields: [RATE_FIELD],
    secret: 'none',
  },
  {
    type: 'html_page',
    label: 'Публичная страница коллегии (HTML)',
    description:
      'A public lookup page with a stable address per bar number, or a search form. Values are read with selectors: css:<selector>[@attr], label:<caption>, regex:<pattern>; join two with " && ".',
    fields: [
      {
        name: 'urlTemplate',
        label: 'Page / form address',
        required: true,
        placeholder: 'https://registry.example/attorney/{bar_number}',
      },
      {
        name: 'method',
        label: 'HTTP method',
        required: false,
        options: ['GET', 'POST'],
      },
      {
        name: 'bodyTemplate',
        label: 'Form fields (POST)',
        required: false,
        placeholder: 'brnum={bar_number}',
      },
      {
        name: 'numberFormat',
        label: 'Bar number as the site wants it',
        required: false,
        options: ['as_typed', 'digits'],
      },
      {
        name: 'numberPad',
        label: 'Pad with zeros to this many digits',
        required: false,
        placeholder: '6',
      },
      {
        name: 'bootstrapUrl',
        label: 'Start page (cookies, hidden fields)',
        required: false,
      },
      {
        name: 'bootstrapHidden',
        label: 'Send the hidden fields of the start page',
        required: false,
        options: ['no', 'yes'],
      },
      { name: 'referer', label: 'Referer header', required: false },
      {
        name: 'csrfSelector',
        label: 'CSRF token on the start page',
        required: false,
      },
      { name: 'csrfHeader', label: 'CSRF header name', required: false },
      {
        name: 'detailLinkSelector',
        label: 'Link to the detail page in the result',
        required: false,
      },
      {
        name: 'recordSelector',
        label: 'One result (row / card)',
        required: false,
        placeholder: 'table.results tbody tr',
      },
      { name: 'numberSelector', label: 'Bar number', required: false },
      { name: 'nameSelector', label: 'Full name', required: false },
      { name: 'firstNameSelector', label: 'First name', required: false },
      { name: 'lastNameSelector', label: 'Last name', required: false },
      {
        name: 'statusSelector',
        label: 'License status',
        required: false,
        help: 'Empty = the page has no status; a found record then goes to a verifier.',
      },
      {
        name: 'activeValues',
        label: 'Statuses that mean "active"',
        required: false,
        placeholder: 'Active',
      },
      { name: 'admittedSelector', label: 'Admission date', required: false },
      { name: 'expiresSelector', label: 'Valid until', required: false },
      { name: 'firmSelector', label: 'Firm', required: false },
      {
        name: 'profileUrl',
        label: 'Public profile link (optional)',
        required: false,
      },
      RATE_FIELD,
    ],
    secret: 'none',
  },
];

export function adapterDescriptor(
  type: string,
): RegistryAdapterDescriptor | undefined {
  return REGISTRY_ADAPTERS.find((a) => a.type === type);
}

/** {bar_number}, {state}, {first_name}, {last_name} → URL-encoded values
 * (or JSON-string-escaped for a JSON body). */
export function fillTemplate(
  template: string,
  input: BarLookupInput,
  mode: 'url' | 'json' = 'url',
): string {
  const values: Record<string, string> = {
    bar_number: input.barNumber,
    state: input.stateCode,
    first_name: input.firstName,
    last_name: input.lastName,
  };
  return template.replace(
    /\{(bar_number|state|first_name|last_name)\}/g,
    (_, k: string) =>
      mode === 'json'
        ? JSON.stringify(values[k] ?? '').slice(1, -1)
        : encodeURIComponent(values[k] ?? ''),
  );
}

/**
 * Owner 2026-10-28: the bar number the way the state's site wants it —
 * as typed (trimmed), digits only, and/or zero-padded (ND 5, ME 6, WA 12).
 */
export function formatBarNumber(
  raw: string,
  config: Record<string, string>,
): string {
  let n = raw.trim();
  if (config.numberFormat === 'digits' || config.numberPad) {
    n = n.replace(/\D/g, '');
  }
  const pad = Number(config.numberPad);
  if (Number.isInteger(pad) && pad > 0 && pad <= 20 && n) {
    n = n.replace(/^0+(?=\d)/, '').padStart(pad, '0');
  }
  return n;
}
