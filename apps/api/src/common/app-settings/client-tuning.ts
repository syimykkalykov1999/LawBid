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
  readonly default: number | boolean | string;
  readonly min?: number;
  readonly max?: number;
  /** For string values: the allowed shape (checked on save). */
  readonly pattern?: RegExp;
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
  // Stage 2 SRE (Б5, 25.11): the app's retry budget — gRFC A6 «gRPC Retry
  // Design» retry throttling (Apache-2.0), the token bucket of grpc-java
  // `RetriableStream.Throttle`: start full at `retry_tokens_max`, a failed
  // attempt takes 1 token, an answered one gives back `retry_token_ratio`,
  // and a repeat is sent only while more than half the tokens are left. So
  // in an outage the apps stop multiplying the load (SRE Book ch. 22
  // «retry budget») and repeat again as soon as answers come back.
  'client.retry_tokens_max': {
    default: 10,
    min: 1,
    max: 1000,
    description:
      'Retry budget (gRPC A6): tokens the app starts with; a failed try takes 1, a repeat is sent only while more than half are left.',
  },
  'client.retry_token_ratio': {
    default: 0.1,
    min: 0.01,
    max: 1,
    description:
      'Retry budget (gRPC A6): tokens an answered request gives back (0.1 = ten good answers earn one repeat).',
  },
  // Stage 2 SRE (Б5): client-side adaptive throttling, SRE Book ch. 21
  // «Handling Overload»: the app keeps `requests` and `accepts` of the last
  // `throttle_window_s` and drops background / prefetch requests itself with
  // probability max(0, (requests − K·accepts) / (requests + 1)) before they
  // reach a server that is refusing work. What a person waits for is never
  // dropped. 0 = off.
  'client.throttle_k': {
    default: 2,
    min: 0,
    max: 10,
    description:
      'Client-side throttling K (Google SRE ch. 21): the app drops its own background and prefetch requests once the server refuses more than 1/K of them (2 = default, 0 = off). Requests a person waits for are never dropped.',
  },
  'client.throttle_window_s': {
    default: 120,
    min: 10,
    max: 600,
    description:
      'Client-side throttling: the window (seconds) of requests and accepts the app remembers (Google SRE: 2 minutes).',
  },
  // Stage 2 SRE (Б5): deadline propagation (SRE Book ch. 22; Envoy
  // `x-envoy-expected-rq-timeout-ms`, Apache-2.0). The apps send
  // `X-Request-Timeout-Ms` = how long they wait; a read the app gave up on
  // stops on the server (database, outbound calls). The website sends it
  // only while the bootstrap says this server allows the header (CORS).
  // Off = no header, and the server ignores one at once.
  'client.deadline_header_enabled': {
    default: true,
    description:
      'The app and the website tell the server how long they wait for an answer (X-Request-Timeout-Ms); a read nobody waits for any more stops on the server (off = no header, nothing stops).',
  },
  'client.outbox_retry_max_s': {
    default: 30,
    min: 5,
    max: 600,
    description:
      'Longest wait (seconds) between retries of an unsent chat message or upload (waits grow 1, 2, 4 … up to this).',
  },
  // Holes re-check (25.11, item 21): the apps mark each request
  // `X-Request-Priority: user | prefetch | background` (Netflix prioritized
  // load shedding) so an overloaded server sheds prefetch and background
  // work before what a person is waiting for. Off = the apps send no mark
  // (every request counts as a person's). The website sends it only while
  // the bootstrap says this server allows the header (CORS).
  'client.request_priority_enabled': {
    default: true,
    description:
      'The app and the website mark each request user / prefetch / background so an overloaded server waits prefetch and background work first (off = no mark).',
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
  // Row 166 (WhatsApp): the end of a call on the phone.
  'client.call_ended_ms': {
    default: 1600,
    min: 500,
    max: 10_000,
    description:
      'How long the short «Call ended» screen stays after a normal hang-up, milliseconds.',
  },
  'client.call_ended_hold_s': {
    default: 0,
    min: 0,
    max: 600,
    description:
      'How long «No answer» / «Busy» / a refusal stays with its Cancel · Call again (or Settings) buttons, seconds. 0 = until the person taps (WhatsApp).',
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
  // S20-9 (2026-10-25): 3-state switch over the number above.
  'client.video_prefetch_mode': {
    // Owner 2026-11-09: no limiter he did not order — reels warm up the
    // same on Wi-Fi and mobile data (Instagram / TikTok do), always.
    default: 'on',
    pattern: /^(off|on|auto)$/,
    description:
      'Reel warm-up switch. off = never warm up; on (default) = «ahead» on any network; auto = «ahead» on Wi-Fi, «cellular» on mobile data, and 0 while Bunny video traffic this month is over its warning level (Usage alarms).',
  },
  'client.video_prefetch_cellular': {
    default: 1,
    min: 0,
    max: 6,
    description:
      'How many reels ahead the app warms on mobile data (Wi-Fi uses client.video_prefetch_ahead). Used in auto mode.',
  },
  // S12-5 (observability round 12). Both need the person's analytics consent
  // (Settings → Privacy → «Usage statistics») and a Sentry DSN for the first.
  'client.sentry_traces_percent': {
    default: 0,
    min: 0,
    max: 100,
    description:
      'Share of app sessions (percent) whose performance trace (app start, slow frames, HTTP calls) goes to Sentry. Sentry bills its quota: 0 = off. Only for people who allowed usage statistics.',
  },
  'client.traceparent_percent': {
    default: 5,
    min: 0,
    max: 100,
    description:
      'Share of API calls (percent) the app marks for server tracing with a W3C traceparent header, so one slow request can be followed phone → API → database. 0 = the header is never sent.',
  },
  'client.video_cache_mb': {
    default: 100,
    min: 0,
    max: 1000,
    description:
      'Switch and start-up size of the phone’s video chunk cache, megabytes (the first seconds of each video are kept so replays and scroll-back start at once and cost no CDN traffic). 0 = cache off. Once the phone knows its cache settings the video ceiling is the person’s «Максимальный размер кэша» (or cache.limit_mb.video when set above 0).',
  },
  'client.video_cache_chunk_s': {
    default: 4,
    min: 1,
    max: 15,
    description:
      'How many seconds from the start of each video the phone keeps in the video cache. More = more disk and a little more traffic per video.',
  },
  'client.uploads_at_once': {
    default: 4,
    min: 1,
    max: 4,
    description:
      'How many pieces of files the app sends at once, across all files. Fewer on mobile data or a weak phone, and after a network failure.',
  },
  // Owner 2026-11-09: the parts of one big upload are not a fixed four.
  // auto: start at client.uploads_at_once, add one more at a time while the
  // total speed keeps growing (up to client.upload_parts_max), fall to
  // client.upload_parts_min after a failed part; mobile data, a weak phone or
  // low power keep to two. fixed: client.uploads_at_once, as before.
  'client.upload_parts_mode': {
    default: 'auto',
    pattern: /^(auto|fixed)$/,
    description:
      'Parts of a big upload at once. auto (default) = start at client.uploads_at_once, climb while the speed grows up to client.upload_parts_max, fall to client.upload_parts_min after a failure; fixed = always client.uploads_at_once.',
  },
  'client.upload_parts_max': {
    default: 8,
    min: 1,
    max: 16,
    description:
      'Auto mode: the most parts of uploads at once on a fast network (Wi-Fi, a wired computer). Mobile data, a weak phone and low power keep to two.',
  },
  'client.upload_parts_min': {
    default: 2,
    min: 1,
    max: 8,
    description:
      'Auto mode: the fewest parts of uploads at once after a failed or timed-out part.',
  },
  // Media audit 13.11 (C7): a verification document picked through «Files»
  // (ID, bar card) is shrunk on the phone to this long side and quality; the
  // verification camera shoots 1080p. Readable for OCR, no 12 MP originals.
  'client.verification_photo_max_px': {
    default: 2048,
    min: 1024,
    max: 4096,
    description:
      'Longest side (px) of a verification document photo picked from the phone (ID, bar card), shrunk and turned into JPEG before upload.',
  },
  'client.verification_photo_quality': {
    default: 90,
    min: 50,
    max: 100,
    description:
      'JPEG quality (50–100) of a verification document photo picked from the phone.',
  },
  'client.downloads_at_once': {
    default: 4,
    min: 1,
    max: 4,
    description:
      'How many pieces of files the app fetches at once, across all files. Fewer on mobile data or a weak phone, and after a network failure.',
  },
  // Owner row 106: the server pushes `file:ready`; this is only the safety
  // poll of an upload's check while the realtime socket is connected.
  'client.scan_poll_socket_ms': {
    default: 3000,
    min: 500,
    max: 30_000,
    description:
      'While the realtime connection is up, the server tells the app when the virus check of an upload ended; the app asks itself only this often, in milliseconds, as a safety net (without the connection it asks every 700 ms as before).',
  },
  // Row 110 (Telegram 🔍 in a chat): the in-chat and group member searches
  // ask the server after this pause in typing (0 = at every key).
  'client.chat_search_debounce_ms': {
    default: 300,
    min: 0,
    max: 3000,
    description:
      'Search inside a chat and over group members: the server is asked after this many milliseconds without typing (0 = at every key).',
  },
  // Owner row 109 (Telegram / Gmail): «Undo» after a delete, an archive or
  // an unfollow; the deleted comment reaches the server when it ends.
  'client.undo_window_s': {
    default: 5,
    min: 2,
    max: 30,
    description:
      'How long, in seconds, the «Undo» button stays after deleting or archiving a chat, deleting a comment, unfollowing or hiding a post. A deleted comment is removed on the server when this time ends.',
  },
  // Owner row 112 (Instagram «Not interested»): kept on the phone.
  'client.not_interested_keep_days': {
    default: 90,
    min: 1,
    max: 3650,
    description:
      'Posts a person marked «Not interested» stay hidden on that phone or browser for this many days.',
  },
  // Owner row 38 (Instagram / TikTok): the next page of a list is asked for
  // while this much of the list is still ahead, in screens (percent of the
  // visible height: 100 = one screen before the end).
  'client.load_ahead_percent': {
    default: 100,
    min: 10,
    max: 1000,
    description:
      'Lists (chats, cases, notifications, search, channels, profiles): the next page is asked for while this much of the list is still below the screen, in percent of the screen height (100 = one screen before the end).',
  },
  'client.feed_load_ahead_percent': {
    default: 200,
    min: 10,
    max: 1000,
    description:
      'The feed and other full-width card lists: the next page is asked for this far before the end, in percent of the screen height (200 = two screens).',
  },
  // Messages are counted in rows: the older page is asked for this many rows
  // before the oldest one loaded (Telegram-style).
  'client.load_ahead_rows': {
    default: 8,
    min: 1,
    max: 100,
    description:
      'Chats and groups: the older messages are asked for when the person is this many messages away from the oldest one loaded.',
  },
  'client.media_prefetch_ahead': {
    default: 3,
    min: 0,
    max: 10,
    description:
      'Lists: pictures of this many next rows are downloaded and decoded before they scroll in (0 = off). The data saver turns it off.',
  },
  'client.resume_refresh_min_away_s': {
    default: 30,
    min: 5,
    max: 3600,
    description:
      'The app re-reads its screens when it returns from the background after at least this many seconds.',
  },
  // Owner 2026-10-23: Instagram / WhatsApp / Telegram apps have no guest
  // browsing. These two are CLIENT gates only; `guest.browsing_enabled` is
  // the master switch (server gate for token-less reads) and the bootstrap
  // sends these two as off while it is off (dedup D-12).
  'client.guest_browse_app_enabled': {
    default: false,
    description:
      'Show "Browse without signing in" and open the feed to people with no account in the iOS and Android apps. Off by default. Works only while `guest.browsing_enabled` (the master switch) is on.',
  },
  'client.guest_browse_web_enabled': {
    default: true,
    description:
      'The same for the website. On = a visitor can look around before signing in (while `guest.browsing_enabled` is on).',
  },
  // D1-49 (13.11): Flutter web builds its screen-reader tree only after a
  // hidden «Enable accessibility» button; on = the website holds it on from
  // the first frame (SemanticsBinding.ensureSemantics, apps/mobile
  // core/platform/web_semantics.dart). It costs some frame time, hence the switch.
  'client.web_semantics_enabled': {
    default: true,
    description:
      'Website: screen readers (VoiceOver, NVDA, TalkBack) get the page structure from the first frame. On by default; off saves a little drawing time, but blind visitors then have to find the hidden «Enable accessibility» button first.',
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
  // Row 149 review: a photo picked from «Files» bigger than the file limit
  // is still read and shrunk (WhatsApp / Telegram); only up to this many
  // times the limit, so a 2 GB "picture" is never read whole. 0 = no cap.
  'media.picked_image_read_x': 4,
} as const;

/** What the app is told to warm up, for the two kinds of network. */
export interface PrefetchPlan {
  ahead: number;
  cellular: number;
}

/**
 * S20-9: the server turns the three-state switch into the two numbers the
 * app obeys. `bunnyOver` = the daily usage poll saw Bunny video traffic at
 * or above the warning level. The app only picks `ahead` (Wi-Fi) or
 * `cellular` (mobile data); it never needs to know the mode.
 */
export function effectivePrefetch(input: {
  mode: 'off' | 'on' | 'auto';
  ahead: number;
  cellular: number;
  bunnyOver: boolean;
}): PrefetchPlan {
  if (input.mode === 'off') return { ahead: 0, cellular: 0 };
  if (input.mode === 'on') {
    return { ahead: input.ahead, cellular: input.ahead };
  }
  if (input.bunnyOver) return { ahead: 0, cellular: 0 };
  return {
    ahead: input.ahead,
    cellular: Math.min(input.cellular, input.ahead),
  };
}
