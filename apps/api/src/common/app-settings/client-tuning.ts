/**
 * Scale audit 2026-10-23 (docs/perf/SCALE_LIMITS_AUDIT_2026-10-23.md):
 * knobs of the phone's own traffic that must be turnable WITHOUT an app
 * update. A store release takes days; if a bug in a build makes phones
 * retry, poll or reconnect too hard, the server answers by raising these
 * numbers in the admin panel (Config) — the app reads them from
 * `GET /config/bootstrap` (`client.*` is public) at every start.
 *
 * Every key has hard bounds here (checked on save, config-schema.ts) and
 * the app clamps the same bounds again (core/config/client_tuning.dart),
 * so a wrong value can neither silence the app nor make it hammer us.
 */
export interface ClientTuningDef {
  readonly default: number | boolean;
  readonly min?: number;
  readonly max?: number;
  /** English text for the admin config page (key name stays English). */
  readonly description: string;
}

export const CLIENT_TUNING_DEFS = {
  'client.retry_max': {
    default: 2,
    min: 0,
    max: 4,
    description:
      'How many times the app repeats a failed safe request (GET, or POST with an idempotency key). 0 = never repeat.',
  },
  'client.retry_base_ms': {
    default: 1000,
    min: 200,
    max: 30_000,
    description:
      'First wait before a repeat, milliseconds; doubles each time, with random jitter. Raise it while the server is struggling.',
  },
  'client.retry_after_max_s': {
    default: 10,
    min: 1,
    max: 120,
    description:
      'The longest Retry-After wait (seconds) the app obeys. Raise it, and send Retry-After from the server, to calm a stampede.',
  },
  'client.outbox_retry_max_s': {
    default: 30,
    min: 5,
    max: 600,
    description:
      'Longest wait (seconds) between retries of an unsent chat message or upload (waits grow 1, 2, 4 … up to this).',
  },
  'client.realtime_reconnect_min_ms': {
    default: 1000,
    min: 500,
    max: 60_000,
    description: 'Socket.IO reconnect: first wait, milliseconds.',
  },
  'client.realtime_reconnect_max_ms': {
    default: 10_000,
    min: 2000,
    max: 300_000,
    description:
      'Socket.IO reconnect: longest wait, milliseconds. After an outage 1M phones come back together: raise this to spread them out.',
  },
  'client.events_enabled': {
    default: true,
    description:
      'Kill switch of the app’s anonymous usage events (off = nothing is sent).',
  },
  'client.events_flush_s': {
    default: 60,
    min: 15,
    max: 3600,
    description: 'How often the app sends its usage events, seconds.',
  },
  'client.call_sync_s': {
    default: 30,
    min: 10,
    max: 300,
    description:
      'How often an ongoing call re-checks its state with the server (a safety net next to the socket), seconds.',
  },
  'client.qr_poll_s': {
    default: 10,
    min: 5,
    max: 60,
    description:
      'How often the website’s QR sign-in screen asks whether the phone confirmed, seconds.',
  },
  'client.video_prefetch_ahead': {
    default: 3,
    min: 0,
    max: 6,
    description:
      'How many reels ahead the app warms (playlist + first segment, up to 1 MB each) while someone swipes. Video traffic is the biggest cost: lower it to save money, 0 = no warm-up.',
  },
  'client.video_cache_mb': {
    default: 100,
    min: 0,
    max: 1000,
    description:
      'Disk ceiling of the phone’s video chunk cache, megabytes (the first seconds of each video are kept so replays and scroll-back start at once and cost no CDN traffic). 0 = cache off.',
  },
  'client.video_cache_chunk_s': {
    default: 4,
    min: 1,
    max: 15,
    description:
      'How many seconds from the start of each video the phone keeps in the video cache. More = more disk and a little more traffic per video.',
  },
  'client.resume_refresh_min_away_s': {
    default: 30,
    min: 5,
    max: 3600,
    description:
      'The app re-reads its screens when it returns from the background after at least this many seconds.',
  },
  // Owner 2026-10-23: Instagram / WhatsApp / Telegram apps have no guest
  // browsing. These two are CLIENT gates only: the API stays open for
  // token-less reads (the website uses them; `guest.browsing_enabled` is the
  // server-side kill switch).
  'client.guest_browse_app_enabled': {
    default: false,
    description:
      'Show "Browse without signing in" and open the feed to people with no account in the iOS and Android apps. Off by default (like Instagram, WhatsApp, Telegram). The API itself stays open.',
  },
  'client.guest_browse_web_enabled': {
    default: true,
    description:
      'The same for the website. On = a visitor can look around before signing in.',
  },
} as const satisfies Record<string, ClientTuningDef>;

export type ClientTuningKey = keyof typeof CLIENT_TUNING_DEFS;

/** `APP_SETTINGS` entries (key → default). */
export const OWNER_CLIENT_TUNING_SETTINGS = Object.fromEntries(
  Object.entries(CLIENT_TUNING_DEFS).map(([k, d]) => [k, d.default]),
) as { [K in ClientTuningKey]: (typeof CLIENT_TUNING_DEFS)[K]['default'] };

/** Owner-adjustable without a release (scale audit 2026-10-23): the lowest
 * quality of a photo sent in a chat (HD stays the person's choice). */
export const OWNER_CHAT_PHOTO_SETTINGS = {
  'media.chat_photo_max_px': 1600,
  'media.chat_photo_quality': 82,
} as const;
