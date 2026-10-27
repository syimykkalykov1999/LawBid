// docs/03_VERIFICATION_PROFILES.md §9: tunables stored in app_config and
// changed from the admin panel without a release. These are the spec's
// default values: prisma/seed.ts seeds them (never overwriting an edited
// value) and AppSettingsService falls back to them when a key is missing
// or has the wrong type.
export const FILE_03_SETTINGS = {
  'verification.max_submissions_30d': 5,
  /** Owner 2026-10-14: wrong bar numbers in a row before a cooldown.
   * Owner 2026-10-18: 5 tries, then the first lock is exactly 1 hour. */
  'verification.bar_fails_per_step': 5,
  /** Cooldowns after each series of wrong numbers, hours, comma list; the
   * last one repeats. Never a permanent block. */
  'verification.bar_cooldown_hours': '1,12,24',
  /** Days without a wrong number after which the counter starts over. */
  'verification.bar_fail_reset_days': 7,
  /** Bar number format per state (JSON: {"NY":{"pattern":"^\\d{4,7}$"}});
   * a state not listed only needs 4+ characters with at least 3 digits. The
   * format is never shown to anyone (owner 2026-10-18). */
  'verification.bar_formats': '',
  'verification.signed_url_ttl_sec': 300,
  /** Owner 2026-10-24: reminders 60 / 30 / 7 days before a license expires. */
  'verification.license_expiry_notify_days': [60, 30, 7],
  /** Owner 2026-10-24: days after expires_at the license stays usable (cases
   * in its state, bidding) while the badge is hidden and the admin sees
   * «требует продления»; then it becomes `expired`. 0 = expire at once. */
  'verification.license_expiry_grace_days': 14,
  'profile.username_change_cooldown_days': 30,
  // §9 names the key ("список") without contents: a starter list of names
  // that would impersonate the platform or collide with app routes.
  'profile.reserved_usernames': [
    'admin',
    'administrator',
    'api',
    'help',
    'lawbid',
    'legal',
    'me',
    'moderator',
    'official',
    'root',
    'security',
    'settings',
    'support',
    'system',
    'verifier',
    'www',
  ],
  // Owner 2026-10-20 (Telegram): a freed @username waits this long for its
  // old holder; look-alikes of known brands are refused; a handle one
  // character away from one with at least this many followers / subscribers /
  // members is refused as a look-alike.
  'profile.username_hold_days': 30,
  'profile.username_brand_list': [
    'telegram',
    'whatsapp',
    'instagram',
    'facebook',
    'google',
    'apple',
    'microsoft',
    'amazon',
    'paypal',
    'stripe',
    'twitter',
    'youtube',
    'tiktok',
    'linkedin',
    'uscis',
    'irs',
    'fbi',
    'police',
    'court',
    'courts',
    'justice',
    'lawyer',
    'attorney',
  ],
  'profile.username_similar_min_audience': 1000,
  'review.edit_window_days': 14,
  'review.reminder_after_days': 7,
  // Voice messages and other files outside «Загрузки и файлы» (bug 17).
  'files.max_size_mb': 10,
} as const;

// docs/04_CASES_BIDS.md §14 (stage 4.1 migration also inserts it): after
// this many confirmed "can't reach the client" reports the client account
// is suspended (§8.4).
export const FILE_04_SETTINGS = {
  'contacts.suspend_after_confirmed_reports': 3,
} as const;

// docs/05_FEED_SEARCH_CHAT_NOTIFICATIONS.md §13, §14 (stage 5.1): per-user
// action limits (429 RATE_LIMITED past them) and notification retention.
export const FILE_05_SETTINGS = {
  'rate_limit.post_create_per_day': 10,
  'rate_limit.comment_per_hour': 30,
  'rate_limit.like_per_hour': 300,
  'rate_limit.follow_per_day': 200,
  'rate_limit.message_per_minute': 60,
  'rate_limit.search_per_minute': 30,
  // S7-2: type-ahead (suggest, practices, tags): own budget, per keystroke.
  'rate_limit.search_suggest_per_minute': 240,
  // Owner 2026-10-22: address-book uploads per hour. The app sends the whole
  // book in one request (old builds: 100-hash parts, ~8 per pass), so this
  // only stops a runaway loop; the real cap is distinct hashes per day
  // (contacts-sync.service.ts). It replaces the old per-day key, whose
  // saved value (10) let one chunked pass use up the whole day.
  'rate_limit.contacts_sync_per_hour': 60,
  'rate_limit.report_per_day': 20,
  'notifications.retention_days': 180,
} as const;

// docs/06_PRODUCTION.md §1.2, §3.3, §10 (stage 6.1): subscription grace and
// the rule-based moderation lists/thresholds (edited in the admin panel).
export const FILE_06_SETTINGS = {
  'subscription.past_due_grace_days': 3,
  'moderation.blocked_terms': [] as string[],
  'moderation.hold_terms': [] as string[],
  'moderation.auto_hide_reports': 3,
  // Owner 2026-10-27: weighted auto-hide. 'count' = the old rule (N distinct
  // reporters, `auto_hide_reports`); 'weighted' = the sum of reporter
  // weights must pass `auto_hide_score`.
  'moderation.auto_hide_mode': 'weighted',
  'moderation.auto_hide_score': 3,
  // What happens to a verified attorney's content: 'review' = never hidden
  // by reports, goes to the priority queue; 'hide' = hidden once the score
  // passes `verified_attorney_score`.
  'moderation.verified_attorney_action': 'review',
  'moderation.verified_attorney_score': 6,
  // Reporter weight (1 = a normal established account).
  'moderation.weight.new_account_days': 7,
  'moderation.weight.new_account': 0.2,
  'moderation.weight.unverified_contact': 0.5,
  'moderation.weight.verified_reporter': 1.5,
  'moderation.weight.accuracy_min_reports': 3,
  'moderation.weight.cluster_by_source': true,
  'moderation.weight.source_lookback_days': 30,
  'moderation.weight.burst_window_hours': 24,
  'moderation.weight.burst_min_accounts': 3,
  'moderation.weight.burst': 0.2,
  // Unfounded reporters (DSA Art. 23 style): warning, then a pause.
  'moderation.report_abuse.enabled': true,
  'moderation.report_abuse.window_days': 30,
  'moderation.report_abuse.min_reports': 5,
  'moderation.report_abuse.unfounded_percent': 80,
  'moderation.report_abuse.repeat_after_warning': 3,
  'moderation.report_abuse.suspend_days': 7,
  // Strike ladder for content owners.
  'moderation.strikes.enabled': true,
  'moderation.strikes.expiry_days': 90,
  'moderation.strikes.points_remove': 1,
  'moderation.strikes.points_hide': 0,
  'moderation.strikes.cooldown_at': 3,
  'moderation.strikes.limited_at': 5,
  'moderation.strikes.suspend_at': 8,
  'moderation.strikes.cooldown_hours': 24,
  'moderation.strikes.cooldown_minutes': 10,
  'moderation.strikes.limited_days': 3,
  'moderation.strikes.suspend_days': 7,
  // Owner 2026-10-27: accounts moderated automatically (no human unless the
  // owner appeals). mode: 'off' | 'shadow' (log only) | 'enforce'.
  'moderation.auto.account_mode': 'shadow',
  'moderation.auto.window_days': 30,
  /** Account score = weighted reporters across the person's content
   * + live strike points * strike_score + strong detections * detect_score. */
  'moderation.auto.strike_score': 1,
  'moderation.auto.detect_score': 1,
  'moderation.auto.limit_at': 6,
  'moderation.auto.suspend_temp_at': 10,
  'moderation.auto.suspend_at': 15,
  'moderation.auto.limit_days': 3,
  'moderation.auto.suspend_temp_days': 7,
  /** Within this factor above a threshold the decision counts as borderline. */
  'moderation.auto.borderline_factor': 1.25,
  /** Verified attorneys: thresholds are multiplied; 'review' = never
   * actioned automatically, queued for priority human review instead. */
  'moderation.auto.verified_attorney_action': 'review',
  'moderation.auto.verified_attorney_multiplier': 2,
  'moderation.auto.appeal_sla_hours': 48,
  /** Appeals older than the SLA are approved by themselves, but only when
   * the automatic decision was borderline. */
  'moderation.auto.sla_auto_approve': false,
  'moderation.auto.alarm_overturn_percent': 30,
  'moderation.auto.alarm_min_appeals': 10,
  // Text detection before any report. mode: 'off' | 'shadow' | 'enforce'.
  'moderation.detect.mode': 'off',
  'moderation.detect.provider': 'openai',
  'moderation.detect.hold_at': 0.7,
  'moderation.detect.block_at': 0.97,
  'moderation.detect.log_at': 0.4,
  'moderation.detect.daily_cap': 20000,
  'moderation.detect.categories': [
    'harassment',
    'harassment/threatening',
    'hate',
    'hate/threatening',
    'illicit',
    'sexual',
    'sexual/minors',
  ] as string[],
  // §3.3 "массовые ссылки" / "повторяющийся текст от одного автора" → hold.
  'moderation.max_links': 3,
  'moderation.duplicate_window_hours': 24,
  // Owner 2026-10-22 (audit #4 §5): image moderation (AWS Rekognition).
  // Confidence 0–100: at `hide` the photo / reel is hidden at once and
  // queued; at `review` it stays up and is queued; below that it is clean.
  /** off | on | auto (default). auto = on inside the daily cost-guard cap
   * (`image_moderation`, over the cap checks are skipped as `budget`). */
  'moderation.image.enabled': 'auto',
  'moderation.image.hide_confidence': 90,
  'moderation.image.review_confidence': 60,
  /** The lowest label confidence the provider reports (Rekognition
   * MinConfidence). */
  'moderation.image.min_confidence': 50,
} as const;

