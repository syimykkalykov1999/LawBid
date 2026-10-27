/**
 * Owner 2026-10-01: the third-party services whose keys the owner manages
 * in the admin (Integrations & API keys). Each field says whether it is a
 * secret (write-only, masked), its format, and which env var is the
 * fallback while no version is active in the DB. Infrastructure secrets
 * (database, Redis, JWT, S3/IAM, the master key itself) are deliberately
 * NOT here — a wrong value there would take the whole app down.
 */
import { HeadBucketCommand, S3Client } from '@aws-sdk/client-s3';

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

/** TS-6: a Cloudflare App / TURN key created a moment ago answers 404 for
 * up to 60 s; «Проверить» must say so instead of a bare «HTTP 404». */
export const CLOUDFLARE_FRESH_KEY_404 =
  'Cloudflare ещё не раздал новый App / ключ (ID не найден, до 60 с после создания). Подождите минуту и нажмите «Проверить» снова; если не помогает — проверьте ID.';

async function probe(
  url: string,
  init: RequestInit,
  opts: { notFound?: string } = {},
): Promise<void> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal });
    if (res.status === 401 || res.status === 403) {
      throw new Error(
        `Rejected by the provider (HTTP ${res.status}): wrong key?`,
      );
    }
    if (res.status === 404 && opts.notFound) throw new Error(opts.notFound);
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

