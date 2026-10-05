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
] as const;
export type RegistryAdapterType = (typeof REGISTRY_ADAPTER_TYPES)[number];

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

export interface BarLookupDetails {
  provider: string;
  found: boolean;
  licenseStatus: 'active' | 'inactive' | null;
  name: string | null;
  admittedAt: string | null;
  sourceUrl: string | null;
  raw?: string;
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
        name: 'activeValues',
        label: 'Statuses that mean "active"',
        required: false,
        placeholder: 'Active, Active - Good Standing',
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
    secretLabel: 'API key',
  },
];

export function adapterDescriptor(
  type: string,
): RegistryAdapterDescriptor | undefined {
  return REGISTRY_ADAPTERS.find((a) => a.type === type);
}

/** {bar_number}, {state}, {first_name}, {last_name} → URL-encoded values. */
export function fillTemplate(template: string, input: BarLookupInput): string {
  const values: Record<string, string> = {
    bar_number: input.barNumber,
    state: input.stateCode,
    first_name: input.firstName,
    last_name: input.lastName,
  };
  return template.replace(
    /\{(bar_number|state|first_name|last_name)\}/g,
    (_, k: string) => encodeURIComponent(values[k] ?? ''),
  );
}