// Owner 2026-10-01: video reels (Bunny Stream) and stickers — tunables the
// owner changes from the admin panel without a release.
export const OWNER_MEDIA_SETTINGS = {
  // Owner 2026-10-14: reels as long as Instagram's (up to 3 minutes).
  // Legacy single limit: kept as the fallback for the two keys below
  // (an admin who saved only this one keeps working).
  'video.max_duration_sec': 180,
  // Owner 2026-10-23: a reel is up to 3 minutes, a video post up to an hour.
  'video.reel_max_duration_sec': 180,
  'video.post_max_duration_sec': 3600,
  'video.max_size_mb': 1000,
  'video.upload_ttl_min': 60,
  'video.playback_ttl_sec': 21600,
  'video.max_pending_per_user': 3,
  'rate_limit.video_upload_per_day': 10,
  'stickers.max_own_packs': 20,
  'stickers.max_per_pack': 120,
  'stickers.max_installed': 200,
  'stickers.recent_max': 30,
  'rate_limit.sticker_pack_create_per_day': 5,
  'rate_limit.sticker_add_per_hour': 60,
  // Owner 2026-10-20: stories (24 h) and channels.
  'stories.max_active_per_user': 30,
  'stories.max_video_sec': 15,
  'stories.ttl_hours': 24,
  'rate_limit.story_create_per_day': 50,
  // Owner 2026-10-22 (audit #4 §6): generous caps instead of none (the
  // 2026-10-21 removal opened spam and fan-out costs). Telegram allows 10
  // public channels; WhatsApp groups hold 1 024 people.
  'channels.max_owned': 50,
  'channels.max_admins': 10,
  'channels.max_post_media': 10,
  'rate_limit.channel_create_per_day': 20,
  'rate_limit.group_create_per_day': 50,
  'groups.max_members': 1024,
  'rate_limit.post_create_per_hour': 30,
  'rate_limit.channel_post_per_hour': 30,
  'rate_limit.channel_comment_per_hour': 60,
  'files.sticker_max_size_mb': 1,
  // Owner 2026-10-05: a reel may be cut from a longer video (trim); the
  // played part stays ≤ video.max_duration_sec.
  'video.max_source_duration_sec': 900,
  // Owner 2026-10-15: text limits like other platforms — a post with
  // photos / video / documents is up to 2200 characters (Instagram), a
  // text-only brief up to 3000 (LinkedIn). Older posts are never cut.
  // Owner 2026-10-15: search ranking weights, editable in the admin panel.
  // Text: a word in the title counts `search.weight_title`, in the text
  // `search.weight_text` (case and post search). People: priority (paid
  // «higher in search»), verified and rating (stars) add up to one score.
  // The defaults keep the order the app always had: priority > verified >
  // rating.
  'search.weight_title': 1,
  'search.weight_text': 0.2,
  'search.weight_priority': 1000,
  'search.weight_verified': 100,
  'search.weight_rating': 10,
  // Owner 2026-10-15: how many different people must open the same topic
  // after a query before the search learns "query → topic" (nightly).
  'search.learn_min_users': 3,
  // Owner 2026-10-24 (search-ready): which engine answers searches.
  // postgres = today (default); shadow = ask both, show Postgres, log the
  // differences; engine = the search engine, Postgres on error / timeout.
  // See docs/architecture/SEARCH_READY.md.
  'search.engine': 'postgres',
  /** Review R-26: the nightly ledger check. off | on (whole ledger every
   * night) | auto (last N days nightly, whole ledger weekly). */
  'ledger.reconcile_mode': 'auto',
  /** Days the nightly ledger check covers in auto mode. */
  'ledger.reconcile_window_days': 7,
  // Engine answers slower than this fall back to Postgres, ms.
  // Which kind of engine 'search.engine' talks to: domain (provisioned
  // OpenSearch, default) or serverless (Amazon OpenSearch Serverless, SigV4).
  'search.engine_kind': 'domain',
  'search.engine_timeout_ms': 800,
  // Owner 2026-10-25 (zero-downtime reindex, docs/runbooks/search-reindex.md):
  // the old index generation is kept this many days for a rollback, and the
  // backfill pauses this long between batches so it never hogs the database.
  'search.reindex_keep_days': 7,
  'search.reindex_throttle_ms': 200,
  // Owner 2026-10-15: the recommendation weights of Search (cases for
  // attorneys, people and «you may know», posts and reels) — editable in
  // the admin panel; the sum need not be 1.
  'reco.case.practice': 0.2,
  'reco.case.state': 0.12,
  'reco.case.fresh': 0.1,
  'reco.case.budget': 0.06,
  'reco.case.competition': 0.06,
  'reco.case.urgency': 0.06,
  'reco.case.client': 0.04,
  'reco.case.demand': 0.02,
  // OQ-054: the client is around (opened / answered lately).
  'reco.case.clientActive': 0.1,
  // OQ-054: urgent + an active client first; a silent urgent one drops.
  'reco.case.urgentActive': 0.17,
  // OQ-054: «по дате» cases rise as the date gets closer.
  'reco.case.dateNear': 0.07,
  'reco.people.contact': 0.2,
  'reco.people.state': 0.144,
  'reco.people.practice': 0.176,
  'reco.people.mutual': 0.128,
  'reco.people.followsMe': 0.064,
  'reco.people.quality': 0.112,
  'reco.people.activity': 0.08,
  'reco.people.affinity': 0.056,
  'reco.people.identity': 0.024,
  'reco.people.popularity': 0.016,
  'reco.post.hot': 0.28,
  'reco.post.interest': 0.22,
  'reco.post.social': 0.14,
  'reco.post.fresh': 0.12,
  'reco.post.language': 0.06,
  'reco.post.authorQuality': 0.06,
  'reco.post.state': 0.06,
  'reco.post.affinity': 0.06,
  // Owner 2026-10-25: ranking of the bids a client sees on a case.
  // bids.default_sort is what the list uses when the app sends no sort
  // (newest = today; best_match = the weighted score below).
  'bids.default_sort': 'newest',
  'bids.best_match.rating': 0.35,
  'bids.best_match.trust': 0.2,
  'bids.best_match.speed': 0.15,
  'bids.best_match.price': 0.2,
  'bids.best_match.completed': 0.1,
  // Bayesian rating: the average every attorney starts from and how many
  // "virtual reviews" of it are mixed in.
  'bids.bayes_prior': 4,
  'bids.bayes_weight': 5,
  // A price below this share of the median is suspiciously low.
  'bids.low_ratio': 0.4,
  // Bids needed in one fee type before a median / "best price" exists.
  'bids.min_bids_for_price': 3,
  // Flag suspiciously low bids (field lowOffer) and log them for review.
  'bids.dumping_guard': false,
  // Owner 2026-10-15: topics a case can name (the first + the rest).
  'case.max_practices': 3,
  'post.max_chars_media': 2200,
  'post.max_chars_brief': 3000,
  // Owner 2026-10-05: photos (posts, reels, cases, reviews; avatars by
  // their own size) are shrunk on the phone before upload — longest side,
  // JPEG quality — no visible loss, small files. Videos are re-encoded by
  // Bunny for viewers.
  // Owner 2026-10-15: lighter (Instagram stores 1080 px): 1440 px / 80 %.
  // Owner 2026-10-19 (Instagram quality, «too compressed, avatars are
  // blurry»): 1440 px keeps a 4:5 portrait 1080 px wide (Instagram's size)
  // and quality 90 — the server re-encodes once more for its sizes, two
  // passes at 80–85 were visibly soft.
  'media.photo_max_px': 1440,
  'media.photo_quality': 90,
  'media.avatar_max_px': 1024,
  // Owner 2026-10-19: the profile photo is small and seen up close — its
  // own, higher quality.
  // Owner 2026-10-26 (events pipeline, N-2): the internal domain-event bus.
  // off = nothing is recorded; db = table `domain_events` (default, cheap);
  // stream = table + Kinesis (needs events_stream_enabled in Terraform);
  // auto = db, switches to stream above the daily ceiling.
  // Perf review 2026-10-26 (R-41): auto = off until a consumer needs events.
  'events.sink': 'auto',
  'events.max_per_day': 1000000,
  'events.retention_days': 30,
  'events.auto_ceiling_per_day': 2000000,
  'media.avatar_quality': 95,
  // Owner 2026-10-05: reels are re-encoded on the phone before upload —
  // at most this height (1080 = Full HD, no visible loss on a phone),
  // 0 = upload as recorded. Frame rate cap keeps files small.
  // Owner 2026-10-15: 720 p — about half the size of 1080 p, same on a phone.
  // Owner 2026-10-19 (Instagram): 1080 p again — 720 p looked soft.
  'media.video_max_height': 1080,
  'media.video_frame_rate': 30,
  // Owner 2026-10-05: document templates the admin uploads (PDF, Word).
  'files.document_template_max_size_mb': 10,
} as const;

// Owner 2026-10-02: support tickets — per-user limits (429 RATE_LIMITED).
export const OWNER_SUPPORT_SETTINGS = {
  'rate_limit.support_ticket_per_hour': 5,
  'rate_limit.support_message_per_hour': 30,
} as const;

// Owner 2026-10-02: the paid gold badge of a client (cents per month).
export const OWNER_BADGE_SETTINGS = {
  'verification.client_badge_cents': 1000,
} as const;

// Owner 2026-10-04: an attorney enters state + bar number and confirms
// them under a sworn statement; the request is then approved at once
// (`self_attestation_auto_approve`, off = verifier queue as before). A
// photo of the bar card and ID + selfie are asked for only when switched
// on here (or, for ID + selfie, after a name change).
export const OWNER_LAWYER_VERIFICATION_SETTINGS = {
  'verification.require_bar_document': false,
  'verification.require_identity': false,
  // Owner 2026-10-16: off — a new license stays pending until the state
  // registry matches it or an admin approves it (with the bar card).
  'verification.self_attestation_auto_approve': false,
  // Owner 2026-10-16: where no registry checks the number, the bar card is
  // required (a person decides from it). Off = only when switched on above.
  'verification.bar_document_for_manual_states': true,
} as const;

// Owner 2026-10-05: the planner's archive — finished tasks are kept this
// many days (files with them), then removed automatically unless kept
// forever; notices go out 30 and 7 days before. Off = never removed.
export const OWNER_TASKS_SETTINGS = {
  'tasks.archive_retention_days': 365,
  'tasks.archive_auto_purge': true,
} as const;

// Future web client (a client form on lawbid.dev sharing this API): the
// browser origins allowed to call the API cross-origin (CORS). Localhost
// origins are added on top outside production (src/common/cors).
// Owner 2026-10-16: fewer SMS. A code goes out only to register a NEW number
// and to reset a password; a registered number signs in with its password.
// All values are editable in the admin (Настройки); `login_code_enabled` is
// the rollback switch for the old passwordless sign-in code.
// Owner 2026-10-16: an attorney who loses verification stops paying: the
// subscription ends and the unused part is refunded (rollback: off).
export const OWNER_BILLING_GATE_SETTINGS = {
  'billing.cancel_on_verification_loss': true,
  // Offer packs and Boost are for verified attorneys only (rollback: off).
  'billing.require_verified_for_purchases': true,
  // Owner 2026-10-22 (systems checklist §12): Stripe Tax (automatic_tax)
  // on subscriptions, seat purchases, hosted checkouts and our card page.
  // Off until the owner enables Stripe Tax in the Stripe Dashboard
  // (docs/runbooks/STRIPE_TAX.md); on without that, Stripe refuses the
  // calls, so the API checks the customer's tax status first.
  'billing.stripe_tax_enabled': false,
} as const;

