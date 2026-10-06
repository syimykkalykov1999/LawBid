/**
 * Owner 2026-10-01: the third-party services whose keys the owner manages
 * in the admin (Integrations & API keys). Each field says whether it is a
 * secret (write-only, masked), its format, and which env var is the
 * fallback while no version is active in the DB. Infrastructure secrets
 * (database, Redis, JWT, S3/IAM, the master key itself) are deliberately
 * NOT here — a wrong value there would take the whole app down.
 */
export interface ProviderField {
  name: string;
  label: string;
  secret: boolean;
  required: boolean;
  pattern?: RegExp;
  patternHint?: string;
  env?: string;
  /**
   * Owner 2026-10-06: fixes the usual paste slips before the format check
   * (a CDN hostname pasted with https://, a PEM key that lost its line
   * breaks in a one-line input…), so a correct key is never rejected.
   */
  normalize?: (v: string) => string;
}

/** Quotes / a trailing comma around a pasted value (copied from JSON). */
export function cleanPasted(v: string): string {
  let s = v.trim();
  if (s.endsWith(',')) s = s.slice(0, -1).trim();
  if (s.length >= 2 && /^(["'`]).*\1$/s.test(s)) s = s.slice(1, -1).trim();
  return s;
}

const PEM = /-----BEGIN ([A-Z ]+)-----([\s\S]*?)-----END \1-----/;

/**
 * A PEM private key in any of the shapes a paste produces: real line
 * breaks, literal "\n" (copied from the Firebase JSON), or everything on
 * one line with spaces (a single-line input drops the breaks). Returns the
 * canonical multi-line PEM; anything that is not a PEM is left unchanged.
 */
export function normalizePem(v: string): string {
  const text = cleanPasted(v).replace(/\\n/g, '\n').replace(/\r/g, '');
  const m = PEM.exec(text);
  if (!m) return text;
  const body = m[2].replace(/\s+/g, '');
  if (!/^[A-Za-z0-9+/=]+$/.test(body)) return text;
  const lines = body.match(/.{1,64}/g) ?? [];
  return `-----BEGIN ${m[1]}-----\n${lines.join('\n')}\n-----END ${m[1]}-----\n`;
}

/** "https://vz-abc.b-cdn.net/" → "vz-abc.b-cdn.net". */
function hostOnly(v: string): string {
  return cleanPasted(v)
    .replace(/^[a-z]+:\/\//i, '')
    .replace(/[/?#].*$/, '')
    .toLowerCase();
}

/** "a, b ,c" → "a,b,c". */
function commaList(v: string): string {
  return cleanPasted(v)
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean)
    .join(',');
}

/** "+1 (218) 551-6788" → "+12185516788". */
function phone(v: string): string {
  return cleanPasted(v).replace(/[\s().-]/g, '');
}

export interface ProviderDefinition {
  id: string;
  label: string;
  description: string;
  fields: ProviderField[];
  /** The server reads it only at boot (Sentry). */
  restartRequired?: boolean;
  /** Something outside LawBid must change together (TURN server). */
  warning?: string;
  /** A cheap read-only call; throws with a readable message on failure. */
  test?: (f: Record<string, string>) => Promise<void>;
}

const TIMEOUT_MS = 8_000;

async function probe(url: string, init: RequestInit): Promise<void> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal });
    if (res.status === 401 || res.status === 403) {
      throw new Error(
        `Rejected by the provider (HTTP ${res.status}): wrong key?`,
      );
    }
    if (!res.ok) throw new Error(`Provider answered HTTP ${res.status}`);
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError') {
      throw new Error('The provider did not answer in 8 s');
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

export const PROVIDERS: ProviderDefinition[] = [
  {
    id: 'bunny_stream',
    label: 'Bunny Stream (video)',
    description:
      'Video in posts: uploads straight from the phone, encoding, the CDN.',
    fields: [
      {
        name: 'libraryId',
        label: 'Video library ID',
        secret: false,
        required: true,
        pattern: /^\d{1,12}$/,
        patternHint: 'digits, e.g. 123456',
        env: 'BUNNY_LIBRARY_ID',
      },
      {
        name: 'cdnHostname',
        label: 'CDN hostname',
        secret: false,
        required: true,
        pattern: /^[a-z0-9.-]+\.[a-z]{2,}$/i,
        patternHint: 'e.g. vz-abc123.b-cdn.net',
        env: 'BUNNY_CDN_HOSTNAME',
        normalize: hostOnly,
      },
      {
        name: 'apiKey',
        label: 'Library API key',
        secret: true,
        required: true,
        pattern: /^[\w-]{20,}$/,
        env: 'BUNNY_API_KEY',
      },
      {
        name: 'tokenAuthKey',
        label: 'CDN token authentication key',
        secret: true,
        required: true,
        pattern: /^[\w-]{16,}$/,
        env: 'BUNNY_TOKEN_AUTH_KEY',
      },
      {
        name: 'webhookToken',
        label: 'Webhook token (any long random string)',
        secret: true,
        required: true,
        pattern: /^[\w-]{24,}$/,
        patternHint: '24+ letters / digits',
        env: 'BUNNY_WEBHOOK_TOKEN',
      },
    ],
    test: (f) =>
      probe(
        `https://video.bunnycdn.com/library/${f.libraryId}/videos?page=1&itemsPerPage=1`,
        { headers: { AccessKey: f.apiKey, accept: 'application/json' } },
      ),
  },
  {
    id: 'google_translate',
    label: 'Google Translate',
    description:
      'The "Translate" button in chats, the feed, cases and bids, reviews and profiles. Where it works is set on this card (all zones or chosen ones); the chat_translate flag turns it on.',
    fields: [
      {
        name: 'apiKey',
        label: 'API key (Cloud Translation API)',
        secret: true,
        required: true,
        pattern: /^[\w-]{30,}$/,
        patternHint: 'AIza…',
        env: 'GOOGLE_TRANSLATE_API_KEY',
      },
    ],
    test: (f) =>
      probe(
        `https://translation.googleapis.com/language/translate/v2/languages?key=${encodeURIComponent(f.apiKey)}`,
        { method: 'GET' },
      ),
  },
  {
    id: 'stripe',
    label: 'Stripe (payments)',
    description: 'Subscriptions, checkout, the customer portal.',
    fields: [
      {
        name: 'secretKey',
        label: 'Secret key',
        secret: true,
        required: true,
        pattern: /^(sk|rk)_(test|live)_[A-Za-z0-9]{10,}$/,
        patternHint: 'sk_live_… / sk_test_…',
        env: 'STRIPE_SECRET_KEY',
      },
      {
        name: 'webhookSecret',
        label: 'Webhook signing secret',
        secret: true,
        required: true,
        pattern: /^whsec_[A-Za-z0-9]{10,}$/,
        env: 'STRIPE_WEBHOOK_SECRET',
      },
      {
        name: 'connectWebhookSecret',
        // Owner 2026-10-05: client → attorney payments (Stripe Connect):
        // the "Connect" webhook endpoint has its own signing secret.
        label: 'Connect webhook signing secret (client → attorney payments)',
        secret: true,
        required: false,
        pattern: /^whsec_[A-Za-z0-9]{10,}$/,
        env: 'STRIPE_CONNECT_WEBHOOK_SECRET',
      },
      {
        name: 'priceId',
        // Owner 2026-10-03: optional — Billing → Prices creates the Stripe
        // prices itself; these ids are only the fallback.
        label: 'Monthly price ID (optional)',
        secret: false,
        required: false,
        pattern: /^price_[A-Za-z0-9]+$/,
        env: 'STRIPE_PRICE_ID',
      },
      {
        name: 'priceSeatId',
        label: 'Assistant seat price ID',
        secret: false,
        required: false,
        pattern: /^price_[A-Za-z0-9]+$/,
        env: 'STRIPE_PRICE_SEAT_ID',
      },
      {
        name: 'priceYearlyId',
        label: 'Yearly (Prime) price ID',
        secret: false,
        required: false,
        pattern: /^price_[A-Za-z0-9]+$/,
        env: 'STRIPE_PRICE_YEARLY_ID',
      },
    ],
    test: (f) =>
      probe('https://api.stripe.com/v1/balance', {
        headers: { authorization: `Bearer ${f.secretKey}` },
      }),
  },
  {
    id: 'twilio',
    label: 'Twilio (SMS codes)',
    description: 'Sign-in and verification codes by SMS.',
    fields: [
      {
        name: 'accountSid',
        label: 'Account SID',
        secret: false,
        required: true,
        pattern: /^AC[0-9a-fA-F]{32}$/,
        env: 'TWILIO_ACCOUNT_SID',
      },
      {
        name: 'authToken',
        label: 'Auth token',
        secret: true,
        required: true,
        pattern: /^[0-9a-fA-F]{32}$/,
        env: 'TWILIO_AUTH_TOKEN',
      },
      {
        name: 'fromNumber',
        label: 'From number',
        secret: false,
        required: false,
        pattern: /^\+[1-9]\d{7,14}$/,
        patternHint: '+15551234567',
        env: 'TWILIO_FROM_NUMBER',
        normalize: phone,
      },
      {
        name: 'messagingServiceSid',
        label: 'Messaging service SID',
        secret: false,
        required: false,
        pattern: /^MG[0-9a-fA-F]{32}$/,
        env: 'TWILIO_MESSAGING_SERVICE_SID',
      },
      {
        name: 'androidAppHash',
        label: 'Android SMS auto-fill hash',
        secret: false,
        required: false,
        pattern: /^[A-Za-z0-9+/]{11}$/,
        patternHint: '11 characters from the Play Console',
        env: 'SMS_ANDROID_APP_HASH',
      },
    ],
    test: (f) =>
      probe(`https://api.twilio.com/2010-04-01/Accounts/${f.accountSid}.json`, {
        headers: {
          authorization: `Basic ${Buffer.from(
            `${f.accountSid}:${f.authToken}`,
          ).toString('base64')}`,
        },
      }),
  },
  {
    id: 'ses',
    label: 'Email sender (Amazon SES)',
    description:
      'The sender address and region (the AWS access itself is the server role).',
    fields: [
      {
        name: 'region',
        label: 'Region',
        secret: false,
        required: true,
        pattern: /^[a-z]{2}(-[a-z]+)+-\d$/,
        patternHint: 'us-east-1',
        env: 'SES_REGION',
      },
      {
        name: 'fromAddress',
        label: 'From address',
        secret: false,
        required: true,
        pattern: /^(.+<[^@\s]+@[^@\s]+\.[^@\s>]+>|[^@\s]+@[^@\s]+\.[^@\s]+)$/,
        patternHint: 'LawBid <no-reply@lawbid.app>',
        env: 'SES_FROM_ADDRESS',
      },
      {
        name: 'accessKeyId',
        label: 'AWS access key ID (only without a server role)',
        secret: false,
        required: false,
        pattern: /^(AKIA|ASIA)[A-Z0-9]{16}$/,
        env: 'AWS_ACCESS_KEY_ID',
      },
      {
        name: 'secretAccessKey',
        label: 'AWS secret access key',
        secret: true,
        required: false,
        pattern: /^[A-Za-z0-9/+=]{40}$/,
        env: 'AWS_SECRET_ACCESS_KEY',
      },
    ],
  },
  {
    id: 'fcm',
    label: 'Firebase Cloud Messaging (push)',
    description: 'Push notifications to iPhone and Android.',
    fields: [
      {
        name: 'projectId',
        label: 'Project ID',
        secret: false,
        required: true,
        pattern: /^[a-z][a-z0-9-]{4,}$/,
        env: 'FCM_PROJECT_ID',
        normalize: (v) => cleanPasted(v).toLowerCase(),
      },
      {
        name: 'clientEmail',
        label: 'Service account email',
        secret: false,
        required: true,
        pattern: /^[^@\s]+@[^@\s]+\.iam\.gserviceaccount\.com$/,
        env: 'FCM_CLIENT_EMAIL',
      },
      {
        name: 'privateKey',
        label: 'Private key (PEM)',
        secret: true,
        required: true,
        pattern: /-----BEGIN PRIVATE KEY-----/,
        env: 'FCM_PRIVATE_KEY',
        normalize: normalizePem,
      },
    ],
  },
  {
    id: 'turn',
    label: 'TURN / STUN (in-app calls)',
    description: 'Relays for calls when the phones cannot connect directly.',
    warning:
      'Change the secret on the TURN server (coturn) at the same time, or calls through TURN stop.',
    fields: [
      {
        name: 'urls',
        label: 'TURN URLs (comma-separated)',
        secret: false,
        required: true,
        pattern: /^turns?:[^,\s]+(,turns?:[^,\s]+)*$/,
        env: 'TURN_URLS',
        normalize: commaList,
      },
      {
        name: 'secret',
        label: 'Shared secret',
        secret: true,
        required: true,
        pattern: /^.{16,}$/,
        env: 'TURN_SECRET',
      },
      {
        name: 'stunUrls',
        label: 'STUN URLs (comma-separated)',
        secret: false,
        required: false,
        pattern: /^stuns?:[^,\s]+(,stuns?:[^,\s]+)*$/,
        env: 'STUN_URLS',
        normalize: commaList,
      },
    ],
  },
  {
    id: 'persona',
    label: 'Persona (ID checks)',
    description: 'Identity verification of attorneys.',
    fields: [
      {
        name: 'apiKey',
        label: 'API key',
        secret: true,
        required: true,
        pattern: /^persona_(sandbox|production)_[\w-]+$/,
        env: 'PERSONA_API_KEY',
      },
    ],
    test: (f) =>
      probe('https://withpersona.com/api/v1/accounts?page%5Bsize%5D=1', {
        headers: { authorization: `Bearer ${f.apiKey}` },
      }),
  },
  {
    id: 'google_signin',
    label: 'Google sign-in',
    description: 'OAuth client IDs of the iOS / Android / web apps.',
    fields: [
      {
        name: 'clientIds',
        label: 'Client IDs (comma-separated)',
        secret: false,
        required: true,
        pattern:
          /^\d+-[\w]+\.apps\.googleusercontent\.com(,\d+-[\w]+\.apps\.googleusercontent\.com)*$/,
        env: 'GOOGLE_CLIENT_IDS',
        normalize: commaList,
      },
    ],
  },
  {
    id: 'apple_signin',
    label: 'Apple sign-in',
    description: 'Sign in with Apple on iPhone (bundle ids of the apps).',
    fields: [
      {
        name: 'bundleIds',
        label: 'Bundle IDs (comma-separated)',
        secret: false,
        required: true,
        pattern: /^[\w.-]+(,[\w.-]+)*$/,
        patternHint: 'com.lawbid.app',
        env: 'APPLE_BUNDLE_IDS',
        normalize: commaList,
      },
      {
        name: 'teamId',
        label: 'Team ID',
        secret: false,
        required: false,
        pattern: /^[A-Z0-9]{10}$/,
        env: 'APPLE_TEAM_ID',
        normalize: (v) => cleanPasted(v).toUpperCase(),
      },
    ],
  },
  {
    // Owner 2026-10-04: lawyers verify with state + bar number only. New
    // York's attorney registry is a free open dataset; the token is
    // optional (it only raises the anonymous rate limit). Other states
    // have no API: the verifier opens the state bar profile link.
    id: 'ny_registry',
    label: 'NY attorney registry (data.ny.gov)',
    description:
      'Automatic check of New York bar numbers. Works without a key; an app token from data.ny.gov raises the rate limit.',
    fields: [
      {
        name: 'appToken',
        label: 'App token (optional)',
        secret: true,
        required: false,
        pattern: /^[A-Za-z0-9]{10,}$/,
        env: 'NY_OPEN_DATA_APP_TOKEN',
      },
    ],
    test: (f) =>
      probe('https://data.ny.gov/resource/eqw2-r5nb.json?$limit=1', {
        headers: f.appToken ? { 'X-App-Token': f.appToken } : {},
      }),
  },
  {
    id: 'storage',
    label: 'File storage (Amazon S3 / CDN)',
    description:
      'Photos, documents, voice notes and the media CDN. On AWS the server role is used when the keys are empty.',
    warning:
      'Changing the buckets makes the files stored in the old buckets unreachable — change only the keys unless you moved the files.',
    fields: [
      {
        name: 'region',
        label: 'Region',
        secret: false,
        required: true,
        pattern: /^[a-z]{2}(-[a-z]+)+-\d$/,
        patternHint: 'us-east-1',
        env: 'S3_REGION',
      },
      {
        name: 'bucketDocuments',
        label: 'Documents bucket',
        secret: false,
        required: true,
        pattern: /^[a-z0-9][a-z0-9.-]{2,62}$/,
        env: 'S3_BUCKET_DOCUMENTS',
      },
      {
        name: 'bucketMedia',
        label: 'Media bucket',
        secret: false,
        required: true,
        pattern: /^[a-z0-9][a-z0-9.-]{2,62}$/,
        env: 'S3_BUCKET_MEDIA',
      },
      {
        name: 'accessKeyId',
        label: 'Access key ID (empty = the server role)',
        secret: false,
        required: false,
        pattern: /^[A-Za-z0-9]{16,128}$/,
        env: 'S3_ACCESS_KEY_ID',
      },
      {
        name: 'secretAccessKey',
        label: 'Secret access key',
        secret: true,
        required: false,
        pattern: /^.{16,}$/,
        env: 'S3_SECRET_ACCESS_KEY',
      },
      {
        name: 'cdnBaseUrl',
        label: 'Media CDN base URL',
        secret: false,
        required: false,
        pattern: /^https:\/\/[^\s/]+(\/[^\s]*)?$/,
        patternHint: 'https://media.lawbid.app',
        env: 'MEDIA_CDN_BASE_URL',
      },
    ],
  },
  {
    id: 'sentry',
    label: 'Sentry (error reports)',
    description: 'Crash and error reports of the server.',
    restartRequired: true,
    fields: [
      {
        name: 'dsn',
        label: 'DSN',
        secret: true,
        required: true,
        pattern: /^https:\/\/[^@\s]+@[^\s]+\/\d+$/,
        env: 'SENTRY_DSN',
      },
    ],
  },
  // Owner 2026-10-05: zero maintenance — the worker checks every hour that
  // CockroachDB Cloud made a fresh backup (Система → Здоровье системы).
  {
    id: 'cockroach_cloud',
    label: 'CockroachDB Cloud (backup check)',
    description:
      'Read-only API key of the database cloud: the server checks every hour that a fresh backup exists.',
    fields: [
      {
        name: 'apiKey',
        label: 'API key (service account, read-only)',
        secret: true,
        required: true,
        pattern: /^\S{20,}$/,
        env: 'COCKROACH_CLOUD_API_KEY',
      },
      {
        name: 'clusterId',
        label: 'Cluster ID',
        secret: false,
        required: true,
        pattern: /^[0-9a-f-]{36}$/,
        patternHint: '00000000-0000-0000-0000-000000000000',
        env: 'COCKROACH_CLUSTER_ID',
        normalize: (v) => cleanPasted(v).toLowerCase(),
      },
    ],
    test: (f) =>
      probe(
        `https://cockroachlabs.cloud/api/v1/clusters/${encodeURIComponent(f.clusterId)}`,
        { headers: { Authorization: `Bearer ${f.apiKey}` } },
      ),
  },
];

export function providerById(id: string): ProviderDefinition | undefined {
  return PROVIDERS.find((p) => p.id === id);
}