/** PagerDuty CloudWatch / Events integration link (US or EU service region). */
export const PAGERDUTY_URL =
  /^https:\/\/events(\.eu)?\.pagerduty\.com\/integration\/[A-Za-z0-9]{16,64}\/enqueue$/;

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
      {
        // Audit #4 (2026-10-22): Bunny signs webhooks (X-BunnyStream-
        // Signature, HMAC-SHA256 of the body) with this key. Optional:
        // while empty the URL token above is the only check.
        name: 'readOnlyApiKey',
        label: 'Read-only API key (verifies webhook signatures)',
        secret: true,
        required: false,
        pattern: /^[\w-]{20,}$/,
        env: 'BUNNY_READ_ONLY_API_KEY',
      },
      {
        // Batch C item 16 (2026-10-24): the daily usage poll asks the Core
        // API (GET api.bunny.net/statistics, /videolibrary/{id}); that API
        // takes the ACCOUNT API key, not the library key above. Optional:
        // empty = no usage alerts.
        name: 'accountApiKey',
        label: 'Account API key (usage statistics, optional)',
        secret: true,
        required: false,
        pattern: /^[\w-]{20,}$/,
        env: 'BUNNY_ACCOUNT_API_KEY',
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
        name: 'publishableKey',
        // Owner 2026-10-16: our own card page (Stripe.js on lawbid.dev)
        // needs the public key; empty = Stripe's hosted page is used.
        label: 'Publishable key (our card page)',
        secret: false,
        required: false,
        pattern: /^pk_(test|live)_[A-Za-z0-9]{10,}$/,
        patternHint: 'pk_live_… / pk_test_…',
        env: 'STRIPE_PUBLISHABLE_KEY',
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
    // Owner 2026-10-17: incoming calls on iPhones go to Apple directly as
    // VoIP (PushKit) pushes — FCM can't send them. Apple Developer →
    // Keys → a key with "Apple Push Notifications service (APNs)".
    id: 'apns',
    label: 'Apple Push (APNs) — iPhone calls',
    description:
      'Rings incoming calls on iPhones even when the app is closed (VoIP pushes).',
    fields: [
      {
        name: 'keyId',
        label: 'Key ID',
        secret: false,
        required: true,
        pattern: /^[A-Z0-9]{10}$/,
        env: 'APNS_KEY_ID',
        normalize: (v) => cleanPasted(v).toUpperCase(),
      },
      {
        name: 'teamId',
        label: 'Team ID',
        secret: false,
        required: true,
        pattern: /^[A-Z0-9]{10}$/,
        env: 'APNS_TEAM_ID',
        normalize: (v) => cleanPasted(v).toUpperCase(),
      },
      {
        name: 'privateKey',
        label: 'Key file (.p8) contents',
        secret: true,
        required: true,
        pattern: /-----BEGIN PRIVATE KEY-----/,
        env: 'APNS_PRIVATE_KEY',
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
    id: 'cloudflare_turn',
    label: 'Cloudflare TURN (in-app calls)',
    description:
      'Cloudflare Realtime relays for calls (pay per traffic). Tried first; our own TURN server stays as the backup.',
    fields: [
      {
        name: 'keyId',
        label: 'TURN key ID',
        secret: false,
        required: true,
        pattern: /^[A-Za-z0-9_-]{8,64}$/,
        env: 'CLOUDFLARE_TURN_KEY_ID',
      },
      {
        name: 'apiToken',
        label: 'TURN key API token',
        secret: true,
        required: true,
        pattern: /^\S{16,}$/,
        env: 'CLOUDFLARE_TURN_API_TOKEN',
      },
      {
        // Batch C item 11 (2026-10-24): the daily usage poll reads the
        // GraphQL Analytics dataset callsTurnUsageAdaptiveGroups. Needs the
        // account id and a token with «Account Analytics: Read». Optional:
        // empty = no usage alerts.
        name: 'accountId',
        label: 'Cloudflare account ID (usage alerts, optional)',
        secret: false,
        required: false,
        pattern: /^[a-f0-9]{32}$/i,
        patternHint: '32 hex characters',
        env: 'CLOUDFLARE_ANALYTICS_ACCOUNT_ID',
      },
      {
        name: 'analyticsToken',
        label:
          'API token with Account Analytics: Read (usage alerts, optional)',
        secret: true,
        required: false,
        pattern: /^\S{16,}$/,
        env: 'CLOUDFLARE_ANALYTICS_API_TOKEN',
      },
    ],
    test: (f) =>
      probe(
        `https://rtc.live.cloudflare.com/v1/turn/keys/${encodeURIComponent(f.keyId)}/credentials/generate-ice-servers`,
        {
          method: 'POST',
          headers: {
            authorization: `Bearer ${f.apiToken}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify({ ttl: 60 }),
        },
        { notFound: CLOUDFLARE_FRESH_KEY_404 },
      ),
  },
  {
    id: 'cloudflare_sfu',
    label: 'Cloudflare SFU (group video calls)',
    description:
      'Cloudflare Realtime SFU for group calls (pay per outgoing traffic). Used as soon as the keys are saved (calls.transport = auto); while Cloudflare keeps failing, new group calls fall back to device-to-device (video up to 4 people, then audio only) and return by themselves.',
    fields: [
      {
        name: 'appId',
        label: 'App ID (CLOUDFLARE_SFU_APP_ID)',
        secret: false,
        required: true,
        pattern: /^[0-9a-f]{32}$/,
        patternHint: '32 hex characters',
        env: 'CLOUDFLARE_SFU_APP_ID',
      },
      {
        name: 'appToken',
        label: 'App Secret (CLOUDFLARE_SFU_APP_TOKEN)',
        secret: true,
        required: true,
        pattern: /^\S{16,}$/,
        env: 'CLOUDFLARE_SFU_APP_TOKEN',
      },
    ],
    // Creates one empty session (it expires on its own), read-only in effect.
    test: (f) =>
      probe(
        `https://rtc.live.cloudflare.com/v1/apps/${encodeURIComponent(f.appId)}/sessions/new`,
        {
          method: 'POST',
          headers: {
            authorization: `Bearer ${f.appToken}`,
            'content-type': 'application/json',
          },
        },
        { notFound: CLOUDFLARE_FRESH_KEY_404 },
      ),
  },
  {
    id: 'livekit',
    label: 'LiveKit (big video calls)',
    description:
      'Open-source media server for group and channel calls. Used only when «calls.video_provider» is set to livekit in Settings.',
    fields: [
      {
        name: 'url',
        label: 'Server address (LIVEKIT_URL)',
        secret: false,
        required: true,
        pattern: /^wss?:\/\/[^\s]+$/,
        patternHint: 'wss://your-project.livekit.cloud',
        env: 'LIVEKIT_URL',
        normalize: cleanPasted,
      },
      {
        name: 'apiKey',
        label: 'API key (LIVEKIT_API_KEY)',
        secret: true,
        required: true,
        pattern: /^[\w-]{6,}$/,
        env: 'LIVEKIT_API_KEY',
      },
      {
        name: 'apiSecret',
        label: 'API secret (LIVEKIT_API_SECRET)',
        secret: true,
        required: true,
        pattern: /^.{16,}$/,
        env: 'LIVEKIT_API_SECRET',
      },
    ],
  },
  {
    id: 'opensearch',
    label: 'Search engine (OpenSearch)',
    description:
      'A dedicated search engine for people, cases, posts and questions. Used only when «search.engine» is set to shadow or engine in Settings; searches fall back to Postgres if the engine fails or is slow. Off by default.',
    fields: [
      {
        name: 'url',
        label: 'Address (OPENSEARCH_URL)',
        secret: false,
        required: true,
        pattern: /^https?:\/\/[^\s]+$/,
        patternHint:
          'https://vpc-lawbid-search-xxxx.us-east-1.es.amazonaws.com',
        env: 'OPENSEARCH_URL',
        normalize: cleanPasted,
      },
      {
        name: 'username',
        label: 'User name (OPENSEARCH_USERNAME), if the engine asks for one',
        secret: false,
        required: false,
        env: 'OPENSEARCH_USERNAME',
      },
      {
        name: 'password',
        label: 'Password (OPENSEARCH_PASSWORD), if the engine asks for one',
        secret: true,
        required: false,
        env: 'OPENSEARCH_PASSWORD',
      },
      {
        name: 'prefix',
        label: 'Index name prefix (OPENSEARCH_PREFIX), default lawbid',
        secret: false,
        required: false,
        pattern: /^[a-z][a-z0-9_-]{1,30}$/,
        patternHint: 'lawbid or lawbid-loadtest',
        env: 'OPENSEARCH_PREFIX',
      },
    ],
    // Cluster answers its root page (read-only).
    test: async (f) => {
      const headers: Record<string, string> = {};
      if (f.username && f.password) {
        headers.authorization = `Basic ${Buffer.from(`${f.username}:${f.password}`).toString('base64')}`;
      }
      await probe(`${f.url.replace(/\/+$/, '')}/`, { headers });
    },
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
    // 2026-10-24 (abuse batch B, item 4): bot check of the WEB page on
    // sign-up and code requests. The app (iOS / Android) uses App Check.
    id: 'turnstile',
    label: 'Cloudflare Turnstile (защита сайта от ботов)',
    description:
      'Проверка «не бот» на сайте при регистрации и запросе кода. В приложении не используется (там App Check). Включается в Система → Настройки: security.turnstile.mode (off / monitor / enforce).',
    fields: [
      {
        name: 'secretKey',
        label: 'Секретный ключ (Secret key)',
        secret: true,
        required: true,
        pattern: /^[0-9A-Za-z_-]{20,80}$/,
        patternHint: '0x4AAAAAAA…',
        env: 'TURNSTILE_SECRET_KEY',
      },
      {
        name: 'siteKey',
        label: 'Ключ сайта (Site key, публичный)',
        secret: false,
        required: false,
        pattern: /^[0-9A-Za-z_-]{10,80}$/,
        patternHint: '0x4AAAAAAA…',
        env: 'TURNSTILE_SITE_KEY',
      },
      {
        name: 'hostnames',
        label: 'Разрешённые домены сайта (через запятую, пусто = любые)',
        secret: false,
        required: false,
        pattern: /^[a-z0-9.-]+(,[a-z0-9.-]+)*$/,
        patternHint: 'lawbid.dev,www.lawbid.dev',
        env: 'TURNSTILE_HOSTNAMES',
        normalize: (v) => commaList(v).toLowerCase(),
      },
    ],
    // siteverify answers invalid-input-response for a good secret and
    // invalid-input-secret for a bad one (developers.cloudflare.com/
    // turnstile/get-started/server-side-validation, 2026-10-22).
    test: async (f) => {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
      try {
        const res = await fetch(
          'https://challenges.cloudflare.com/turnstile/v0/siteverify',
          {
            method: 'POST',
            headers: { 'content-type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
              secret: f.secretKey,
              response: 'lawbid-key-check',
            }),
            signal: ctrl.signal,
          },
        );
        const body = (await res.json()) as { 'error-codes'?: string[] };
        const codes = body['error-codes'] ?? [];
        if (
          codes.includes('invalid-input-secret') ||
          codes.includes('missing-input-secret')
        ) {
          throw new Error(
            'Секретный ключ не принят Cloudflare: неверный ключ?',
          );
        }
      } catch (e) {
        if (e instanceof Error && e.name === 'AbortError') {
          throw new Error('Cloudflare не ответил за 8 с');
        }
        throw e;
      } finally {
        clearTimeout(timer);
      }
    },
  },
  {
    // Owner 2026-10-24: the phone-paging link. Saved here, the API itself
    // subscribes it to the SNS topic lawbid-prod-critical (admin «Запуск»).
    id: 'pagerduty',
    label: 'PagerDuty (звонок на телефон при аварии)',
    description:
      'Ссылка интеграции PagerDuty. После «Включить» сервер сам подписывает её на критический топик тревог AWS; подписка и тестовая тревога видны на странице «Запуск».',
    fields: [
      {
        name: 'integrationUrl',
        label: 'Integration URL',
        secret: true,
        required: true,
        pattern: PAGERDUTY_URL,
        patternHint: 'https://events.pagerduty.com/integration/<ключ>/enqueue',
        normalize: cleanPasted,
      },
    ],
    // No network call: the link is the secret and the only honest test is
    // the SNS subscription itself (shown on «Запуск»).
    test: (f) => {
      if (!PAGERDUTY_URL.test(f.integrationUrl ?? '')) {
        return Promise.reject(new Error('Это не ссылка интеграции PagerDuty.'));
      }
      return Promise.resolve();
    },
  },
  {
    // Owner 2026-10-24: «Запуск» compares the running version with the
    // newest commit of main. Optional: without it that item is a checkbox.
    id: 'github',
    label: 'GitHub (только чтение, для страницы «Запуск»)',
    description:
      'Чтобы страница «Запуск» сама видела, что запущена последняя версия main. Нужен токен только на чтение.',
    fields: [
      {
        name: 'repo',
        label: 'Репозиторий (владелец/имя)',
        secret: false,
        required: true,
        pattern: /^[\w.-]+\/[\w.-]+$/,
        patternHint: 'syimykkalykov1999/LawBid',
      },
      {
        name: 'token',
        label: 'Токен только на чтение (если репозиторий закрытый)',
        secret: true,
        required: false,
        pattern: /^(github_pat_|ghp_)[A-Za-z0-9_]{20,}$/,
        patternHint: 'github_pat_…',
      },
    ],
    test: (f) =>
      probe(`https://api.github.com/repos/${f.repo}`, {
        headers: {
          accept: 'application/vnd.github+json',
          'user-agent': 'lawbid-admin',
          ...(f.token ? { authorization: `Bearer ${f.token}` } : {}),
        },
      }),
  },
  {
    // Owner 2026-10-26: infra switches from the admin. A GitHub App (not a
    // personal token) installed on this repository only, with the
    // permission "Actions: read and write" and "Contents: read". The API
    // mints a 1-hour installation token narrowed to actions:write on this
    // one repository and starts the `infra-apply` workflow. Runbook:
    // docs/runbooks/infra-from-admin.md.
    id: 'github_infra',
    label: 'GitHub: изменения облака (GitHub App)',
    description:
      'Чтобы кнопки Выкл/Вкл для облака запускали проверенный процесс «план → ваш код 2FA → применить». Нужно GitHub-приложение с правом Actions: read and write только на этот репозиторий.',
    fields: [
      {
        name: 'repo',
        label: 'Репозиторий (владелец/имя)',
        secret: false,
        required: true,
        pattern: /^[\w.-]+\/[\w.-]+$/,
        patternHint: 'syimykkalykov1999/LawBid',
      },
      {
        name: 'appId',
        label: 'App ID',
        secret: false,
        required: true,
        pattern: /^\d{1,12}$/,
        patternHint: '1234567',
        normalize: cleanPasted,
      },
      {
        name: 'installationId',
        label: 'Installation ID',
        secret: false,
        required: true,
        pattern: /^\d{1,15}$/,
        patternHint: '55555555',
        normalize: cleanPasted,
      },
      {
        name: 'privateKey',
        label: 'Private key (.pem)',
        secret: true,
        required: true,
        pattern:
          /^-----BEGIN (RSA )?PRIVATE KEY-----[\s\S]+-----END (RSA )?PRIVATE KEY-----\s*$/,
        patternHint: '-----BEGIN RSA PRIVATE KEY-----…',
        normalize: normalizePem,
      },
    ],
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
    // Owner 2026-10-28: Google Calendar two-way link (OFF by default; switch
    // `calendar.google_enabled`). Guide: docs/runbooks/CALENDAR_GOOGLE_MICROSOFT.md
    id: 'google_calendar',
    label: 'Google Calendar (link a calendar)',
    description:
      'OAuth app for linking a Google calendar: busy time blocks booking, consultations are written to it.',
    fields: [
      {
        name: 'clientId',
        label: 'OAuth client ID (Web application)',
        secret: false,
        required: true,
        pattern: /^\d+-[\w]+\.apps\.googleusercontent\.com$/,
        env: 'GOOGLE_CALENDAR_CLIENT_ID',
        normalize: cleanPasted,
      },
      {
        name: 'clientSecret',
        label: 'OAuth client secret',
        secret: true,
        required: true,
        pattern: /^[\w-]{16,}$/,
        env: 'GOOGLE_CALENDAR_CLIENT_SECRET',
        normalize: cleanPasted,
      },
    ],
    warning:
      'Redirect URI in Google Cloud must be https://api.lawbid.dev/api/v1/calendar/oauth/google/callback',
  },
  {
    // Owner 2026-10-28: Outlook / Microsoft 365 two-way link (OFF by default;
    // switch `calendar.microsoft_enabled`).
    id: 'microsoft_calendar',
    label: 'Outlook calendar (link a calendar)',
    description:
      'Azure app registration for linking an Outlook / Microsoft 365 calendar.',
    fields: [
      {
        name: 'clientId',
        label: 'Application (client) ID',
        secret: false,
        required: true,
        pattern:
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
        env: 'MS_CALENDAR_CLIENT_ID',
        normalize: cleanPasted,
      },
      {
        name: 'clientSecret',
        label: 'Client secret VALUE (not the secret ID)',
        secret: true,
        required: true,
        pattern: /^[\w.~-]{20,}$/,
        env: 'MS_CALENDAR_CLIENT_SECRET',
        normalize: cleanPasted,
      },
      {
        name: 'tenant',
        label: 'Tenant (leave "common" for work + personal accounts)',
        secret: false,
        required: false,
        pattern: /^[\w.-]{3,64}$/,
        env: 'MS_CALENDAR_TENANT',
        normalize: cleanPasted,
      },
    ],
    warning:
      'Redirect URI in Azure must be https://api.lawbid.dev/api/v1/calendar/oauth/microsoft/callback',
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
      // Owner 2026-10-22 (systems checklist §22): private media (chat
      // photos/voice/files, case files, documents) through CloudFront
      // signed URLs. All three or none; empty = presigned S3 links.
      {
        name: 'privateCdnDomain',
        label: 'Private media CDN domain (CloudFront, signed URLs)',
        secret: false,
        required: false,
        pattern: /^[a-z0-9.-]+\.[a-z]{2,}$/,
        patternHint: 'd1234abcd.cloudfront.net',
        env: 'CLOUDFRONT_PRIVATE_DOMAIN',
        normalize: hostOnly,
      },
      {
        name: 'privateCdnKeyId',
        label: 'CloudFront public key ID (key group)',
        secret: false,
        required: false,
        pattern: /^[A-Z0-9]{10,20}$/,
        patternHint: 'K2JCJMDEHXQW5F',
        env: 'CLOUDFRONT_PRIVATE_KEY_ID',
      },
      {
        name: 'privateCdnPrivateKey',
        label: 'CloudFront signing private key (PEM)',
        secret: true,
        required: false,
        pattern:
          /^-----BEGIN (RSA )?PRIVATE KEY-----[\s\S]+-----END (RSA )?PRIVATE KEY-----\s*$/,
        patternHint: '-----BEGIN PRIVATE KEY-----…',
        env: 'CLOUDFRONT_PRIVATE_KEY_PEM',
        normalize: normalizePem,
      },
    ],
  },
  // Owner 2026-10-24: Cloudflare R2 for PUBLIC media only (avatars, post
  // and review photos, stickers). No egress fee. Private files stay on AWS.
  // Switched on with the setting media.public_store = r2.
  {
    id: 'cloudflare_r2',
    label: 'Public media storage (Cloudflare R2)',
    description:
      'Avatars, post and review photos and stickers, served from Cloudflare R2 (no egress fee) through a public custom domain. Private files (chats, cases, documents, verification) never go here. Turn on with the setting media.public_store = r2.',
    warning:
      'The R2 bucket must have a different name from the AWS buckets. Do not change the bucket after files were stored there.',
    fields: [
      {
        name: 'accountId',
        label: 'Cloudflare account ID',
        secret: false,
        required: true,
        pattern: /^[a-f0-9]{32}$/,
        patternHint: '32 hex characters',
        env: 'CLOUDFLARE_R2_ACCOUNT_ID',
      },
      {
        name: 'accessKeyId',
        label: 'R2 access key ID',
        secret: false,
        required: true,
        pattern: /^[A-Za-z0-9]{20,64}$/,
        env: 'CLOUDFLARE_R2_ACCESS_KEY_ID',
      },
      {
        name: 'secretAccessKey',
        label: 'R2 secret access key',
        secret: true,
        required: true,
        pattern: /^[A-Za-z0-9/+=]{32,}$/,
        env: 'CLOUDFLARE_R2_SECRET_ACCESS_KEY',
      },
      {
        name: 'bucket',
        label: 'R2 bucket name',
        secret: false,
        required: true,
        pattern: /^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/,
        env: 'CLOUDFLARE_R2_BUCKET',
      },
      {
        name: 'publicBaseUrl',
        label: 'Public base URL (custom domain of the bucket)',
        secret: false,
        required: true,
        pattern: /^https:\/\/[^\s/]+$/,
        patternHint: 'https://media.lawbid.dev',
        env: 'CLOUDFLARE_R2_PUBLIC_BASE_URL',
        normalize: (v) => cleanPasted(v).replace(/\/+$/, ''),
      },
      // Optional: instant removal of cached copies of deleted media.
      {
        name: 'zoneId',
        label: 'Zone ID (optional, cache purge on delete)',
        secret: false,
        required: false,
        pattern: /^[a-f0-9]{32}$/,
        env: 'CLOUDFLARE_R2_ZONE_ID',
      },
      {
        name: 'purgeToken',
        label: 'API token with Cache Purge only (optional)',
        secret: true,
        required: false,
        pattern: /^[A-Za-z0-9_-]{30,}$/,
        env: 'CLOUDFLARE_R2_PURGE_TOKEN',
      },
    ],
    test: async (f) => {
      const client = new S3Client({
        region: 'auto',
        endpoint: `https://${f.accountId}.r2.cloudflarestorage.com`,
        credentials: {
          accessKeyId: f.accessKeyId,
          secretAccessKey: f.secretAccessKey,
        },
      });
      try {
        await client.send(new HeadBucketCommand({ Bucket: f.bucket }), {
          abortSignal: AbortSignal.timeout(TIMEOUT_MS),
        });
      } catch (e) {
        throw new Error(
          `R2 refused the keys or the bucket: ${e instanceof Error ? e.message : String(e)}`,
        );
      } finally {
        client.destroy();
      }
    },
  },
  {
    id: 'sentry',
    label: 'Sentry (error reports)',
    description:
      'Crash and error reports of the server, the app and the admin.',
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
      // Owner 2026-10-20: the app and the admin panel report to their own
      // Sentry projects. A DSN only lets one SEND events, so it is public
      // by design: GET /config/bootstrap hands these to the clients
      // (no rebuild needed to change them).
      {
        name: 'mobileDsn',
        label: 'DSN of the app',
        secret: true,
        required: false,
        pattern: /^https:\/\/[^@\s]+@[^\s]+\/\d+$/,
      },
      {
        name: 'adminDsn',
        label: 'DSN of the admin panel',
        secret: true,
        required: false,
        pattern: /^https:\/\/[^@\s]+@[^\s]+\/\d+$/,
      },
      // S9-11: optional, lets the «Расходы» page read how many events
      // Sentry kept or dropped (token scope org:read).
      {
        name: 'orgSlug',
        label: 'Organization slug (for usage stats)',
        secret: false,
        required: false,
        pattern: /^[a-z0-9][a-z0-9-]{0,63}$/,
      },
      {
        name: 'statsToken',
        label: 'Auth token with org:read (for usage stats)',
        secret: true,
        required: false,
        pattern: /^[\w.-]{20,}$/,
      },
    ],
  },
  // Owner 2026-10-05: zero maintenance — the worker checks every hour that
  // the managed database provider made a fresh backup (Система → Здоровье
  // системы). The stored id stays `cockroach_cloud`; the call below is the
  // old provider's backup API and is re-pointed once the owner picks the
  // production PostgreSQL host (docs/runbooks/PROD_LAUNCH.md).
  {
    id: 'cockroach_cloud',
    label: 'Database provider (backup check)',
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
  // Owner 2026-10-22 (audit #4 §5, App Store 1.2): image moderation of
  // public photos, avatars and reel thumbnails (docs/SECURITY_TODO.md).
  {
    id: 'aws_rekognition',
    label: 'Image moderation (AWS Rekognition)',
    description:
      'Scans public photos, avatars, review photos and reel covers for nudity, violence and other unsafe content; above the threshold the content is hidden and lands in Модерация → Медиа. On AWS the server role is used when the keys are empty.',
    fields: [
      {
        name: 'region',
        label: 'Region',
        secret: false,
        required: true,
        pattern: /^[a-z]{2}(-[a-z]+)+-\d$/,
        patternHint: 'us-east-1 (the media bucket region)',
        env: 'REKOGNITION_REGION',
      },
      {
        name: 'accessKeyId',
        label: 'Access key ID (empty = the server role)',
        secret: false,
        required: false,
        pattern: /^(AKIA|ASIA)[A-Z0-9]{16}$/,
        env: 'REKOGNITION_ACCESS_KEY_ID',
      },
      {
        name: 'secretAccessKey',
        label: 'Secret access key',
        secret: true,
        required: false,
        pattern: /^[A-Za-z0-9/+=]{40}$/,
        env: 'REKOGNITION_SECRET_ACCESS_KEY',
      },
    ],
  },
  // Owner 2026-10-27: automatic text detection before any report.
  {
    id: 'openai_moderation',
    label: 'Text moderation (OpenAI omni-moderation)',
    description:
      'Checks new posts and comments for harassment, hate, sexual and illicit content before anyone reports them. Modes off / shadow / enforce in Модерация → Настройки. Free or about $0.00001 a call; a daily cap is set there.',
    fields: [
      {
        name: 'apiKey',
        label: 'API key',
        secret: true,
        required: true,
        pattern: /^sk-[A-Za-z0-9_-]{20,}$/,
        env: 'OPENAI_MODERATION_API_KEY',
      },
    ],
  },
  // Owner 2026-10-27 (staff package T12): AI mode for staff, OFF by default.
  // No env fallback on purpose: the key lives only here.
  {
    id: 'anthropic',
    label: 'AI mode for staff (Claude API)',
    description:
      'Nightly AI check of staff decisions, the desk hint and the short recommendation text. Used only while the AI master switch (staff.ai_enabled) is on; the monthly spend ceiling is staff.ai.monthly_cents.',
    fields: [
      {
        name: 'apiKey',
        label: 'API key',
        secret: true,
        required: true,
        pattern: /^sk-ant-[A-Za-z0-9_-]{20,}$/,
        patternHint: 'starts with sk-ant-',
      },
    ],
    test: (f) =>
      probe('https://api.anthropic.com/v1/models?limit=1', {
        headers: {
          'x-api-key': f.apiKey,
          'anthropic-version': '2026-10-21',
        },
      }),
  },
  // Owner 2026-10-22 (18 U.S.C. §2258A): known-CSAM hash matching. Keys are
  // granted by Microsoft after vetting (docs/SECURITY_TODO.md).
  {
    id: 'photodna',
    label: 'PhotoDNA (known-CSAM hash match)',
    description:
      'Microsoft PhotoDNA Cloud Service: every public image is matched against known child-abuse hashes; a match hides it at once and opens an NCMEC report.',
    fields: [
      {
        name: 'subscriptionKey',
        label: 'Subscription key (Ocp-Apim-Subscription-Key)',
        secret: true,
        required: true,
        pattern: /^[0-9a-f]{32}$/i,
        env: 'PHOTODNA_SUBSCRIPTION_KEY',
      },
      {
        name: 'endpoint',
        label: 'Match endpoint',
        secret: false,
        required: false,
        pattern: /^https:\/\/[^\s]+$/,
        patternHint:
          'https://api.microsoftmoderator.com/photodna/v1.0/Match (default)',
        env: 'PHOTODNA_ENDPOINT',
      },
    ],
  },
  {
    id: 'ncmec',
    label: 'NCMEC CyberTipline (CSAM reports)',
    description:
      'Electronic Service Provider account of the NCMEC CyberTipline reporting API. Without it, reports wait in Модерация → Медиа as «file by hand».',
    fields: [
      {
        name: 'username',
        label: 'ESP username',
        secret: false,
        required: true,
        pattern: /^\S{3,}$/,
        env: 'NCMEC_USERNAME',
      },
      {
        name: 'password',
        label: 'ESP password',
        secret: true,
        required: true,
        pattern: /^.{8,}$/,
        env: 'NCMEC_PASSWORD',
      },
      {
        name: 'environment',
        label: 'Environment',
        secret: false,
        required: false,
        pattern: /^(test|production)$/,
        patternHint: 'test or production (default test)',
        env: 'NCMEC_ENVIRONMENT',
      },
    ],
  },
];

export function providerById(id: string): ProviderDefinition | undefined {
  return PROVIDERS.find((p) => p.id === id);
}