// Owner 2026-10-16: our own card page (variant B) for the subscription; off or
// without a publishable key, Stripe's hosted page (card only) is used.
export const OWNER_PAY_PAGE_SETTINGS = {
  'payments.own_page_enabled': true,
  /** How long a link to the card page works, minutes. */
  'payments.own_page_ttl_minutes': 30,
} as const;

export const OWNER_SMS_SETTINGS = {
  /** true = a registered number may still get a sign-in code (the old way). */
  'sms.login_code_enabled': false,
  /** Seconds before the same number may ask for another registration code. */
  'sms.resend_cooldown_seconds': 60,
  /** Registration codes to one number in 24 hours. */
  'sms.registration_per_number_per_day': 3,
  /** Password-reset codes to one number per hour / per 24 hours. */
  'sms.reset_per_number_per_hour': 3,
  'sms.reset_per_number_per_day': 5,
  /** 2026-10-24 (abuse batch B, item 10): SMS-pumping brake. More than this
   * many codes in the window to numbers with the same first 6 digits
   * (country code + area + the start of the line) trips the prefix: it is
   * blocked for `sms.prefix_block_minutes`, nothing is sent, the caller
   * still sees the normal «code sent» answer, and an alert is logged. 0 = off. */
  'sms.prefix_velocity_max': 8,
  /** Same, for the whole country (dial code). 0 = off. */
  'sms.country_velocity_max': 100,
  /** Window of both velocity rules, minutes. */
  'sms.prefix_velocity_window_minutes': 10,
  /** How long a tripped prefix / country stays blocked, minutes. */
  'sms.prefix_block_minutes': 60,
  /** Hard daily cap (UTC day) of SMS codes to NEW numbers (sign-up). When
   * reached, sign-up by SMS is closed until 00:00 UTC (503
   * PROVIDER_BUDGET_EXCEEDED) and an alert is logged; password-reset codes
   * and e-mail codes keep working. Unlike «Лимиты расходов» it is never
   * changed by the auto mode. 0 = off. */
  'sms.signup_daily_cap': 300,
  /** Review R-75: how the SMS caps behave. auto (default) = every cap above
   * is a FLOOR: the allowed number grows to the highest value of the
   * previous 7 UTC days x `sms.burst_multiplier`, never above
   * `sms.burst_ceiling_multiplier` x the typed cap; an alert is logged when
   * the allowance is used. fixed = exactly the typed numbers. */
  'sms.cap_mode': 'auto',
  'sms.burst_multiplier': 3,
  'sms.burst_ceiling_multiplier': 10,
} as const;

// Owner 2026-10-22 (client economy plan §5, Telegram «Данные и память»):
// the ceilings of the on-device caches, sent in GET /config/bootstrap
// (`app_config.cache.*`). A person may lower a limit on the phone, never
// raise it above these. keep_media_days: 3 / 7 / 30 / 0 (= always).
// Owner 2026-10-23: images, chat media and video 1 GB each, files
// 500 MB (~3.6 GB in all): fewer re-downloads, less traffic to pay for.
export const OWNER_CACHE_SETTINGS = {
  'cache.limit_mb.http': 32,
  'cache.limit_mb.messages': 50,
  'cache.limit_mb.feed': 8,
  'cache.limit_mb.images': 1000,
  'cache.limit_mb.chat_media': 1000,
  'cache.limit_mb.files': 500,
  'cache.limit_mb.video': 1000,
  'cache.keep_media_days.default': 30,
} as const;

export const OWNER_WEB_SETTINGS = {
  'web.allowed_origins': [
    'https://lawbid.dev',
    'https://www.lawbid.dev',
  ] as string[],
};

// Owner 2026-10-05 (automation principle, docs/AUTOMATION_PRINCIPLE.md):
// every manual admin step except checking an attorney's documents has an
// "auto" switch, on by default. A client's badge request is approved the
// moment the documents are uploaded and scanned; the admin can still
// revoke it. Undecided review appeals stay as decided on 2026-10-01
// (Google-style, no automatic removal) but the switch now lives here.
export const OWNER_AUTOMATION_SETTINGS = {
  'verification.client_badge_auto_approve': true,
  'reviews.auto_remove_undecided_appeals': false,
} as const;

// Owner 2026-10-05: a client offers a case to a chosen attorney. An
// unanswered invite expires after `invites.expiry_days`; at most
// `invites.max_pending_per_case` attorneys wait on one case, and a client
// sends at most `invites.max_per_day` invites a day.
export const OWNER_INVITE_SETTINGS = {
  'invites.expiry_days': 7,
  'invites.max_pending_per_case': 10,
  'invites.max_per_day': 30,
  // Owner 2026-10-15 (anti-spam both ways): one attorney is invited at most
  // `invites.max_per_attorney_per_day` times a day by everyone; one client
  // invites the same attorney at most `invites.max_per_pair_per_day` times a
  // day; the same attorney can be invited to the same case again only
  // `invites.reinvite_after_hours` after the earlier invite.
  'invites.max_per_attorney_per_day': 15,
  'invites.max_per_pair_per_day': 3,
  'invites.reinvite_after_hours': 24,
} as const;

// Owner 2026-10-05: how many assistants an attorney may add, set in the
// admin (was a fixed 6). The yearly plan covers this many seats.
export const OWNER_SEAT_SETTINGS = {
  'billing.max_assistant_seats': 10,
  // Owner 2026-10-22: one assistant holds at most this many of the 10
  // duties — more assistants, and nobody gets the whole account.
  'assistants.max_duties': 3,
} as const;

// Owner 2026-10-17: percent (contingency) budgets and bids — a deal between
// client and attorney, LawBid takes nothing. `fees.contingency_max_percent`
// caps the percent (100 = no cap); `fees.contingency_blocked_practices` is a
// comma list of practice codes (a code covers its subtopics) where the
// percent option is hidden — ethics rules forbid contingency fees in
// criminal and domestic-relations matters in almost every state.
export const OWNER_CONTINGENCY_SETTINGS = {
  'fees.contingency_max_percent': 100,
  'fees.contingency_blocked_practices':
    'criminal_defense,dui_and_dwi,traffic_tickets,family_law',
} as const;

// Owner 2026-10-25 (docs/architecture/EXPERIMENTS.md): the ranking events log
// and A/B experiments. Impressions and clicks are kept for this share of
// users (the same users every time), everything else is always kept; weeks
// older than the retention leave by themselves.
export const OWNER_EXPERIMENT_SETTINGS = {
  /** Cost gate, three states: 'off' | 'on' | 'auto'. Auto stores impressions
   * and clicks only while an experiment is running (bids, accepts, reports
   * are always kept unless off). The sample percent below is the ceiling. */
  'ranking.events_mode': 'auto',
  /** Share of users (0-100) whose impressions and clicks are stored. */
  'ranking.impression_sample_percent': 10,
  'ranking.events_retention_days': 90,
  /** An experiment may start at this share of users at most; more only by a
   * separate «Увеличить долю» step (fresh 2FA code). */
  'experiments.max_start_percent': 10,
  /** CTR@k: positions 1..k count as «seen near the top». */
  'experiments.ctr_k': 5,
} as const;

// Owner 2026-10-05: case urgency. A case with a date reads as "very
// urgent" with at most `cases.urgency_days_very_urgent` days left, and so
// on down. Client and hired attorney get reminders
// `cases.deadline_reminder_days` before the date (0 = on the day); a
// client whose date passed with no attorney hired is asked to update it.
// `cases.deadline_reminders_auto` off stops all of them.
export const OWNER_URGENCY_SETTINGS = {
  'cases.urgency_days_very_urgent': 1,
  'cases.urgency_days_urgent': 3,
  'cases.urgency_days_soon': 7,
  'cases.urgency_days_within_month': 31,
  'cases.deadline_reminder_days': [7, 3, 1, 0],
  'cases.deadline_reminders_auto': true,
} as const;

// Owner 2026-10-17/18 (OQ-054): stale cases in the attorney feed. A case's
// client is "silent" for `now - client_active_at` (only the client's own
// actions count, never attorney bids). Silent for `stale_ask_days_<urgency>`
// → one «Вам ещё нужен адвокат?» (push + in-app, never SMS); unanswered for
// `stale_pause_days_<urgency>` more → paused (hidden from the feed, one tap
// brings it back); paused `stale_archive_after_pause_days` → archived.
// «По дате»: asked once the date has passed, paused
// `stale_pause_days_by_date` days after the date.
export const OWNER_STALE_SETTINGS = {
  'cases.stale_ask_days_very_urgent': 2,
  'cases.stale_pause_days_very_urgent': 1,
  'cases.stale_ask_days_urgent': 4,
  'cases.stale_pause_days_urgent': 2,
  'cases.stale_ask_days_soon': 7,
  'cases.stale_pause_days_soon': 3,
  'cases.stale_ask_days_within_month': 30,
  'cases.stale_pause_days_within_month': 4,
  'cases.stale_ask_days_flexible': 30,
  'cases.stale_pause_days_flexible': 14,
  'cases.stale_pause_days_by_date': 3,
  'cases.stale_archive_after_pause_days': 30,
} as const;

// Owner 2026-10-05: attorney trust levels (docs/ATTORNEY_TRUST.md). The
// level is computed (0 self-attested, 1 license confirmed, 2 identity
// confirmed, 3 both); these say which level each gate needs and what
// happens automatically. A hold (complaint, name mismatch) closes the
// payment / bid gates whatever the level.
export const OWNER_TRUST_SETTINGS = {
  /** Owner 2026-10-05 06:07: the master switch. Off = the pre-trust mode:
   * self-attested attorneys get the badge and payments at once, no holds,
   * no queue. Everything below only counts while this is on. */
  'trust.enabled': true,
  /** Staff review on/off. Off = automatic checks only: the documents
   * requirement is ignored and the queue is paused (kept, not lost). */
  'trust.manual_review': true,
  /** Owner 2026-10-05 («Борьба с мошенниками»): what an attorney must pass
   * before the badge and in-app payments open. Each is a switch; whatever
   * can be checked automatically is, the rest lands in the staff queue, and
   * a staff "Подтвердить" clears everything at once (no re-checks after). */
  /** The bar number matched the state registry (or staff confirmed it). */
  'trust.require_registry': true,
  /** Stripe KYC passed and the legal name (or the company's representative /
   * owner) is the attorney, or the firm link is confirmed. */
  'trust.require_identity': true,
  /** Staff checked a government ID + selfie + bar card. */
  'trust.require_documents': false,
  /** Bids wait for the LICENCE (a registry match or a staff confirmation);
   * identity and documents only gate money and the badge. Owner
   * 2026-10-14: on — a pending lawyer may browse and prepare, not send. */
  'trust.bids_require_cleared': true,
  /** Stripe payout delay (days) asked for attorneys not yet cleared; 0 =
   * Stripe's default. */
  'trust.payout_delay_days': 7,
  /** A client's fraud / impersonation report → payments and new bids are
   * paused until a verifier looks. */
  'trust.auto_hold_on_complaint': true,
  /** Distinct clients reporting within the window → profile suspended. */
  'trust.complaints_to_suspend': 2,
  'trust.complaint_window_days': 90,
  /** Stripe's legal name differs from the profile / registry name →
   * payments paused and documents requested. */
  'trust.auto_hold_on_name_mismatch': true,
  /** Someone tries to register an already-registered bar number → the
   * holder's license is flagged for a registry check. */
  'trust.flag_duplicate_claims': true,
  /** Stripe company account where the attorney is neither representative
   * nor owner: the link to the firm counts automatically when the firm in
   * the state registry equals the Stripe company name, or when the
   * attorney confirms an e-mail on the firm's website domain. Off = a
   * verifier checks a letter on the firm's letterhead. */
  'trust.firm_link_auto_registry': true,
  'trust.firm_link_auto_email': true,
  /** Owner 2026-10-05 07:00: a staff «Отклонить» (and an admin suspension)
   * blocks the attorney's bar numbers: they cannot register again under
   * another name or account until staff unblock them. */
  'trust.block_on_reject': true,
  /** A block also refuses the e-mail and phone of the blocked account. */
  'trust.block_contacts': false,
} as const;

// Owner 2026-10-05: the free trial length, set in Деньги → Цены (0 = no
// trial). Applies to new trials; running ones keep their end date (an
// admin extends one attorney's trial from their subscription card).
export const OWNER_TRIAL_SETTINGS = {
  // Owner 2026-10-16: the owner's plan says 7 days (was 14 in code).
  'billing.trial_days': 7,
} as const;

// Owner 2026-10-05: sections where admins other than the super admin must
// write a reason for an action (the owner never has to). Set in
// Администраторы → «Обязательная причина».
export const OWNER_REASON_SETTINGS = {
  'admin.reason_required_areas': [
    'money',
    'payroll',
    'moderation',
    'sanctions',
  ],
} as const;

// Owner 2026-10-28 (attorney-client privilege + admin hardening). Everything
// here is OFF (or today's behaviour) until the owner switches it on in
// Настройки; the guide is docs/runbooks/ADMIN_HARDENING.md.
export const OWNER_ADMIN_HARDENING_SETTINGS = {
  /** Only the addresses in `admin.ip_allowlist` may use the admin panel. */
  'admin.ip_allowlist_enabled': false,
  /** Allowed addresses: plain IPv4/IPv6 or IPv4 CIDR (203.0.113.0/24). */
  'admin.ip_allowlist': [] as string[],
  /** E-mail the owner when an admin signs in from a new device or address. */
  'admin.login_alert_enabled': true,
  /** Live sessions per admin; a newer sign-in ends the oldest. 0 = no cap. */
  'admin.max_concurrent_sessions': 0,
  /** Revealing a private message needs a 2FA code entered within this
   * many seconds (max 300 = the step-up lifetime). */
  'admin.private_stepup_seconds': 120,
  /** Daily copy of the audit log into the locked audit bucket (needs the
   * bucket from Terraform; without it this does nothing). */
  'admin.audit_export_enabled': true,
  /** Monthly e-mail of who read private content (to the owner). */
  'admin.access_report_enabled': true,
} as const;

/** Every typed app_config tunable with its spec default. */
/** Owner 2026-10-05: where the paid translator works (Ключи и сервисы →
 * Google Translate): 'all' zones, or only the switched-on 'zones'. */
export const OWNER_TRANSLATE_SETTINGS = {
  'translate.scope': 'all',
  'translate.chat': true,
  'translate.posts': true,
  'translate.cases': true,
  'translate.reviews': true,
  'translate.profiles': true,
};

/** Owner 2026-10-05: support 24/7 (Связь → Поддержка → Настройки).
 * New tickets go to the agents on shift; an unanswered ticket past its
 * SLA is flagged, its priority goes up and the team is told; outside the
 * opening hours (when not 24/7) the user gets an automatic answer;
 * resolved tickets close by themselves after N days (0 = never). */
export const OWNER_SUPPORT_DESK_SETTINGS = {
  'support.auto_assign': true,
  'support.sla_first_response_minutes': 60,
  'support.sla_urgent_minutes': 15,
  'support.sla_alerts': true,
  'support.escalate_on_breach': true,
  'support.always_open': true,
  'support.open_days': [1, 2, 3, 4, 5],
  'support.open_from_hour': 9,
  'support.open_to_hour': 18,
  'support.timezone': 'America/Chicago',
  'support.auto_reply': true,
  'support.auto_close_resolved_days': 7,
};

/** Owner 2026-10-05: «Лучший сотрудник». Off until the owner switches it
 * on; then the best employee of each department is chosen at the end of
 * every period (automatically unless `rewards.auto_award` is off). */
export const OWNER_REWARDS_SETTINGS = {
  'rewards.enabled': false,
  'rewards.auto_award': true,
  'rewards.period': 'month',
};

/** Owner 2026-10-05: repeat accounts of blocked fraudsters and the
 * client risk score (docs/CLIENT_FRAUD.md, Admin → Галочки → «Борьба с
 * мошенниками» → «Клиенты»). Presets set the actions and thresholds. */
export const OWNER_FRAUD_SETTINGS = {
  /** Master switch. Off = nothing is recorded or checked. */
  'fraud.enabled': true,
  /** Automation principle: actions apply by themselves. Off = everything
   * only lands in the staff queue. */
  'fraud.auto': true,
  /** A sign-in shares a phone, e-mail, Apple / Google account or card
   * with a blocked account: 'block' | 'review' (restricted until staff
   * look) | 'off'. */
  'fraud.match_action': 'block',
  /** The same for the phone (device) only: a phone can be sold or shared. */
  'fraud.device_action': 'review',
  /** Client risk score thresholds. */
  'fraud.review_score': 30,
  'fraud.restrict_score': 60,
  'fraud.ban_score': 100,
  /** Points per distinct attorney who dealt with the client and reported
   * fraud / impersonation; per other report; per card chargeback. */
  'fraud.weight_fraud_report': 25,
  'fraud.weight_report': 8,
  'fraud.weight_chargeback': 30,
  /** Complaints and cancellations older than this do not count. */
  'fraud.window_days': 180,
  /** E-mail the verifiers when an account is blocked or queued. */
  'fraud.notify_staff': true,
  /** Hashes of ordinary accounts are deleted after this many days without
   * use; those of blocked accounts are kept for the longer period. */
  'fraud.fingerprint_retention_days': 365,
  'fraud.blocked_retention_days': 1095,
} as const;

/** Stripe robustness 2026-10-27 (docs/runbooks/STRIPE_ROBUSTNESS.md): the
 * admin review queue, disputes and early fraud warnings. All admin-tunable
 * (Система → Настройки). */
export const OWNER_STRIPE_OPS_SETTINGS = {
  /** Pause the attorney's Stripe payouts (manual schedule) while a dispute
   * against them is open; restored when the last one closes. */
  'stripe_ops.hold_payouts_on_dispute': true,
  /** Build the evidence packet and save it as a DRAFT in Stripe when a
   * dispute opens (an admin reviews it and submits with a 2FA code). */
  'stripe_ops.dispute_auto_draft': true,
  /** Days before Stripe's evidence deadline on which staff are reminded. */
  'stripe_ops.dispute_reminder_days': [5, 2, 1],
  /** Early fraud warning on a charge of at most this many cents is refunded
   * by itself (Stripe's guidance: about the dispute fee). 0 = never. */
  'stripe_ops.efw_auto_refund_max_cents': 0,
  /** Hours staff have to look at a review item that has no Stripe deadline. */
  'stripe_ops.review_sla_hours': 24,
  /** E-mail the super admins about new review items and deadlines. */
  'stripe_ops.notify_staff': true,
  /** Dispute rate (disputes / payments, last 30 days) that raises a warning:
   * Visa VAMP non-compliant level is 0.5 %. */
  'stripe_ops.dispute_rate_warn_percent': 0.5,
  /** …and an alarm: Visa VAMP excessive / Mastercard ECM start at 1.5 %. */
  'stripe_ops.dispute_rate_alarm_percent': 1,
  /** No rate alarm below this many disputes in the window (tiny volume). */
  'stripe_ops.dispute_rate_min_count': 3,
  /** The nightly sweep looks at payments created in the last N days. */
  'stripe_ops.sweep_lookback_days': 7,
} as const;

/** Owner 2026-10-05: countries (Система → Страны). People who asked to
 * be told get an e-mail by themselves when their country is switched on. */
export const OWNER_COUNTRY_SETTINGS = {
  'countries.notify_waitlist': true,
};

/** Owner 2026-10-05: requests per minute for one signed-in admin (the
 * panel keeps several queues live on one screen). Users keep 100/min.
 * ADMIN_THROTTLE_LIMIT in the env wins (src/throttler/throttle-limits.ts). */
export const OWNER_RATE_LIMIT_SETTINGS = {
  'security.admin_rate_limit_per_minute': 600,
  /** Scale audit 2026-10-23: requests per minute for callers who are not
   * signed in, per address (CGNAT / office addresses carry many people).
   * Never below the default limit (100). */
  'security.anonymous_rate_limit_per_minute': 100,
  /** Scale audit 2026-10-23: live connections of one person per server. */
  'realtime.max_sockets_per_user': 10,
  /** Owner 2026-10-25: new socket connections per minute from one address
   * (CGNAT / offices carry many people: generous). 0 = no limit. */
  'realtime.max_connects_per_ip_per_minute': 120,
  /** Owner 2026-10-25: password screening (NIST SP 800-63B-4 §3.1.1.2). */
  'security.password_breach_check_enabled': true,
  /** Milliseconds to wait for the breached-password service; later = skip. */
  'security.password_breach_timeout_ms': 1500,
  /** Refuse passwords from the bundled list of the most common ones. */
  'security.password_common_list_enabled': true,
  /** Password hashes (scrypt) running at once on one server; the rest wait,
   * so a sign-in flood cannot starve the server's file / DNS work. 2 (not 4):
   * each scrypt is 64 MiB and about 100-200 ms of CPU, and the launch task
   * is 0.5 vCPU / 1 GiB (review R-59); raise it with the task size. */
  'security.password_hash_concurrency': 2,
  /** Hashes allowed to wait; beyond it the request gets RATE_LIMITED. */
  'security.password_hash_max_queue': 200,
  /** Owner 2026-10-07: sign-in codes (SMS or e-mail) one phone / e-mail
   * may ask for in a rolling 24 h, on top of the hourly limit. Range
   * 1…1000 (config-schema); 0 is refused, never "unlimited". Not seeded:
   * until an admin saves it, OTP_RATE_LIMIT_PER_IDENTIFIER_PER_DAY in the
   * env applies (default 10). */
  'security.otp_per_identifier_per_day': 10,
  /** Security research #5 (2026-10-22), A4: Firebase App Check on the
   * costly anonymous routes (sign-in code, password reset, social
   * sign-in, "is this number registered"). `off` — not looked at;
   * `monitor` (default) — the verdict of every request is logged
   * (`metric: app_check`), nothing is blocked; `enforce` — a request
   * without a valid token from our app gets 403
   * DEVICE_ATTESTATION_REQUIRED, except a code by e-mail (free). Turn on
   * enforce only after the app sends the header (B1) and a week of
   * monitor shows almost no `missing` verdicts. docs/runbooks/APP_CHECK.md */
  'security.app_check.mode': 'monitor',
  /** 2026-10-24 (abuse batch B, item 4): Cloudflare Turnstile on the WEB
   * page's costly anonymous routes (the same ones App Check covers). `off`
   * (default) — never looked at; `monitor` — a token the page sent is
   * verified and the verdict logged (`metric: turnstile`), nothing is
   * blocked; `enforce` — a token that fails verification gets 403
   * TURNSTILE_FAILED, a valid one passes even without App Check. The app
   * (iOS / Android) never uses it: it relies on App Check above. The secret
   * key is set in Интеграции → Cloudflare Turnstile. docs/runbooks/APP_CHECK.md */
  'security.turnstile.mode': 'off',
  /** 2026-10-25 (S14-7): with `security.app_check.mode = enforce`, the three
   * costly anonymous routes (sign-in code to a phone, password-reset code,
   * "is this number registered") also CONSUME the App Check token, so one
   * captured token cannot be replayed (Firebase replay protection; one more
   * round trip to Google per request). Off by default: it only works once
   * the app sends a limited-use token on those routes; before that, a
   * second request with the same cached token would be refused. */
  'security.app_check.replay_protection': false,
  /** 2026-10-25 (S14-13): after this many wrong passwords / codes for one
   * account in 15 minutes (or 5 times as many from one address) the next
   * attempt must carry a valid App Check / Turnstile token. 0 = never (the
   * default): turn it on once the app and the website send the token on
   * sign-in. */
  'security.auth_challenge_after_failures': 0,
  /** 2026-10-25 (S14-12): on = a re-authentication / "add a sign-in method"
   * code that was asked the old way (no purpose) is still accepted. Switch
   * off once every app build asks with its purpose, so a code is only good
   * for the flow it was asked for. */
  'security.otp_legacy_purpose_fallback': true,
  /** 2026-10-25 (S14-6): a NEW account cannot be opened with an e-mail from
   * the disposable-domain list (admin → blocked e-mail domains). Existing
   * accounts keep signing in. */
  'security.signup_block_disposable_email': true,
  /** 2026-10-25 (S14-4): tell the owner when a session is used from a
   * country it was not used from before (push + e-mail, the same alert as a
   * new device). Needs the country header from CloudFront / the load
   * balancer; without it nothing fires. Costs an e-mail + a push per alert
   * (cost gate): OFF by default, at most one alert per account per 24 h. */
  'security.new_country_alert_enabled': false,
};

/** Owner 2026-10-05: storage like Telegram (Система → Хранилище). Every
 * switch is on by default (docs/AUTOMATION_PRINCIPLE.md):
 * - dedup: an identical upload reuses the stored object (one copy in S3);
 * - auto_cleanup: files nobody uses (uploaded but never sent, replaced
 *   avatars, photos of posts deleted N days ago) are put aside after
 *   `orphan_grace_hours`, then their objects are removed after
 *   `purge_after_days` (S3 versioning keeps a recovery copy on top);
 * - image_format: photos are stored as WebP (≈30% smaller than JPEG at
 *   the same quality) or JPEG;
 * - quotas in MB (0 = no cap): per user (an admin override lives on the
 *   user) and per chat;
 * - auto_retention: technical logs older than N days are removed;
 * - growth alert: one log alert (CloudWatch → e-mail) when files or the
 *   database grew more than `growth_alert_percent` in a day. */
/** Owner 2026-10-20 (WhatsApp): how long a sent message can still be edited
 * and deleted for everyone. 0 = never. */
export const OWNER_CHAT_ACTION_SETTINGS = {
  'chat.edit_window_min': 15,
  'chat.delete_for_all_hours': 48,
  /** Pinned messages per chat (WhatsApp: 3). */
  'chat.max_pins': 3,
  /** Owner 2026-10-22: link cards under messages. Kill switch + domains
   * (and their subdomains) that are never fetched. */
  /** Owner 2026-10-22: calls. Group calls up to this many people (peer to
   * peer holds about 9); `video_provider` p2p | livekit (livekit needs the
   * LIVEKIT_* keys); big-audience channel calls come next release. */
  'calls.max_participants': 9,
  /** Owner 2026-10-23: one person left in a call → the call ends after this
   * many seconds unless somebody joins (0 = at once). */
  'calls.solo_end_seconds': 30,
  /** Owner 2026-10-22: guest browsing (reading with no account). Kill
   * switch and the per-IP budgets of token-less reads. */
  'guest.browsing_enabled': true,
  'guest.rate_limit_per_minute': 40,
  'guest.rate_limit_per_hour': 600,
  'calls.video_provider': 'p2p',
  /** Owner 2026-10-24: group calls on Cloudflare SFU (`video_provider` =
   * cloudflare). People in one SFU call (default 20); the mesh cap above
   * (`calls.max_participants`, 9) stays for device-to-device calls. */
  'calls.sfu_max_participants': 20,
  /** Only while Cloudflare is down or has no keys: up to this many people
   * (4) stay device-to-device with their video; with more, everyone is
   * audio-only (a call is never refused, seats stay as in the SFU limit). */
  'calls.sfu_fallback_mesh_max': 4,
  /** off | on | auto (default). Ceiling: per person per day below. */
  'chat.link_preview_enabled': 'auto',
  'chat.link_preview_per_user_per_day': 1000,
  'chat.link_preview_denylist': [] as string[],
  /** BUG-1 (package N-12b): chat text search through the blind index.
   * prefix_tokens: also index 3..12-letter word beginnings («докум» finds
   * «документ»); ~4× the index rows, so off by default; only new / edited
   * / re-indexed messages get them. backfill_mode: the job that indexes
   * old messages — off | on (every 5 minutes) | auto (default: at night,
   * UTC 06–12, until done, then idles); rows_per_run is its ceiling per
   * 5-minute tick. The «Пауза тяжёлых задач» switch also stops it. */
  'chat.search.prefix_tokens': false,
  'chat.search.backfill_mode': 'auto',
  'chat.search.backfill_rows_per_run': 5000,
  // Perf review 2026-10-26 (R-24): token rows per message (distinct words of
  // 2+ characters, no stop-words) and the backfill batch (one short transaction).
  'chat.search.max_tokens_per_message': 64,
  'chat.search.backfill_batch': 500,
};

export const OWNER_STORAGE_SETTINGS = {
  // Owner 2026-10-24: where NEW public media (avatars, post / review
  // photos, stickers) is stored: 'aws' (S3, default) or 'r2' (Cloudflare
  // R2, no egress fee; needs Integrations → Cloudflare R2). Private
  // content is always on AWS. docs/architecture/R2_PUBLIC_MEDIA.md.
  'media.public_store': 'aws',
  'storage.dedup': true,
  'storage.auto_cleanup': true,
  'storage.orphan_grace_hours': 24,
  'storage.purge_after_days': 7,
  'storage.deleted_posts_media_days': 30,
  'storage.image_format': 'webp',
  /** Owner 2026-10-25 (caching round 2, S2-1): a removed photo / file is
   * also pulled from the CloudFront edge (one wildcard path per file,
   * queued and sent in batches). Needs the distribution id from the infra.
   * CloudFront bills per path after the first 1000 a month, hence the cap. */
  'cdn.invalidate_on_delete': 'auto',
  'cdn.invalidate_batch_paths': 500,
  'cdn.invalidate_max_paths_day': 500,
  'cdn.invalidate_max_paths_month': 5000,
  /** Where per-user caches (feed first page, block set, plan terms) live:
   * `auto` = the separate cache Redis when REDIS_CACHE_URL is set, `on` =
   * same, `off` = the main Redis (as before the split). */
  'cache.redis_mode': 'auto',
  /** Ceiling in seconds on the lifetime of every shared cache entry made
   * by the `cached()` helper (block sets, plan terms, practice areas,
   * recommendations...). 0 = none (each key keeps its own, 60-300 s). */
  'cache.max_ttl_sec': 0,
  /** Caching round 2 (S2-8): seconds the viewer-independent body of a public
   * attorney profile is kept in Redis (an own-profile edit drops it).
   * 0 = off (every open reads the database, as before). */
  'cache.attorney_profile_sec': 60,
  /** S2-12: post, case, chat-list and notification answers carry a cheap
   * version tag computed before the queries; the same tag within this many
   * seconds (and no change of the stamps) is a 304 with no database work.
   * 0 = off (the old body-hash tag, every call runs fully). */
  'cache.cheap_etag_sec': 60,
  /** Owner 2026-10-25: AVIF twins of public photos (≈40-50% smaller than
   * WebP). OFF by default. `images.avif_enabled` writes the twins at
   * upload; they are served only to clients that send
   * `X-Image-Formats: avif`, and only for files uploaded after
   * `images.avif_since` (ISO time, empty = serve none). Qualities 1-100,
   * effort 0-9 (higher = smaller but slower to make). */
  'images.avif_enabled': false,
  'images.avif_since': '',
  'images.avif_quality': 60,
  'images.avif_effort': 2,
  /** Owner 2026-10-26: hash partitioning of the big chat / notification
   * tables is OPT-IN (at small sizes the plain tables are faster). Per
   * table: 'off' (default) | 'on' (the online runner converts now) |
   * 'auto' (converts when the table reaches `partition.auto_rows`).
   * docs/architecture/TABLE_PARTITIONING_READY.md */
  'partition.messages_mode': 'off',
  'partition.chat_group_messages_mode': 'off',
  'partition.notifications_mode': 'off',
  'partition.auto_rows': 50_000_000,
  'images.webp_quality': 88,
  'images.jpeg_quality': 90,
  /** Owner 2026-10-26: nightly sweep that recounts profile counters
   * (posts / followers / following) from the source tables and fixes the
   * ones that drifted. off = never; on = 10x the batch per night; auto
   * (default) = `counters.drift_sweep_batch` rows per profile table per
   * night, walking all profiles in turn. */
  'counters.drift_sweep': 'auto',
  'counters.drift_sweep_batch': 5000,
  'storage.user_quota_mb': 10240,
  'storage.chat_quota_mb': 5120,
  /** 2026-10-24 (abuse batch B, item 5): most MB one person may upload in
   * a UTC day (counted at presign; avatars, documents and exports are not
   * counted). Stops an upload-and-delete loop that the stored-bytes quota
   * above cannot see. 429 DAILY_UPLOAD_LIMIT_EXCEEDED. 0 = no cap. */
  'storage.daily_upload_mb_per_user': 2048,
  'storage.auto_retention': true,
  'storage.retention_auth_events_days': 730,
  'storage.retention_assistant_activity_days': 365,
  'storage.retention_snapshots_days': 730,
  'storage.retention_post_views_days': 365,
  'storage.retention_app_events_days': 90,
  // Scale audit 2026-10-23: the two fastest-growing statistics tables.
  'storage.retention_post_view_events_days': 730,
  'storage.retention_user_activity_days': 400,
  // DB-ops hardening 2026-10-25: the cross-family event queue (outbox) and its
  // dedupe table (inbox) are cleaned like any log. 0 = keep for ever.
  'storage.retention_outbox_done_days': 7,
  'storage.retention_inbox_days': 30,
  // DB-ops hardening: the daily db.health report goes yellow at this table
  // size (GB) / share of dead rows (%). 0 = no signal.
  // Three-state controls «Выкл / Вкл / Авто» (owner rule 2026-10-25).
  // db.health_mode: off = never; on = daily; auto = daily, but skipped while
  // heavy jobs are paused (the database is already slow).
  'db.health_mode': 'auto',
  // db.replica_reads: off = every read on the primary; on = replica always
  // (lag ignored); auto = replica only while its lag is under the ceiling.
  'db.replica_reads': 'auto',
  // The ceiling of «auto»: max replica lag in ms (also per call via readDb).
  'db.replica_max_lag_ms': 5000,
  'db.health_table_size_gb': 20,
  'db.health_dead_ratio_percent': 20,
  'storage.growth_alert_percent': 20,
  // Owner 2026-10-20 (government requests): evidence archives are built one at
  // a time by the worker; the file is removed after `export_ttl_days` (the
  // S3 lifecycle rule is the second net); deleted content is scrubbed after
  // `deleted_retention_days` unless a legal hold covers it.
  'legal.export_ttl_days': 30,
  'legal.export_max_rows': 50000,
  'legal.export_link_days': 7,
  'legal.deleted_retention_days': 90,
  // Owner 2026-10-28 (legal requests): how many times one archive may be
  // downloaded (0 = no limit), reminders before an answer is due, the length
  // of a preservation hold (18 U.S.C. 2703(f): 90 days, one 90-day renewal)
  // and the text of the notice to the user (when no gag order forbids it).
  'legal.export_max_downloads': 5,
  'legal.reminders_enabled': true,
  'legal.reminder_days': 3,
  'legal.preservation_days': 90,
  'legal.notice_template_en':
    'LawBid received a legal request ({{reference}}) from {{agency}} concerning your account. We reviewed it and responded as the law requires. If you want to challenge it, contact a lawyer; we can share a copy of the request where the law allows.',
  'legal.notice_template_ru':
    'LawBid получил юридический запрос ({{reference}}) от {{agency}} по вашему аккаунту. Мы проверили его и ответили так, как требует закон. Если хотите оспорить запрос, обратитесь к юристу; копию запроса мы можем показать, если закон это позволяет.',
};

/** Owner 2026-10-05: zero-maintenance operations (admin Система →
 * Здоровье системы). Every automatic reaction has a switch, default on. */
export const OWNER_OPS_SETTINGS = {
  /** DB answers slower than ops.db_slow_ms → heavy background jobs pause
   * for 15 minutes on their own (renewed while it stays slow). */
  'ops.auto_pause_heavy_jobs': true,
  'ops.db_slow_ms': 800,
  // Perf review 2026-10-26 (R-25): nightly bloat check «Выкл / Вкл / Авто»
  // and the biggest table the heap estimate may read (indexes are never read).
  'db.bloat_mode': 'auto',
  'db.bloat_scan_max_mb': 256,
  /** AWS spend reached the monthly budget → api/worker autoscaling capped
   * at the minimum until the next month (or until the owner lifts it). */
  'ops.auto_scale_down_on_budget': true,
  /** The newest database backup (provider API) older than this → alert. */
  'ops.backup_max_age_hours': 26,
  /** Batch C item 14 (2026-10-24): how long a ranked search result list
   * (people, attorneys, cases, posts) is shared by everyone asking the same
   * query. Short = fresher, 0 would be uncached; keep 30–60. */
  'search.ranked_cache_ttl_sec': 60,
  /** Batch C items 11 and 16 (2026-10-24): outside usage alarms, GB per
   * month; 0 = that alarm is off. Cloudflare Realtime (TURN + SFU) is free
   * up to 1000 GB/month, then $0.05/GB. */
  'usage.cloudflare_egress_warn_gb': 700,
  'usage.cloudflare_egress_crit_gb': 950,
  /** Bunny Stream: CDN traffic this month and stored video, GB. */
  'usage.bunny_bandwidth_warn_gb': 1000,
  'usage.bunny_bandwidth_crit_gb': 2000,
  'usage.bunny_storage_warn_gb': 200,
  'usage.bunny_storage_crit_gb': 500,
  /** Owner 2026-10-16 «Экономика»: third-party spend may be at most this
   * percent of the last 30 days' revenue … */
  'economy.max_spend_percent': 50,
  /** … but never less than this many dollars a month (a floor to run on
   * while revenue is still small). Owner 2026-10-26: 350 — the launch
   * stack must not sit in «limited» from day one. */
  'economy.min_threshold_usd': 350,
  /** Autoscaling ceiling: 'auto' (follows the rule above) or 'manual'
   * (the numbers below, always within the Terraform cap). */
  'economy.ceiling_mode': 'auto',
  'economy.manual_api_max': 4,
  'economy.manual_worker_max': 2,
  /** S9-4: the global daily money brake = allowed spend / 30 × this many
   * days (3 → about $15 a day at the $150 floor; it grows with revenue). */
  'economy.daily_brake_days': 3,
  /** S9-6 (owner 2026-10-25): the VPC interface endpoints (≈ $29 a month)
   * are created and removed by a Lambda. auto = by the NAT traffic signal
   * (default); on = keep them always; off = never. The economy job copies
   * this and the ceiling (most endpoints it may keep, 0 = none) to the
   * Lambda (S3 object ops/scale-controls.json). */
  'scale.endpoints.mode': 'auto',
  'scale.endpoints.ceiling': 4,
  /** This month's AWS bill when AWS Budgets cannot be read (≈ $150 for
   * the launch size). */
  'economy.aws_fallback_usd': 150,
  /** Queues hardening 2026-10-25 (S10): the number the worker autoscales
   * on. off = flat count of waiting jobs (the old way); on = jobs weighted
   * by how heavy they are; auto = weighted + extra pressure while the
   * oldest waiting job is older than 2 minutes. Costs nothing: it only
   * changes WHEN the existing autoscaling adds a worker (still capped by
   * the economy ceiling). */
  'queues.scale_signal_mode': 'auto',
  /** Push sending speed limit to FCM/APNs, per second for the whole
   * system (FCM allows 10 000/s per project). off = no limit; on = always
   * the number below; auto = the number below, and it also slows down by
   * itself for a minute when FCM answers «слишком часто» (429). */
  'queues.push_rate_mode': 'auto',
  'queues.push_rate_per_sec': 8000,
};

/** Owner 2026-10-05 «Прибыль и резерв» (Деньги): the monthly split of the
 * Stripe balance into «Расходы» (services, salaries paid from the bank),
 * a reserve that stays on Stripe and «Прибыль» for the owner. */
export const OWNER_TREASURY_SETTINGS = {
  /** Run the split on its own every month (off: only the button). */
  'treasury.auto': true,
  /** Day of the month (1…28, UTC). The 25th: the money for next month's
   * bills is in the expense account before they come. */
  'treasury.payout_day': 25,
  /** Safety cushion kept on Stripe: percent of a month of all costs. */
  'treasury.buffer_percent': 50,
  /** Kept on Stripe for refunds and disputes, dollars. */
  'treasury.refund_buffer_usd': 200,
  /** Profit smaller than this waits for the next month, dollars. */
  'treasury.min_profit_usd': 50,
  /** Owner 2026-10-06: salaries linked to Stripe go out by themselves on
   * the pay day, from the reserve on Stripe (off: «Выплатить» by hand). */
  'treasury.payroll_auto': true,
  /** Pay day of the month (1…28, UTC); a missed day runs the next day. */
  'treasury.payroll_day': 1,
  /** Warn this many days before the pay day when Stripe holds less than
   * the salaries due. */
  'treasury.payroll_warn_days': 5,
};

// Owner 2026-10-05: legal posts vs general (personal) posts. What a person
// who never chose sees: 'all' or 'legal_only' (general posts hidden).
export const OWNER_FEED_SETTINGS = {
  'feed.default_content_mode': 'all',
};

// Owner 2026-10-13: who may ADD files, documents and extra photos to a post
// or a reel: 'by_subscription' | 'off_for_all' | 'on_for_all'. Everyone
// always sees them. By subscription by default; files already in a post stay
// there after the author's subscription ends unless the admin turns
// `attachments_keep_after_cancel` off.
export const OWNER_POST_ATTACHMENT_SETTINGS = {
  attachments_in_posts: 'by_subscription',
  attachments_keep_after_cancel: true,
};

/** Owner 2026-10-28: calendar feed, Google / Outlook connectors, no-shows. */
export const OWNER_CALENDAR_SETTINGS = {
  /** A person may create a secret link and see their LawBid calendar in
   * Apple / Google / Outlook Calendar (read-only ICS feed). */
  'calendar.feed_enabled': true,
  /** Google Calendar two-way link (OFF until the OAuth app is set up in
   * Admin → Integrations → google_calendar). */
  'calendar.google_enabled': false,
  /** Outlook calendar two-way link (OFF until the Azure app is set up). */
  'calendar.microsoft_enabled': false,
  /** Seconds an attorney's busy time from Google / Outlook is reused. */
  'calendar.busy_cache_seconds': 60,
  /** Milliseconds to wait for Google / Outlook before booking goes on
   * without their busy time. */
  'calendar.busy_timeout_ms': 2500,
  /** «Не пришёл»: either side may mark a missed consultation. */
  'consultations.no_show_enabled': true,
  /** The sweep marks a consultation nobody joined by call (OFF at first). */
  'consultations.no_show_auto_detect': false,
  /** Minutes after the start before a no-show may be marked. */
  'consultations.no_show_grace_minutes': 15,
  /** Hours after the end during which a no-show may still be marked. */
  'consultations.no_show_mark_hours': 48,
  /** Hours the marked person has to dispute. */
  'consultations.no_show_dispute_hours': 48,
};

/** Owner 2026-10-20: booking a consultation and «Вопрос юристу». */
export const OWNER_BOOKING_QA_SETTINGS = {
  /** Bookings one client may make in a day. */
  'rate_limit.consultation_book_per_day': 10,
  /** Questions one client may ask in a day. */
  'rate_limit.question_per_day': 3,
  /** Answers (and edits) one attorney may post in an hour. */
  'rate_limit.answer_per_hour': 30,
  /** Owner 2026-10-25 (abuse hardening): generous caps no real person
   * reaches; they stop scripts. Offers one attorney may place in a day. */
  'rate_limit.bid_create_per_day': 200,
  /** Counter-offers (either side) per hour. */
  'rate_limit.bid_counter_per_hour': 120,
  /** Cases one client may publish in a day. */
  'rate_limit.case_create_per_day': 30,
  /** Messages saved to «Сохранённое» per minute. */
  'rate_limit.chat_save_per_minute': 120,
  /** Forwarded messages per minute (on top of the message limit). */
  'rate_limit.forward_per_minute': 60,
  /** Pending + confirmed upcoming consultations one client may hold. */
  'consultations.max_active_per_client': 5,
  /** Owner 2026-10-20: a push to attorneys about every new question is OFF
   * (it would nag them); they open «Вопрос юристу» themselves and see a
   * badge. When on, a new question alerts at most `qa.alert_max_attorneys`
   * attorneys of its practice area and state (those who turned on «Новые
   * кейсы»). */
  'qa.push_attorneys': false,
  /** The compact «new questions» card among an attorney's feed posts. */
  'qa.banner_enabled': true,
  /** Hours between two showings of that card to one attorney. */
  'qa.banner_interval_hours': 24,
  /** The card appears from this many new unanswered questions. */
  'qa.banner_min_new': 1,
  /** The «answer questions, win clients» call on an attorney's profile. */
  'qa.profile_cta_enabled': true,
  'qa.alert_max_attorneys': 500,
  /** Whether a client may ask a question anonymously. */
  'qa.allow_anonymous': true,
};

/**
 * Owner 2026-10-28 (legal safety pass): «Вопрос юристу», шаблоны и сроки —
 * это общая информация, а не юридическая консультация (unauthorized practice
 * of law, ABA Model Rule 5.5 / 7.1); публичный вопрос не должен раскрывать
 * личные данные и детали дела; спам и «индивидуальные советы» ограничены.
 * Defaults keep today's behaviour: the disclaimer is added to responses, the
 * private-info check only records (`warn`), the new limits are generous.
 */
export const OWNER_LEGAL_QA_SAFETY_SETTINGS = {
  /** The server adds a «general information, not legal advice» notice
   * (`meta.disclaimer`) to Q&A, template and deadline responses. */
  'legal.disclaimer.enabled': true,
  'legal.disclaimer.text':
    'General information only, not legal advice. Using this service does not create an attorney-client relationship. Laws differ by state and change over time; talk to a licensed attorney about your situation.',
  /** JSON {"CA":"text", "NY":"text"}: a state's own wording replaces the
   * default text for that state. */
  'legal.disclaimer.by_state': '{}',
  /** Added after the main text on document templates. */
  'legal.disclaimer.template_extra':
    'Templates are general forms and may not fit your state or facts; have an attorney review a document before you use it.',
  /** Added after the main text on deadline calculations. */
  'legal.disclaimer.deadline_extra':
    'Deadlines are computed from published rules and may not reflect local court rules, tolling or the method of service; confirm with the court or an attorney before relying on a date.',

  /** Private info in a public question or answer (SSN, address, case
   * number, opposing party name ...): off | warn (keep the text, record and
   * return the kinds) | redact (replace with a mask) | block (400). */
  'qa.pii_mode': 'warn',
  /** Kinds the check looks for, comma list. */
  'qa.pii_kinds':
    'ssn,card,address,case_number,party_name,immigration_id,dob,id_number,phone,email',

  /** A new account cannot ask a public question for this many hours (0 = no
   * cooldown). */
  'qa.new_account_cooldown_hours': 0,
  /** More links than this in one question or answer is refused (links are
   * masked anyway). */
  'qa.max_links': 5,
  /** Days in which the same text is a duplicate (0 = check off). */
  'qa.duplicate_window_days': 7,
  /** The same question text from this many different people in the window
   * is treated as spam. */
  'qa.duplicate_cross_user_max': 3,
  /** The same answer text may be posted this many times by one attorney in
   * the window (canned replies are spam, not advice). */
  'qa.answer_duplicate_max': 3,
  /** Answers (and edits) one attorney may post in a day. */
  'rate_limit.answer_per_day': 150,
  /** Answers that read as individualized advice from someone who is not
   * licensed in the question's state: off | flag (the admin sees it) | hold
   * (hidden until a moderator restores it). */
  'qa.advice_flag_mode': 'flag',

  /** A user's new sticker image waits for the media scan before others see
   * it (off = published at once, as before). */
  'stickers.scan_uploads': true,
  /** The NCMEC CyberTipline API call for a CSAM report. Off = reports are
   * opened and logged as «file by hand» without calling the API. */
  'moderation.csam.ncmec_submit_enabled': true,
};

import { OWNER_TEXT_LIMIT_SETTINGS } from './text-limits';
import { OWNER_REALTIME_SETTINGS } from './realtime-settings';
import {
  OWNER_CHAT_PHOTO_SETTINGS,
  OWNER_CLIENT_TUNING_SETTINGS,
} from './client-tuning';

/** Legal-grade protection of client documents (security & legal pass,
 * 2026-10-24): attorney–client privilege, ABA Model Rule 1.6(c).
 * - `security.attorney_strong_auth`: an attorney (or assistant) who has
 *   registered a passkey can no longer be signed in by the password alone
 *   — a stolen password is not enough. Without a passkey nothing changes.
 * - `files.confidential_url_ttl_sec`: how long a link to a case file, a
 *   chat document or a support attachment lives. The app asks for a new
 *   link on every open, and access is re-checked each time, so a person
 *   who loses access loses the file within this time.
 * - `files.access_log_enabled`: remember who (other than the owner)
 *   opened a confidential file, from which device — shown to the owner. */
export const OWNER_LEGAL_SECURITY_SETTINGS = {
  'security.attorney_strong_auth': true,
  'files.confidential_url_ttl_sec': 900,
  /** off | on (every view) | auto (default: a sample, below). */
  'files.access_log_enabled': 'auto',
  'files.access_log_sample_percent': 100,
  /** Security pass 2026-10-25 (S3-5): file names of chat attachments and
   * the case's «Личные данные» are stored sealed (AES-256-GCM, bound to the
   * row), and the key job seals the old rows too. Reads accept both forms;
   * off = new rows stay readable as before, already sealed ones stay sealed. */
  'security.seal_case_metadata': true,
  /** Free text in case-journal entries (case titles and description
   * changes) is sealed. The journal is append-only and hash-chained, so
   * old entries cannot be rewritten: every key id used while this is on
   * must stay in MESSAGE_ENC_KEYS for the 5-year retention. Off by default. */
  'security.seal_journal_text': false,
  /** S3-11: push notifications show the message text. Off = «Новое
   * сообщение»; Google and Apple then never see the text. */
  'push.chat_preview': true,
};

/** Owner 2026-10-25: case tools (invoices, signing, case comments). Every
 * switch is off or neutral by default, so nothing changes until the owner
 * turns it on in the admin (Config).
 * - reminders.mode: off | on | auto (default). The reminder/expiry job runs
 *   once a day; auto = it only does work when there are open dated
 *   invoices or pending signing requests; off = it never runs.
 *   reminders.daily_cap = most reminder notices per run (0 = no cap).
 * - invoice_default_due_days: a new invoice gets this due date (0 = none).
 * - invoice_reminder_days: reminders to the client this many days before
 *   the due date (0 = on the day); overdue ones repeat every N days.
 * - invoice_late_fee_percent: 0 = no late fee; otherwise this percent of
 *   the invoice is added once, after the grace days (check that the
 *   engagement letter allows it).
 * - sign_expiry_days: a signing request expires after N days (0 = never);
 *   sign_reminder_every_days: remind the unsigned side every N days (0 = off).
 * - case_comments.edit_window_minutes: the author may edit a comment this
 *   long after posting (0 = editing off); earlier texts are kept. */
export const OWNER_CASE_TOOLS_SETTINGS = {
  'case_tools.reminders.mode': 'auto',
  'case_tools.reminders.daily_cap': 2000,
  'case_tools.invoice_default_due_days': 0,
  'case_tools.invoice_reminder_days': [3, 0],
  'case_tools.invoice_overdue_remind_every_days': 7,
  'case_tools.invoice_max_reminders': 6,
  'case_tools.invoice_late_fee_percent': 0,
  'case_tools.invoice_late_fee_grace_days': 5,
  'case_tools.sign_expiry_days': 0,
  'case_tools.sign_reminder_every_days': 0,
  'case_tools.sign_max_reminders': 3,
  'case_tools.sign_resend_cooldown_minutes': 60,
  'case_comments.edit_window_minutes': 15,
  'case_comments.edit_max_edits': 5,
};

/** 2026-10-25 (legal register): 18+ gate, text messages (TCPA), e-mail
 * footers. Everything is OFF by default, so today's behaviour is kept.
 * - `compliance.age_gate.mode`: off | record (store the attestation when the
 *   app sends it) | enforce (a NEW account without a valid 18+ attestation
 *   is refused with 403 AGE_ATTESTATION_REQUIRED; turn on only after the app
 *   shows the checkbox and sends `ageAttestation`).
 * - `compliance.sms.marketing_enabled`: master switch for any text that is
 *   not a sign-in code. A code is always allowed.
 * - quiet hours: no non-code text before `quiet_end_hour` or from
 *   `quiet_start_hour` in the person's local time (TCPA 8:00-21:00); unknown
 *   time zone = the strictest US-wide window.
 * - `compliance.email.footer_address`: the postal address printed in the
 *   footer of notification mail; empty = the outreach address. */
export const OWNER_COMPLIANCE_SETTINGS = {
  'compliance.age_gate.mode': 'off',
  'compliance.age_gate.min_age': 18,
  'compliance.age_gate.text_version': 'age-18-v1',
  'compliance.age_gate.require_birth_date': false,
  'compliance.sms.marketing_enabled': false,
  'compliance.sms.quiet_start_hour': 21,
  'compliance.sms.quiet_end_hour': 8,
  'compliance.sms.disclosure_version': 'sms-v1',
  'compliance.sms.disclosure_text':
    'By tapping Agree you consent to receive recurring text messages from LawBid at this number. Consent is not a condition of any purchase. Message and data rates may apply. Reply STOP to cancel, HELP for help.',
  'compliance.sms.help_text':
    'LawBid: for help email support or visit lawbid.com/support. Reply STOP to cancel. Msg&data rates may apply.',
  'compliance.sms.reply_to_help': false,
  'compliance.sns.topic_arns': '',
  'compliance.email.footer_address': '',
};

/** S12-8 (observability round 12): per-route request / error / latency
 * metrics for ~15 journey routes, written as CloudWatch EMF lines
 * (namespace LawBid/Routes, dimension Route). 3 metrics x 15 routes = 45
 * custom metrics = about $13.5 a month once every route has data.
 * `off` — nothing written; `on` — every minute for every route; `auto`
 * (default) — a route writes a minute only while it has 5xx answers or a
 * slow 95th percentile (> 1 s), so a healthy system costs nothing and a
 * sick route is visible at once. RED dashboard in infra/modules/monitoring. */
export const OWNER_OBSERVABILITY_SETTINGS = {
  'ops.route_metrics.mode': 'auto',
};

/**
 * Owner 2026-10-25: new-case alerts in waves (docs/CASE_FANOUT.md). The
 * defaults keep today's reach: one wave of up to 5000 attorneys, no daily
 * cap, no stop at N offers; only the ORDER is new (best first, newcomers
 * reserved a share). Tune from the admin panel without a release.
 * - fraud actions: 'normal' | 'small' (a small delayed wave, then stop) |
 *   'none' (no alerts) for a client whose fraud status is review /
 *   restricted (docs/CLIENT_FRAUD.md);
 * - 0 means "off" for `stop_at_bids`, `daily_cap`, `new_quota_percent`. */
export const OWNER_CASE_FANOUT_SETTINGS = {
  'case_fanout.enabled': false,
  'case_fanout.first_wave_size': 5000,
  'case_fanout.wave_size': 5000,
  'case_fanout.wave_interval_minutes': 10,
  'case_fanout.max_waves': 20,
  'case_fanout.stop_at_bids': 0,
  'case_fanout.new_quota_percent': 20,
  'case_fanout.new_max_alerts': 20,
  'case_fanout.new_max_bids': 3,
  'case_fanout.daily_cap': 0,
  'case_fanout.fraud_review_action': 'normal',
  'case_fanout.fraud_restricted_action': 'none',
  'case_fanout.fraud_small_wave_size': 10,
  'case_fanout.fraud_delay_minutes': 60,
};

/**
 * Owner 2026-10-25 (privacy round 13, S13-5/S13-14): the retention periods
 * the privacy policy promises, and the deletion-request behaviour. Defaults
 * equal the numbers in the policy text (apps/api/assets/legal/privacy.*.md);
 * change a number here AND in the published policy. 0 = keep for ever.
 * - `privacy.auto_retention`: master switch of the nightly `privacy.retention`.
 * - `privacy.retention_audit_log_days`: admin action log (5 years).
 * - `privacy.retention_data_access_log_days`: what an official request
 *   looked at (5 years); rows of a request under a hold stay.
 * - `privacy.retention_session_ip_days`: IP address and browser string of
 *   a session not used for this long are blanked.
 * - `privacy.retention_contact_disclosure_ip_days`: IP and device of a
 *   contact disclosure are blanked after this long (the record stays).
 * - `privacy.login_cancels_deletion`: false = signing in does NOT cancel a
 *   pending account deletion (cancel = explicit button / e-mail link);
 *   true = the old behaviour, any sign-in cancels.
 */
export const OWNER_PRIVACY_SETTINGS = {
  'privacy.auto_retention': true,
  'privacy.retention_audit_log_days': 1825,
  'privacy.retention_data_access_log_days': 1825,
  'privacy.retention_session_ip_days': 90,
  'privacy.retention_contact_disclosure_ip_days': 730,
  // Perf review 2026-10-26 (R-39): rows per statement / per table per run.
  'privacy.retention_batch': 5000,
  'privacy.retention_max_rows': 1_000_000,
  'privacy.login_cancels_deletion': false,
  // Cost gate: ceilings on what deletion can bill (e-mail / push of the
  // day-13 notice per run, Twilio delete calls per account).
  'privacy.deletion_notices_per_day': 2000,
  'privacy.twilio_purge_enabled': true,
  'privacy.twilio_purge_max_messages': 200,
};

/**
 * Cost registry (owner 2026-10-25): three-state switches off | on | auto for
 * the things that bill by use (admin «Расходы»). Default = auto.
 * - `scale.capacity_ceiling.mode`: auto = the database / Redis autoscalers
 *   may not grow past what the allowed monthly spend pays for (the economy
 *   tick writes the ceiling into AWS SSM); off = only the Terraform ceiling.
 * - `scale.bunny_hardstop.mode` / `scale.cloudflare_hardstop.mode`: auto =
 *   new video uploads pause (Bunny) / group calls fall back to
 *   device-to-device (Cloudflare) once the monthly traffic reaches the
 *   urgent threshold (usage.*_crit_gb); on = stopped now; off = never.
 * - `ops.outbox_sweep.mode` (audit X-22, 2026-10-26): the every-minute relay
 *   of the cross-family outbox (idle while there is one database). auto =
 *   sweep only when an event waits; on = every tick; off = never.
 */
export const OWNER_COST_REGISTRY_SETTINGS = {
  'scale.capacity_ceiling.mode': 'auto',
  'scale.bunny_hardstop.mode': 'auto',
  'scale.cloudflare_hardstop.mode': 'auto',
  'ops.outbox_sweep.mode': 'auto',
};

/**
 * Owner 2026-10-26: infra switches from the admin (docs/runbooks/
 * infra-from-admin.md). Guards of the «План → код 2FA → применить» flow:
 * - `infra.dry_run`: true = the cloud is only planned, never changed (the
 *   admin shows the plan and stops). Start with true, flip after one look.
 * - `infra.daily_cap`: at most this many change requests per 24 hours.
 * - `infra.quiet_hours`: "HH:MM-HH:MM" (America/Chicago) when an apply may
 *   start; empty = any time.
 */
export const OWNER_INFRA_SETTINGS = {
  'infra.dry_run': true,
  'infra.daily_cap': 3,
  'infra.quiet_hours': '',
};

export const APP_SETTINGS = {
  ...OWNER_COMPLIANCE_SETTINGS,
  ...FILE_03_SETTINGS,
  ...FILE_04_SETTINGS,
  ...FILE_05_SETTINGS,
  ...FILE_06_SETTINGS,
  ...OWNER_MEDIA_SETTINGS,
  ...OWNER_SUPPORT_SETTINGS,
  ...OWNER_BADGE_SETTINGS,
  ...OWNER_LAWYER_VERIFICATION_SETTINGS,
  ...OWNER_TASKS_SETTINGS,
  ...OWNER_WEB_SETTINGS,
  ...OWNER_SMS_SETTINGS,
  ...OWNER_PAY_PAGE_SETTINGS,
  ...OWNER_BILLING_GATE_SETTINGS,
  ...OWNER_AUTOMATION_SETTINGS,
  ...OWNER_INVITE_SETTINGS,
  ...OWNER_SEAT_SETTINGS,
  ...OWNER_URGENCY_SETTINGS,
  ...OWNER_EXPERIMENT_SETTINGS,
  ...OWNER_STALE_SETTINGS,
  ...OWNER_CONTINGENCY_SETTINGS,
  ...OWNER_TRUST_SETTINGS,
  ...OWNER_TRIAL_SETTINGS,
  ...OWNER_REASON_SETTINGS,
  ...OWNER_ADMIN_HARDENING_SETTINGS,
  ...OWNER_TRANSLATE_SETTINGS,
  ...OWNER_SUPPORT_DESK_SETTINGS,
  ...OWNER_REWARDS_SETTINGS,
  ...OWNER_COUNTRY_SETTINGS,
  ...OWNER_RATE_LIMIT_SETTINGS,
  ...OWNER_STORAGE_SETTINGS,
  ...OWNER_CHAT_ACTION_SETTINGS,
  ...OWNER_FRAUD_SETTINGS,
  ...OWNER_STRIPE_OPS_SETTINGS,
  ...OWNER_OPS_SETTINGS,
  ...OWNER_TREASURY_SETTINGS,
  ...OWNER_FEED_SETTINGS,
  ...OWNER_POST_ATTACHMENT_SETTINGS,
  ...OWNER_BOOKING_QA_SETTINGS,
  ...OWNER_LEGAL_QA_SAFETY_SETTINGS,
  ...OWNER_CALENDAR_SETTINGS,
  ...OWNER_TEXT_LIMIT_SETTINGS,
  ...OWNER_CACHE_SETTINGS,
  ...OWNER_REALTIME_SETTINGS,
  ...OWNER_CLIENT_TUNING_SETTINGS,
  ...OWNER_CHAT_PHOTO_SETTINGS,
  ...OWNER_LEGAL_SECURITY_SETTINGS,
  ...OWNER_PRIVACY_SETTINGS,
  ...OWNER_CASE_TOOLS_SETTINGS,
  ...OWNER_OBSERVABILITY_SETTINGS,
  ...OWNER_CASE_FANOUT_SETTINGS,
  ...OWNER_COST_REGISTRY_SETTINGS,
  ...OWNER_INFRA_SETTINGS,
};

export type AppSettingKey = keyof typeof APP_SETTINGS;
