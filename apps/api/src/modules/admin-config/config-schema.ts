import { APP_SETTINGS } from '../../common/app-settings/app-settings.defaults';
import { REALTIME_SETTING_DEFS } from '../../common/app-settings/realtime-settings';
import {
  STAFF_NOT_BUILT,
  STAFF_NOT_BUILT_NOTE,
  STAFF_NUMBER_DEFS,
  STAFF_SWITCH_LABELS,
} from '../../common/app-settings/staff-settings';
import { TEXT_LIMIT_DEFS } from '../../common/app-settings/text-limits';
import {
  CLIENT_TUNING_DEFS,
  type ClientTuningDef,
} from '../../common/app-settings/client-tuning';
import { COST_PROVIDERS } from '../../common/cost-guard/cost-guard.constants';
import type { ConfigValueType } from './admin-config.dto';
import { ADMIN_AREAS } from '../admin-auth/admin-permissions';
import { SEATS_HARD_CAP, TRIAL_DAYS_MAX } from '../billing/billing.constants';
import { STAFF_AI_MODELS } from '../staff-ai/staff-ai.types';
import {
  ADMIN_THROTTLE_MAX,
  ADMIN_THROTTLE_MIN,
} from '../../throttler/throttle-limits';
import { OTP_DAILY_LIMIT_MAX, OTP_DAILY_LIMIT_MIN } from '../auth/otp-limits';

export interface ConfigKeySchema {
  type: ConfigValueType;
  defaultValue: unknown;
  description: string | null;
  min?: number;
  max?: number;
  /** For string / string[] values: each item must match. */
  pattern?: RegExp;
}

/**
 * docs/06 §2.3 item 8 "редактор значений app_config … с валидацией
 * схемой". Every editable key is declared here: the typed file-03/04/05/06
 * tunables (`APP_SETTINGS`, types inferred from their defaults), the cost
 * guard caps and the SMS allow-list (docs/COST_PROTECTION.md), the minimum
 * app versions (file 01 §15). Unknown keys are refused — the panel can't
 * create arbitrary rows.
 */
/** An admin area key (admin-permissions ADMIN_AREAS) or `money`. */
const REASON_AREA_PATTERN = new RegExp(`^(${[...ADMIN_AREAS].join('|')})$`);

/** An IPv4/IPv6 address or an IPv4 CIDR (checked again by parseAllowlistEntry). */
const IP_OR_CIDR_PATTERN = /^[0-9a-fA-F:.]{2,45}(\/\d{1,2})?$/;

export function configSchema(): Record<string, ConfigKeySchema> {
  const out: Record<string, ConfigKeySchema> = {};
  for (const [key, def] of Object.entries(APP_SETTINGS)) {
    // Owner 2026-10-05: how the Stripe balance is split changes only in
    // Деньги → Прибыль и резерв (super admin + a fresh 2FA code), never
    // through this generic editor (area `settings`).
    if (key.startsWith('treasury.')) continue;
    out[key] = inferred(def);
  }
  // Owner 2026-10-22: calls. The provider switch is checked again on save
  // (livekit needs LIVEKIT_URL / LIVEKIT_API_KEY / LIVEKIT_API_SECRET).
  out['media.public_store'] = {
    type: 'string',
    defaultValue: 'aws',
    description:
      'Where new PUBLIC media (avatars, post and review photos, stickers) is stored: aws or r2 (Cloudflare R2; needs Integrations → Cloudflare R2). Private files (chats, cases, documents, verification) always stay on AWS.',
    pattern: /^(aws|r2)$/,
  };
  // Owner 2026-10-24 (search-ready): checked again on save (engine keys).
  out['ledger.reconcile_mode'] = {
    type: 'string',
    defaultValue: 'auto',
    description:
      'Nightly check of the money ledger. off: not run. on: the whole ledger every night (grows with the table). auto (default): the last N days every night and the whole ledger once a week.',
    pattern: /^(off|on|auto)$/,
  };
  out['ledger.reconcile_window_days'] = {
    type: 'integer',
    defaultValue: 7,
    description:
      'Days the nightly ledger check covers in auto mode (the whole ledger is still checked weekly).',
    min: 1,
    max: 90,
  };
  out['search.engine'] = {
    type: 'string',
    defaultValue: 'postgres',
    description:
      'Who answers searches: postgres (today), shadow (ask the search engine too, show Postgres, log the differences) or engine (the search engine, Postgres if it fails or is slow). The engine needs Integrations → Search engine (OpenSearch).',
    pattern: /^(postgres|shadow|engine)$/,
  };
  out['search.engine_follow'] = {
    type: 'string',
    defaultValue: 'auto',
    description:
      'Who moves search.engine. auto (default): the cloud automation, together with the search engine: when it switches the engine on, shadow, then a reindex from the database, then the engine; when the engine is off, back to postgres. manual: only the admin, by hand.',
    pattern: /^(auto|manual)$/,
  };
  out['search.engine_kind'] = {
    type: 'string',
    defaultValue: 'domain',
    description:
      'Which search engine the app talks to: domain (OpenSearch domain, about $25 a month for the smallest) or serverless (Amazon OpenSearch Serverless, from about $350 a month, no servers to size). Serverless needs growth.opensearch_serverless_enabled in Terraform. Changing it needs a reindex.',
    pattern: /^(domain|serverless)$/,
  };
  out['search.engine_timeout_ms'] = {
    type: 'integer',
    defaultValue: 800,
    description:
      'The search engine answers slower than this, milliseconds: the search falls back to Postgres for that request.',
    min: 100,
    max: 5000,
  };
  out['search.reindex_keep_days'] = {
    type: 'integer',
    defaultValue: 7,
    description:
      'After a search reindex, the old index is kept this many days so you can roll back, then deleted.',
    min: 1,
    max: 60,
  };
  out['events.sink'] = {
    type: 'string',
    defaultValue: 'auto',
    description:
      'Internal event stream (user signed up, case created, bid placed, payment, post...): off (not recorded), db (own table), stream (table + Kinesis; needs the stream turned on in infrastructure) or auto (default: not recorded until a consumer such as experiments / analytics needs the events; then db, moving to stream when events per day pass the ceiling below).',
    pattern: /^(off|db|stream|auto)$/,
  };
  out['events.max_per_day'] = {
    type: 'integer',
    defaultValue: 1000000,
    description:
      'Hard ceiling: events recorded per day at most, in every mode; past it the rest of the day records nothing.',
    min: 1000,
    max: 2000000000,
  };
  out['events.retention_days'] = {
    type: 'integer',
    defaultValue: 30,
    description: 'Recorded events are deleted after this many days.',
    min: 1,
    max: 365,
  };
  out['events.auto_ceiling_per_day'] = {
    type: 'integer',
    defaultValue: 2000000,
    description:
      'In auto mode: when events per day pass this number the stream is used instead of only the database.',
    min: 1000,
    max: 2000000000,
  };
  out['search.reindex_throttle_ms'] = {
    type: 'integer',
    defaultValue: 200,
    description:
      'A search reindex pauses this many milliseconds between batches of 500 documents, so it does not slow the database.',
    min: 0,
    max: 5000,
  };
  out['calls.video_provider'] = {
    type: 'string',
    defaultValue: 'p2p',
    description:
      'Media server for group calls on our own path: p2p (device to device, up to 9 people) or livekit (needs the LiveKit keys in Integrations). The AUTOMATIC backup when Cloudflare fails is always device to device (+ own coturn) — LiveKit is not part of it (TS-3). Cloudflare is chosen by calls.transport, not here; the old value cloudflare reads like p2p.',
    pattern: /^(p2p|livekit|cloudflare)$/,
  };
  out['calls.sfu_max_participants'] = {
    type: 'integer',
    defaultValue: 20,
    description:
      'Most people in one group call while Cloudflare carries group calls (Cloudflare SFU keys set and calls.transport not own), also during the automatic backup.',
    min: 2,
    max: 100,
  };
  out['calls.sfu_fallback_mesh_max'] = {
    type: 'integer',
    defaultValue: 4,
    description:
      'Only while Cloudflare is down or not configured: group calls up to this many people keep their video (device to device); with more people everyone is audio only. Calls are never refused.',
    min: 2,
    max: 100,
  };
  out['calls.transport'] = {
    type: 'string',
    defaultValue: 'auto',
    description:
      'Who carries calls. auto (default) = Cloudflare (TURN for 1:1, SFU for groups) whenever its keys are set; our own path (own TURN, device to device) only while Cloudflare keeps failing, back to Cloudflare by itself. cloudflare = always Cloudflare. own = never Cloudflare. A running call keeps its path.',
    pattern: /^(auto|cloudflare|own)$/,
  };
  out['calls.transport_fail_limit'] = {
    type: 'integer',
    defaultValue: 5,
    description:
      'Cloudflare call failures (within calls.transport_fail_window_sec) after which NEW calls switch to our own path until Cloudflare answers again (probed once a minute).',
    min: 1,
    max: 1000,
  };
  out['calls.transport_fail_window_sec'] = {
    type: 'integer',
    defaultValue: 120,
    description:
      'The window, in seconds, in which calls.transport_fail_limit Cloudflare failures switch new calls to our own path.',
    min: 10,
    max: 3600,
  };
  out['calls.transport_report_min'] = {
    type: 'integer',
    defaultValue: 10,
    description:
      'Phones reporting a dead Cloudflare relay (within calls.transport_fail_window_sec) switch new calls to our own path when at least this many distinct phones say so; with only a few calls the minimum shrinks by itself to 2 phones / half of the calls.',
    min: 2,
    max: 10000,
  };
  out['calls.relay_signal_filter'] = {
    type: 'boolean',
    defaultValue: true,
    description:
      'Phones whose ICE list said relay pass only relay candidates to the other phone (older apps ignore the policy). Off = every signal passes unchanged.',
  };
  out['calls.transport_report_ratio_pct'] = {
    type: 'integer',
    defaultValue: 30,
    description:
      'The reporting phones must also be at least this percent of the calls that took Cloudflare in the window (one phone in a lift is not an outage).',
    min: 0,
    max: 100,
  };
  out['calls.max_participants'] = {
    type: 'integer',
    defaultValue: 9,
    description:
      'Most people in one group call. With p2p the effective cap is 9 whatever is set here.',
    min: 2,
    max: 50,
  };
  out['calls.solo_end_seconds'] = {
    type: 'integer',
    defaultValue: 3,
    description:
      'When only one person is left in a call, the call ends after this many seconds unless somebody joins. 0 = end at once.',
    min: 0,
    max: 600,
  };
  for (const provider of COST_PROVIDERS) {
    for (const window of ['per_minute_max', 'daily_max', 'monthly_max']) {
      out[`budget.${provider}.${window}`] = {
        type: 'integer',
        defaultValue: null,
        description: `Cost guard cap for ${provider} (${window.replace(/_/g, ' ')}); 0 disables the provider.`,
        min: 0,
        max: 10_000_000,
      };
    }
  }
  // Owner 2026-10-22 (audit #4 §6): daily spend caps in US cents.
  for (const provider of COST_PROVIDERS) {
    out[`budget.${provider}.daily_cents`] = {
      type: 'integer',
      defaultValue: null,
      description: `Daily money cap for ${provider}, in US cents (empty = the call cap converted with the price table; 0 = no money cap).`,
      min: 0,
      max: 100_000_000,
    };
  }
  out['budget.money.global_daily_cents'] = {
    type: 'integer',
    defaultValue: null,
    description:
      'Daily money cap for all paid services together, in US cents (empty = automatic: allowed spend / 30 x economy.daily_brake_days, about $15 a day at launch; 0 = none). An alert fires at 80 %.',
    min: 0,
    max: 100_000_000,
  };
  out['scale.endpoints.mode'] = {
    type: 'string',
    defaultValue: 'auto',
    description:
      'VPC interface endpoints (about $29 a month): auto = created / removed by NAT traffic, on = always kept, off = never.',
    pattern: /^(auto|on|off)$/,
  };
  out['calls.own_turn.mode'] = {
    type: 'string',
    defaultValue: 'auto',
    description:
      'Own coturn relay box: auto = started only while Cloudflare is down and stopped after 30 quiet minutes, on = always running, off = never.',
    pattern: /^(auto|on|off)$/,
  };
  out['scale.endpoints.ceiling'] = {
    type: 'integer',
    defaultValue: 4,
    description:
      'Most VPC interface endpoints the automation may keep (0 = none, 4 = all).',
    min: 0,
    max: 4,
  };
  // Owner 2026-11-12 (row 67): no upper bound, only the owner's number.
  for (const kind of ['api', 'worker', 'api_admin', 'admin', 'pgbouncer']) {
    out[`scale.max_tasks.${kind}`] = {
      type: 'integer',
      defaultValue: 100,
      description: `Most copies autoscaling may run of the ${kind.replace('_', '-')} service (default 100, no upper bound).`,
      min: 1,
      max: Number.MAX_SAFE_INTEGER,
    };
  }
  out['scale.spot_fallback.mode'] = {
    type: 'string',
    defaultValue: 'auto',
    description:
      'Fargate Spot fallback: auto = no Spot capacity moves a service to regular Fargate and back after a quiet hold, on = hold every service on regular Fargate, off = hands off.',
    pattern: /^(auto|on|off)$/,
  };
  out['budget.sms.monthly_cents'] = {
    type: 'integer',
    defaultValue: null,
    description:
      'Monthly money cap for SMS, in US cents (empty = BUDGET_SMS_MONTHLY_CENTS, $100; 0 = none).',
    min: 0,
    max: 100_000_000,
  };
  // S9-2: the one price book. Empty = the list price in cost-prices.ts.
  for (const provider of COST_PROVIDERS) {
    out[`cost.unit_millicents.${provider}`] = {
      type: 'integer',
      defaultValue: null,
      description: `Price of one unit of ${provider} in millicents (1/1000 of a cent), overrides the list price used by the money brakes and the economy guard (empty = list price).`,
      min: 0,
      max: 100_000_000,
    };
  }
  out['budget.money.user_daily_cents'] = {
    type: 'integer',
    defaultValue: null,
    description:
      'Daily money cap per person (translations, uploads, video), in US cents (empty = BUDGET_USER_DAILY_CENTS, $5; 0 = none).',
    min: 0,
    max: 1_000_000,
  };
  // Owner 2026-10-15: how long each free-text field may be. Whole numbers
  // inside what the database and the request validators accept.
  for (const [key, def] of Object.entries(TEXT_LIMIT_DEFS)) {
    out[key] = {
      ...out[key],
      type: 'integer',
      description: `${def.label}: most characters (${def.min}–${def.max}). The app shows a counter and stops at the same number.`,
      min: def.min,
      max: def.max,
    };
  }
  // Staff package T1 (2026-10-27): switches (all off) and numbers with
  // their bounds; Russian label + key, like the realtime timings.
  for (const [key, labelRu] of Object.entries(STAFF_SWITCH_LABELS)) {
    out[key] = {
      type: 'boolean',
      defaultValue: false,
      description: `${labelRu} (${key}). По умолчанию выключено.${STAFF_NOT_BUILT.has(key) ? STAFF_NOT_BUILT_NOTE : ''}`,
    };
  }
  for (const [key, def] of Object.entries(STAFF_NUMBER_DEFS)) {
    const defaultValue = APP_SETTINGS[key as keyof typeof APP_SETTINGS];
    out[key] = {
      type: 'integer',
      defaultValue,
      description: `${def.labelRu} (${key}). По умолчанию ${String(defaultValue)}, от ${def.min} до ${def.max}.${STAFF_NOT_BUILT.has(key) ? STAFF_NOT_BUILT_NOTE : ''}`,
      min: def.min,
      max: def.max,
    };
  }
  // Owner 2026-10-23: the live-connection timings (Russian label + key).
  for (const def of REALTIME_SETTING_DEFS) {
    out[def.key] = {
      type: def.fraction ? 'number' : 'integer',
      defaultValue: def.default,
      description: `${def.labelRu} (${def.key}). По умолчанию ${def.default}.`,
      min: def.min,
      max: def.max,
    };
  }
  for (const key of ['post.max_chars_media', 'post.max_chars_brief']) {
    out[key] = { ...out[key], type: 'integer', min: 1, max: 5000 };
  }
  // Owner 2026-10-13: who may add files to posts and reels.
  out['attachments_in_posts'] = {
    ...out['attachments_in_posts'],
    description:
      'Who may add documents and extra photos to a post or a reel: by_subscription, off_for_all or on_for_all.',
    pattern: /^(by_subscription|off_for_all|on_for_all)$/,
  };
  out['attachments_keep_after_cancel'] = {
    ...out['attachments_keep_after_cancel'],
    description:
      'Keep the files of a post / reel visible after its author’s subscription ends (only in by_subscription mode).',
  };
  // Owner 2026-10-05: assistants per attorney, set in the admin.
  out['billing.max_assistant_seats'] = {
    ...out['billing.max_assistant_seats'],
    description:
      'How many assistants an attorney may add; the yearly plan covers this many.',
    min: 1,
    max: SEATS_HARD_CAP,
  };
  // Owner 2026-10-22: duties per assistant (11 exist; the app and the API
  // both refuse more). R-401 (owner 2026-11-04): 0 = «все» (no limit).
  out['assistants.max_duties'] = {
    ...out['assistants.max_duties'],
    type: 'integer',
    description:
      'Макс. ролей у одного помощника (assistants.max_duties): число от 1 до 11 или 0 = все (без ограничения). По умолчанию 3.',
    min: 0,
    // The 11 duties of assistants/assistant-duties.ts (not imported: the
    // admin config stays free of feature modules).
    max: 11,
  };
  // Owner 2026-10-22 (audit #4 §6): group / channel / post caps.
  out['groups.max_members'] = {
    ...out['groups.max_members'],
    description: 'Most members in one group (2–5000).',
    min: 2,
    max: 5000,
  };
  out['channels.max_owned'] = {
    ...out['channels.max_owned'],
    description: 'Most channels one person may own (0 = no cap).',
    min: 0,
    max: 10_000,
  };
  // Owner 2026-10-05: case urgency thresholds (days left) and reminders.
  for (const level of ['very_urgent', 'urgent', 'soon', 'within_month']) {
    out[`cases.urgency_days_${level}`] = {
      ...out[`cases.urgency_days_${level}`],
      min: 0,
      max: 365,
    };
  }
  out['cases.deadline_reminder_days'] = {
    ...out['cases.deadline_reminder_days'],
    min: 0,
    max: 60,
  };
  // Owner 2026-10-05: the admin panel's own request limit.
  out['security.admin_rate_limit_per_minute'] = {
    ...out['security.admin_rate_limit_per_minute'],
    description:
      'Requests per minute one signed-in admin may make; 0 = no limit (the default; users stay at 100); ADMIN_THROTTLE_LIMIT in the env overrides it.',
    min: ADMIN_THROTTLE_MIN,
    max: ADMIN_THROTTLE_MAX,
  };
  for (const key of [
    'rate_limit.bid_create_per_day',
    'rate_limit.bid_counter_per_hour',
    'rate_limit.case_create_per_day',
    'rate_limit.chat_save_per_minute',
    'rate_limit.forward_per_minute',
    'rate_limit.search_suggest_per_minute',
  ] as const) {
    out[key] = { ...out[key], min: 1, max: 100000 };
  }
  out['realtime.max_connects_per_ip_per_minute'] = {
    ...out['realtime.max_connects_per_ip_per_minute'],
    description:
      'New live connections per minute from one address (0 = no limit). Mobile networks and offices share addresses: keep it generous.',
    min: 0,
    max: 100000,
  };
  out['realtime.max_connects_per_user_per_minute'] = {
    ...out['realtime.max_connects_per_user_per_minute'],
    description:
      'New live connections per minute from one signed-in person (0 = no limit). A signed-in person is counted by account, not by address.',
    min: 0,
    max: 100000,
  };
  out['security.password_hash_concurrency'] = {
    ...out['security.password_hash_concurrency'],
    description:
      'Password checks running at once on one server (the rest wait). Keep it at about half the server threads (UV_THREADPOOL_SIZE).',
    min: 1,
    max: 64,
  };
  out['security.password_hash_max_queue'] = {
    ...out['security.password_hash_max_queue'],
    min: 0,
    max: 100000,
  };
  out['security.password_breach_timeout_ms'] = {
    ...out['security.password_breach_timeout_ms'],
    min: 200,
    max: 10000,
  };
  out['realtime.max_sockets_per_user'] = {
    ...out['realtime.max_sockets_per_user'],
    description:
      'Most live (socket) connections one person may hold on one API server; the oldest are closed beyond it. Several devices and browser tabs are normal: keep it at 10 or more.',
    min: 1,
    max: 100,
  };
  out['security.anonymous_rate_limit_per_minute'] = {
    ...out['security.anonymous_rate_limit_per_minute'],
    description:
      'Requests per minute one address may make before signing in (guest browsing, login screens). Many people share a mobile-carrier or office address: raise it if they report "too many requests". Not below 100.',
    min: 100,
    max: 5000,
  };
  // Owner 2026-10-07: daily cap of sign-in codes per phone / e-mail.
  // At least 1: 0 would lock everyone out of sign-in, it never means
  // "unlimited".
  out['security.otp_per_identifier_per_day'] = {
    ...out['security.otp_per_identifier_per_day'],
    description:
      'Sign-in codes (SMS or e-mail) one phone number or e-mail may request in 24 hours (1–1000); OTP_RATE_LIMIT_PER_IDENTIFIER_PER_DAY in the env applies until this is saved.',
    min: OTP_DAILY_LIMIT_MIN,
    max: OTP_DAILY_LIMIT_MAX,
  };
  // Security research #5 (2026-10-22), A4.
  out['security.app_check.mode'] = {
    ...out['security.app_check.mode'],
    description:
      'Firebase App Check on sign-in codes, password reset, social sign-in and the phone-status check: off | monitor (log only, default) | enforce (a request without a valid token from the app gets 403; a code by e-mail still works).',
    pattern: /^(off|monitor|enforce)$/,
  };
  out['security.turnstile.mode'] = {
    ...out['security.turnstile.mode'],
    description:
      'Cloudflare Turnstile на сайте (не в приложении): off (по умолчанию) | monitor (проверять и писать в лог, не блокировать) | enforce (неверный токен — 403 TURNSTILE_FAILED, верный пропускает без App Check). Нужен секретный ключ в Интеграции → Cloudflare Turnstile.',
    pattern: /^(off|monitor|enforce)$/,
  };
  out['security.app_check.replay_protection'] = {
    ...out['security.app_check.replay_protection'],
    description:
      'With App Check on enforce: every token is accepted once on the sign-in code (phone), password-reset code and phone-status routes (replay protection, one extra round trip). Turn on only after the app sends limited-use tokens there.',
  };
  out['security.auth_challenge_after_failures'] = {
    ...out['security.auth_challenge_after_failures'],
    description:
      'After this many wrong passwords or codes for one account in 15 minutes (5 times as many from one address) the next attempt must carry a valid App Check or Turnstile token. 0 = never (default).',
    min: 0,
    max: 50,
  };
  out['security.otp_legacy_purpose_fallback'] = {
    ...out['security.otp_legacy_purpose_fallback'],
    description:
      'On (default): a re-authentication or add-a-sign-in-method code asked by an older app build (without its purpose) is still accepted. Off: a code works only for the flow it was asked for.',
  };
  out['security.signup_block_disposable_email'] = {
    ...out['security.signup_block_disposable_email'],
    description:
      'On (default): a new account cannot be opened with an e-mail from the disposable-domain list (code by e-mail or Google / Apple sign-in). Existing accounts are not affected.',
  };
  out['security.new_country_alert_enabled'] = {
    ...out['security.new_country_alert_enabled'],
    description:
      'On: the owner gets the new-device alert when a session is used from a country it was not used from before. Off by default (costs an e-mail and a push; max one per account per 24 h). Needs the CloudFront-Viewer-Country header.',
  };
  // Legal register 2026-10-25: 18+ gate, text messages, e-mail footers.
  out['compliance.age_gate.mode'] = {
    ...out['compliance.age_gate.mode'],
    description:
      'Возрастной барьер 18+: off (по умолчанию) | record (записывать подтверждение, если приложение его прислало) | enforce (новый аккаунт без подтверждения 18+ получает 403 AGE_ATTESTATION_REQUIRED). enforce включать только после того, как приложение покажет галочку и начнёт слать ageAttestation.',
    pattern: /^(off|record|enforce)$/,
  };
  out['compliance.age_gate.min_age'] = {
    ...out['compliance.age_gate.min_age'],
    min: 13,
    max: 21,
  };
  out['compliance.sms.quiet_start_hour'] = {
    ...out['compliance.sms.quiet_start_hour'],
    min: 0,
    max: 23,
  };
  out['compliance.sms.quiet_end_hour'] = {
    ...out['compliance.sms.quiet_end_hour'],
    min: 0,
    max: 23,
  };
  // S12-8: per-route metrics (CloudWatch custom metrics are billed).
  out['ops.route_metrics.mode'] = {
    ...out['ops.route_metrics.mode'],
    description:
      'Per-route request / error / latency metrics for about 15 key routes (CloudWatch LawBid/Routes, about $13.5 a month when all routes report): off (default) | on (always) | auto (a route reports only while it has 5xx answers or p95 above 1 s; every route with one bad minute is billed).',
    pattern: /^(off|on|auto)$/,
  };
  // 2026-11-02: HA copies and the replica auto-create (typos must not act).
  out['ha.mode'] = { ...out['ha.mode'], pattern: /^(off|on|auto)$/ };
  out['db.shards_mode'] = {
    ...out['db.shards_mode'],
    pattern: /^(off|on|auto)$/,
  };
  for (const k of [
    'infra.mode.rds_replicas',
    'infra.mode.pgbouncer',
    'infra.mode.opensearch',
    'infra.mode.opensearch_nodes_2',
    'infra.mode.opensearch_nodes_4',
    'infra.mode.waf_bot_control',
    'infra.mode.waf_extra_rules',
    'infra.mode.events_stream',
    'infra.mode.partition_role',
    'infra.mode.rds_replicas_2',
    'infra.mode.rds_replicas_3',
    'infra.mode.rds_replicas_4',
    'infra.mode.rds_replicas_5',
    'infra.mode.db_shards_2',
    'infra.mode.db_shards_3',
  ]) {
    out[k] = { ...out[k], pattern: /^(off|on|auto)$/ };
  }
  out['db.shards_move_hours'] = {
    ...out['db.shards_move_hours'],
    // Same rule as infra.quiet_hours (infra-change.logic QUIET_HOURS_PATTERN).
    pattern: /^$|^([01]\d|2[0-3]):[0-5]\d-([01]\d|2[0-3]):[0-5]\d$/,
  };
  out['ai.assistant_mode'] = {
    ...out['ai.assistant_mode'],
    pattern: /^(off|on|auto)$/,
  };
  out['ai.monthly_max_usd'] = {
    ...out['ai.monthly_max_usd'],
    min: 0,
    max: 1000,
  };
  // Owner 2026-11-12 (row 55): only a known Claude model id.
  out['ai.assistant_model'] = {
    ...out['ai.assistant_model'],
    pattern: new RegExp(`^(${STAFF_AI_MODELS.join('|')})$`),
  };
  // Owner 2026-11-12: «Хранить N дней» (0 = keep forever).
  for (const k of ['ai.retention_records_days', 'ai.retention_images_days']) {
    out[k] = { ...out[k], min: 0, max: 36500 };
  }
  out['db.replica_provision'] = {
    ...out['db.replica_provision'],
    pattern: /^(off|auto)$/,
  };
  out['ha.provision_online_users'] = {
    ...out['ha.provision_online_users'],
    min: 0,
    max: 1_000_000,
  };
  out['ha.release_days'] = {
    ...out['ha.release_days'],
    min: 1,
    max: 30,
  };
  // Legal-grade protection of client documents (2026-10-24).
  out['security.attorney_strong_auth'] = {
    ...out['security.attorney_strong_auth'],
    description:
      'On (default): an attorney or assistant who has a passkey cannot sign in with the password alone (a stolen password is not enough). Accounts without a passkey are not affected. Off: password sign-in always works.',
  };
  out['files.confidential_url_ttl_sec'] = {
    ...out['files.confidential_url_ttl_sec'],
    description:
      'Seconds a link to a case file, chat document or support attachment stays valid (60–3600, default 900). The app asks for a new link on every open and access is re-checked each time.',
    min: 60,
    max: 3600,
  };
  out['files.access_log_enabled'] = {
    ...out['files.access_log_enabled'],
    description:
      'off | on | auto (default). Who other than the owner opened a confidential file: off = nothing recorded, on = every view, auto = the share set in files.access_log_sample_percent.',
    pattern: /^(off|on|auto)$/,
  };
  out['files.access_log_sample_percent'] = {
    ...out['files.access_log_sample_percent'],
    min: 0,
    max: 100,
  };
  out['moderation.image.enabled'] = {
    ...out['moderation.image.enabled'],
    description:
      'off | on | auto (default). Image moderation (paid): auto = on inside the daily cost-guard cap.',
    pattern: /^(off|on|auto)$/,
  };
  out['moderation.video.frames_enabled'] = {
    ...out['moderation.video.frames_enabled'],
    description:
      'Frame-by-frame video check (paid: every frame is one image_moderation unit inside the daily cap). Needs ffmpeg in the API image (build arg WITH_FFMPEG=1); without it only the cover is checked.',
  };
  out['moderation.video.frame_every_sec'] = {
    ...out['moderation.video.frame_every_sec'],
    description: 'One checked frame per this many seconds of the clip.',
    min: 1,
    max: 120,
  };
  out['moderation.video.frames_max'] = {
    ...out['moderation.video.frames_max'],
    description: 'At most this many frames checked per video.',
    min: 1,
    max: 12,
  };
  out['chat.link_preview_enabled'] = {
    ...out['chat.link_preview_enabled'],
    description:
      'off | on | auto (default). Link cards in chat; the per-person daily cap is chat.link_preview_per_user_per_day.',
    pattern: /^(off|on|auto)$/,
  };
  // Owner 2026-10-28: address suggestions while typing.
  out['addresses.autocomplete_enabled'] = {
    ...out['addresses.autocomplete_enabled'],
    description:
      'off | on | auto (default). Address suggestions while typing; auto = only once the provider (addresses.provider) has its keys / region in Integrations. Ceilings: addresses.monthly_cap, addresses.per_user_per_day.',
    pattern: /^(off|on|auto)$/,
  };
  out['addresses.provider'] = {
    ...out['addresses.provider'],
    description:
      'aws (Amazon Location, default, $0.20 per 1 000 calls) | google (Google Places API (New), $2.83 per 1 000 after 10 000 free a month).',
    pattern: /^(aws|google)$/,
  };
  out['addresses.monthly_cap'] = {
    ...out['addresses.monthly_cap'],
    description:
      'Provider calls a calendar month for everybody together (0 = none); above it the address fields stay plain text until the 1st.',
    min: 0,
    max: 100_000_000,
  };
  out['addresses.per_user_per_day'] = {
    ...out['addresses.per_user_per_day'],
    description: "One person's address suggestion calls a day.",
    min: 1,
    max: 10_000,
  };
  out['chat.link_preview_per_user_per_day'] = {
    ...out['chat.link_preview_per_user_per_day'],
    min: 1,
    max: 100000,
  };
  // Media batch A (R7): link-card pictures re-hosted by the server.
  out['chat.link_preview_images'] = {
    ...out['chat.link_preview_images'],
    description:
      'On (default): the link card picture is downloaded by the server once and shown from our storage as a WebP (the reader never contacts the site). Off: cards without pictures.',
  };
  out['chat.link_preview_image_max_kb'] = {
    ...out['chat.link_preview_image_max_kb'],
    description: 'Largest link-card picture the server downloads, KB.',
    min: 50,
    max: 51200,
  };
  out['chat.link_preview_image_timeout_ms'] = {
    ...out['chat.link_preview_image_timeout_ms'],
    description: 'Time for downloading one link-card picture, ms.',
    min: 500,
    max: 30000,
  };
  out['chat.link_preview_image_px'] = {
    ...out['chat.link_preview_image_px'],
    description:
      'Long side of the stored link-card picture, px (never enlarged).',
    min: 100,
    max: 2048,
  };
  out['security.seal_case_metadata'] = {
    ...out['security.seal_case_metadata'],
    description:
      'On (default): chat attachment file names and the case private details are stored encrypted; a background job seals the old rows. Off: new rows are written as before (already sealed ones stay sealed).',
  };
  out['security.seal_journal_text'] = {
    ...out['security.seal_journal_text'],
    description:
      'Off (default). On: free text in case-journal entries is encrypted. The journal cannot be rewritten, so every key id used while this is on must stay in MESSAGE_ENC_KEYS for 5 years.',
  };
  out['push.chat_preview'] = {
    ...out['push.chat_preview'],
    description:
      "On (default, today's behaviour): a chat push shows the message text. Off: it shows only «New message» and Google/Apple never see the text. Recommended: off for attorney accounts.",
  };
  out['verification.bar_document_for_manual_states'] = {
    ...out['verification.bar_document_for_manual_states'],
    description:
      'On: a license in a state without an automatic registry (or with an unusual number shape) needs a photo of the bar card; a person approves it. Off: only when «require_bar_document» is on.',
  };
  // Owner 2026-11-12 (row 52): «Сравнение лица (Amazon)».
  out['verification.face_match.enabled'] = {
    ...out['verification.face_match.enabled'],
    description:
      'off (default) | on | auto. Amazon Rekognition CompareFaces of the selfie with the ID photo for a new request whose attorney gave the biometric consent; on and auto run inside the daily id_check cap. off = no call, a person compares. The result never approves or rejects by itself.',
    pattern: /^(off|on|auto)$/,
  };
  out['verification.face_match.similarity_threshold'] = {
    ...out['verification.face_match.similarity_threshold'],
    description:
      'Rekognition SimilarityThreshold, % (default 90): at or above = the faces match.',
    min: 50,
    max: 100,
  };
  out['verification.face_match.retention_days'] = {
    ...out['verification.face_match.retention_days'],
    description:
      'Days the face comparison result is kept after the request is decided, then deleted (default 30).',
    min: 1,
    max: 1095,
  };
  // Owner 2026-11-13 (row 52): pictures of unfinished requests.
  out['verification.media.abandoned_days'] = {
    ...out['verification.media.abandoned_days'],
    description:
      'Days without activity after which an unfinished request (draft / waiting for the attorney) loses its selfie and ID pictures (default 15; 0 = never). Decided requests lose them at once.',
    min: 0,
    max: 90,
  };
  // Owner 2026-11-12 (row 60): «Автоматическое решение по адвокатам».
  out['verification.auto_decision.enabled'] = {
    ...out['verification.auto_decision.enabled'],
    description:
      'Owner only, a fresh 2FA code to change. Off (default): every attorney request waits for a person. On: all checks matched (state registry number + full name + active, face match at or above the threshold, liveness, the AI employee confident) = approved; only the registry record itself saying the licence is disbarred, suspended or revoked = rejected with an appeal; anything uncertain (number not found, registry error or timeout, not active, faces apart) and anything else goes to the human queue with the reason. Never for an owner or staff account, never without the biometric consent.',
  };
  out['verification.auto_decision.face_reject_below'] = {
    ...out['verification.auto_decision.face_reject_below'],
    description:
      'Face similarity, % (default 50), under which the faces are marked «far apart» for the reviewer. Never an automatic rejection: below the face match threshold a person always decides.',
    min: 0,
    max: 89,
  };
  out['verification.auto_decision.audit_pct'] = {
    ...out['verification.auto_decision.audit_pct'],
    description:
      '% of the automatic decisions (default 10) that still go to the owner first, until his agreement with them is proven.',
    min: 0,
    max: 100,
  };
  out['verification.auto_decision.audit_pct_min'] = {
    ...out['verification.auto_decision.audit_pct_min'],
    description:
      'The floor the audit sample drops to by itself once the owner agreed with the automatic decisions (default 2; 2-5 recommended).',
    min: 0,
    max: 100,
  };
  out['verification.auto_decision.persona_document_enabled'] = {
    ...out['verification.auto_decision.persona_document_enabled'],
    description:
      'Off (default). On: an automatic approval also needs a passing Persona document check of the request (Persona key in «Ключи и сервисы»); without it the request waits for a person.',
  };
  out['verification.auto_decision.ai_request_info_enabled'] = {
    ...out['verification.auto_decision.ai_request_info_enabled'],
    description:
      'Off (default). On: a blurry photo, a missing side of the ID or the AI employee confidently asking for more makes the system ask the attorney to upload again (the «Запросить информацию» message) instead of waiting for a person.',
  };
  out['billing.cancel_on_verification_loss'] = {
    ...out['billing.cancel_on_verification_loss'],
    description:
      'An attorney who loses verification (rejected / suspended): the subscription ends now and the unused part of the period, offer packs and Boost is refunded. Off: nothing is canceled automatically.',
  };
  out['billing.duplicate_subscription_autofix'] = {
    ...out['billing.duplicate_subscription_autofix'],
    description:
      'On (default): when one attorney ends up with two live subscriptions (a second device, a re-subscription after grace), the system keeps the newest paid one, cancels the other at once and refunds only the unused part of its last invoice — never on a disputed charge, an account under fraud review, a third duplicate in 90 days or above the daily cap (those wait for a person). Off: the newcomer is cancelled without a refund (old behaviour); the owner gets an alert either way.',
  };
  out['billing.dispute_auto_cancel'] = {
    ...out['billing.dispute_auto_cancel'],
    description:
      'On (default): when a bank disputes (chargeback) a subscription charge, the subscription is cancelled at Stripe at once so nothing more is charged, the admins get an e-mail and the audit log gets a row. No extra refund is made (the dispute already reverses the charge). Off: the dispute only appears in «Проверки Stripe».',
  };
  out['billing.duplicate_autorefund_daily_cap_cents'] = {
    ...out['billing.duplicate_autorefund_daily_cap_cents'],
    description:
      'The most the duplicate-subscription auto-fix may refund in one UTC day, all attorneys together (cents; default 50000 = $500). A refund above it is not sent: it waits in «Проверки Stripe» for a person.',
  };
  out['billing.dispute_refund_max_cents'] = {
    ...out['billing.dispute_refund_max_cents'],
    description:
      'The largest refund of a bank inquiry on a subscription charge the system makes by itself, in cents. Above it the refund waits for a person.',
  };
  out['billing.dispute_refund_user_limit'] = {
    ...out['billing.dispute_refund_user_limit'],
    description:
      'How many automatic dispute refunds one user may get within the window. The next one waits for a person.',
  };
  out['billing.dispute_refund_window_days'] = {
    ...out['billing.dispute_refund_window_days'],
    description: 'The window of the per-user limit, in days.',
  };
  out['billing.dispute_refund_daily_cap_cents'] = {
    ...out['billing.dispute_refund_daily_cap_cents'],
    description:
      'The most all automatic dispute refunds may return in one UTC day, in cents. Above it a refund waits for a person.',
  };
  out['billing.require_verified_for_purchases'] = {
    ...out['billing.require_verified_for_purchases'],
    description:
      'Only a verified attorney can buy offer packs and Boost. Off: anyone can (rollback).',
  };
  out['billing.stripe_tax_enabled'] = {
    ...out['billing.stripe_tax_enabled'],
    description:
      'Stripe Tax: sales tax / VAT is computed and added by Stripe on subscriptions, seat purchases and one-time payments (the buyer sees it before paying; receipts show it). Turn on only after enabling Stripe Tax in the Stripe Dashboard and setting the origin address and registrations (docs/runbooks/STRIPE_TAX.md). Off: prices are charged as listed, no tax line.',
  };
  out['payments.own_page_enabled'] = {
    ...out['payments.own_page_enabled'],
    description:
      "On (needs the Stripe publishable key): the subscription is paid on our own card page. Off: Stripe's hosted page (card only).",
  };
  out['payments.own_page_ttl_minutes'] = {
    ...out['payments.own_page_ttl_minutes'],
    description: 'How long a link to the card page works, minutes.',
    min: 5,
    max: 240,
  };
  // Owner 2026-10-16: fewer SMS.
  out['sms.resend_cooldown_seconds'] = {
    ...out['sms.resend_cooldown_seconds'],
    description:
      'Seconds before the same number may ask for another registration code.',
    min: 10,
    max: 3600,
  };
  out['sms.registration_per_number_per_day'] = {
    ...out['sms.registration_per_number_per_day'],
    description: 'Registration codes one number may request in 24 hours.',
    min: 1,
    max: 50,
  };
  out['sms.reset_per_number_per_hour'] = {
    ...out['sms.reset_per_number_per_hour'],
    description: 'Password-reset codes one number may request per hour.',
    min: 1,
    max: 20,
  };
  out['sms.reset_per_number_per_day'] = {
    ...out['sms.reset_per_number_per_day'],
    description: 'Password-reset codes one number may request in 24 hours.',
    min: 1,
    max: 50,
  };
  // 2026-10-24 (abuse batch B, item 10): SMS pumping.
  out['sms.prefix_velocity_max'] = {
    ...out['sms.prefix_velocity_max'],
    description:
      'Most SMS codes in the window to numbers with the same first 6 digits; above it the prefix is blocked for «sms.prefix_block_minutes», nothing is sent and an alert is logged (SMS-pumping brake). 0 = off.',
    min: 0,
    max: 1000,
  };
  out['sms.country_velocity_max'] = {
    ...out['sms.country_velocity_max'],
    description:
      'Most SMS codes in the window to one country (dial code); above it the country is blocked for «sms.prefix_block_minutes». 0 = off.',
    min: 0,
    max: 100_000,
  };
  out['sms.prefix_velocity_window_minutes'] = {
    ...out['sms.prefix_velocity_window_minutes'],
    description: 'Window of the two SMS velocity rules, minutes.',
    min: 1,
    max: 1440,
  };
  out['sms.prefix_block_minutes'] = {
    ...out['sms.prefix_block_minutes'],
    description: 'How long a tripped prefix / country stays blocked, minutes.',
    min: 1,
    max: 10_080,
  };
  out['sms.signup_daily_cap'] = {
    ...out['sms.signup_daily_cap'],
    description:
      'Hard cap of SMS sign-up codes (to new numbers) per UTC day. When reached, SMS sign-up is closed until 00:00 UTC and an alert is logged; password reset and e-mail codes keep working. Not touched by the auto spend limits. 0 = off.',
    min: 0,
    max: 1_000_000,
  };
  out['sms.cap_mode'] = {
    type: 'string',
    defaultValue: 'auto',
    description:
      'How the SMS caps above behave. auto (default): each cap is a floor and grows to the highest day of the last 7 days times «sms.burst_multiplier» (up to «sms.burst_ceiling_multiplier» times the cap), with an alert when the extra room is used, so a launch or marketing spike is not silently dropped. fixed: exactly the numbers typed.',
    pattern: /^(auto|fixed)$/,
  };
  out['sms.burst_multiplier'] = {
    type: 'number',
    defaultValue: 3,
    description:
      'Auto mode: the allowed number is the 7-day baseline times this (never below the typed cap).',
    min: 1,
    max: 20,
  };
  out['sms.burst_ceiling_multiplier'] = {
    type: 'number',
    defaultValue: 10,
    description:
      'Auto mode: the allowed number never exceeds the typed cap times this.',
    min: 1,
    max: 100,
  };
  out['storage.daily_upload_mb_per_user'] = {
    ...out['storage.daily_upload_mb_per_user'],
    description:
      'Most MB one person may upload per UTC day (avatars, documents and exports do not count). Stops an upload-and-delete loop. 0 = no cap.',
    min: 0,
    max: 1_000_000,
  };
  // Owner 2026-10-05: zero-maintenance operations (Система → Здоровье системы).
  out['db.bloat_mode'] = {
    ...out['db.bloat_mode'],
    description:
      'Nightly table/index bloat check: off | on (heap estimate for every big table) | auto (default: only where statistics show 10 %+ dead rows). Indexes are estimated from statistics, never read.',
    pattern: /^(off|on|auto)$/,
  };
  out['db.bloat_scan_max_mb'] = {
    ...out['db.bloat_scan_max_mb'],
    description:
      'Bloat check: biggest table (MB) the heap estimate may read; bigger tables use statistics only.',
    min: 0,
    max: 100000,
  };
  out['privacy.retention_batch'] = {
    ...out['privacy.retention_batch'],
    description: 'Privacy retention: rows per statement (short transactions).',
    min: 100,
    max: 50000,
  };
  out['privacy.retention_max_rows'] = {
    ...out['privacy.retention_max_rows'],
    description:
      'Privacy retention: rows per table per night; the next night continues.',
    min: 1000,
    max: 100000000,
  };
  out['ops.db_slow_ms'] = {
    ...out['ops.db_slow_ms'],
    description:
      'Database answer time (ms) above which heavy background jobs pause on their own for 15 minutes.',
    min: 100,
    max: 60_000,
  };
  out['today.sentry_enabled'] = {
    type: 'boolean',
    defaultValue: false,
    description:
      'Сегодня: строка «Ошибки в приложении» из Sentry (нужны ключи sentry в «Ключи и сервисы»; не чаще одного запроса в 5 минут).',
  };
  out['scale.db_split_enabled'] = {
    type: 'boolean',
    defaultValue: false,
    description:
      'Масштаб: карточка «Разделить базу» с пошаговой проверкой готовности второй базы (только чтение; сам перенос запускается на «Здоровье системы» с кодом 2FA).',
  };
  out['ops.backup_max_age_hours'] = {
    ...out['ops.backup_max_age_hours'],
    description:
      'Alert when the newest database backup is older than this many hours.',
    min: 2,
    max: 24 * 14,
  };
  // Round 20 (2026-10-25): hidden-cost switches, off | on | auto.
  const triState = (key: string, description: string) => {
    out[key] = {
      ...out[key],
      description,
      pattern: /^(off|on|auto)$/,
    };
  };
  triState(
    'ops.admin_summaries_mode',
    'Heavy admin counts (dashboard, billing, trust scan): auto = every 2 minutes only while an admin was active in the last 10 minutes, otherwise hourly; on = always every 2 minutes; off = every 6 hours.',
  );
  triState(
    'ops.cron_idle_backoff',
    'Every-minute background sweeps (government exports, search outbox, video and consultation sweeps) with nothing to do: auto = after N empty runs run every few minutes until work appears; on = always the slow pace; off = every minute, as before.',
  );
  out['ops.cron_idle_after_runs'] = {
    ...out['ops.cron_idle_after_runs'],
    description:
      'Empty runs in a row before an every-minute sweep slows down (auto mode).',
    min: 3,
    max: 1000,
  };
  out['ops.cron_idle_every_min'] = {
    ...out['ops.cron_idle_every_min'],
    description:
      'Minutes between runs of an idle sweep. Ceiling 30: nothing waits longer than that.',
    min: 2,
    max: 30,
  };
  out['ops.reencrypt_rows_per_min'] = {
    ...out['ops.reencrypt_rows_per_min'],
    description:
      'Ceiling of the message re-encryption pass, rows per minute (0 = paused, the pass keeps its place). Lower it if the database is busy.',
    min: 0,
    max: 20_000,
  };
  triState(
    'log.ws_events',
    'WebSocket connect / disconnect log lines: auto = a weighted sample, every line for 30 minutes while reconnects spike; on = every line; off = the sample only (the counters on the status board are always complete).',
  );
  out['log.ws_sample_percent'] = {
    ...out['log.ws_sample_percent'],
    description:
      'Percent of WebSocket connect / disconnect events written as log lines (each line counts for 100/percent events).',
    min: 1,
    max: 100,
  };
  out['search.ranked_cache_ttl_sec'] = {
    ...out['search.ranked_cache_ttl_sec'],
    description:
      'Seconds a search result list is shared by everyone asking the same query (30-60 is right).',
    min: 10,
    max: 900,
  };
  out['usage.cloudflare_egress_warn_gb'] = {
    ...out['usage.cloudflare_egress_warn_gb'],
    description:
      'Warn when Cloudflare calls traffic this month (GB) reaches this; 0 = off. Free until 1000.',
    min: 0,
    max: 10000,
  };
  out['usage.cloudflare_egress_crit_gb'] = {
    ...out['usage.cloudflare_egress_crit_gb'],
    description:
      'Urgent alert when Cloudflare calls traffic this month (GB) reaches this; 0 = off.',
    min: 0,
    max: 10000,
  };
  out['usage.bunny_bandwidth_warn_gb'] = {
    ...out['usage.bunny_bandwidth_warn_gb'],
    description:
      'Warn when Bunny video traffic this month (GB) reaches this; 0 = off.',
    min: 0,
    max: 1000000,
  };
  // Owner 2026-10-26: infra switches from the admin.
  out['infra.dry_run'] = {
    type: 'boolean',
    defaultValue: true,
    description:
      'Cloud changes from the admin are only planned, never applied (the plan is shown, nothing changes). false = after the plan and your 2FA code the change is applied.',
  };
  out['infra.daily_cap'] = {
    type: 'integer',
    defaultValue: 0,
    description:
      'At most this many cloud change requests per 24 hours; 0 = no limit.',
    min: 0,
    // Owner 2026-11-12: no ceiling («потолок до бесконечности»); the owner
    // picks the value (50 while testing, then 10).
    max: 1_000_000,
  };
  out['infra.quiet_hours'] = {
    type: 'string',
    defaultValue: '',
    description:
      'Hours (America/Chicago) when a cloud change may be applied, "HH:MM-HH:MM", e.g. 01:00-06:00; empty = any time.',
    pattern: /^$|^([01]\d|2[0-3]):[0-5]\d-([01]\d|2[0-3]):[0-5]\d$/,
  };
  // Automation audit 2026-11-08: «Авто» of the cloud items really acts.
  out['infra.auto_mode'] = {
    type: 'string',
    defaultValue: 'auto',
    description:
      'auto = cloud items switch on by themselves when their signal holds and off when it is gone (plan + apply + message to the on-call admins); off = proposals only.',
    pattern: /^(off|auto)$/,
  };
  out['infra.auto_on_minutes'] = {
    type: 'integer',
    defaultValue: 30,
    description: 'Minutes a signal must hold before an item is switched on.',
    min: 10,
    max: 1440,
  };
  out['infra.auto_off_hours'] = {
    type: 'integer',
    defaultValue: 72,
    description:
      'Hours without the signal before an item the automation switched on is switched off again.',
    min: 6,
    max: 720,
  };
  out['infra.auto_max_usd_month'] = {
    type: 'integer',
    defaultValue: 100,
    description:
      'An automatic switch-on that may cost more than this a month is not made (stays a proposal).',
    min: 0,
    max: 5000,
  };
  // Owner 2026-10-27: admin «Продвижение» (static SEO pages + channel list).
  // Switched on the «Продвижение» page; the generator reads them from GET
  // /public/seo-settings (no stored row = the repository variable decides).
  const seoText: Record<string, string> = {
    'seo.incremental_enabled':
      'Public SEO pages: upload only the files that changed and reset the CDN only for them (at most 30 paths a day). Changed on the «Продвижение» page.',
    'seo.llms_enabled':
      'Public SEO pages: publish /llms.txt and /llms-full.txt. Changed on the «Продвижение» page.',
    'seo.pages_cities_enabled':
      'Public SEO pages: city and city x practice pages for clients. Changed on the «Продвижение» page.',
    'seo.pages_posts_enabled':
      'Public SEO pages: pages of the text posts of listed attorneys. Changed on the «Продвижение» page.',
    'seo.pages_qa_enabled':
      'Public SEO pages: legal question pages (reviewed answers only). Changed on the «Продвижение» page.',
    'seo.quality_gate_enabled':
      'Public SEO pages: thin pages get noindex and leave the sitemap. Turn on only after the page texts are longer (dry run first). Changed on the «Продвижение» page.',
    'seo.ramp_per_day':
      'Public SEO pages: at most this many NEW pages enter the index a day; 0 = no limit. Changed on the «Продвижение» page.',
    'seo.robots_ai_enabled':
      'Public SEO pages: robots.txt lets search and answer bots in and keeps training bots out. Changed on the «Продвижение» page.',
    'seo.sitemap_index_enabled':
      'Public SEO pages: /sitemap.xml becomes an index of /sitemaps/*.xml. Changed on the «Продвижение» page.',
  };
  // Deal record 2026-10-27: switched on the «Запись о сделке» page.
  const dealRecordText: Record<string, string> = {
    'deal_record.enabled':
      'Deal record: accepting a bid opens the "Deal record" (not a contract) that both parties sign in the app; the bid is accepted only after both signatures. Off = accept as before. Changed on the «Запись о сделке» page.',
    'bids.rich_terms_enabled':
      'Bids: attorneys may add detailed payment terms (hourly, retainer + installments, contingency, to be clarified, mixed). Off = the classic fee types only. Changed on the «Запись о сделке» page.',
    'bids.confirmation_required':
      'Bids: after the client changes the description, budget or urgency of an open case, active bids wait for the attorney (keep, change or withdraw) and cannot be accepted until then. Switch on only once attorneys have an app version with the «Changes» section. Off = as before.',
    'bids.confirmation_reminder_days':
      'Bids: days until the one reminder to an attorney whose bid waits for confirmation. There is no automatic withdrawal.',
  };
  for (const [k, description] of Object.entries(dealRecordText)) {
    out[k] = { ...out[k], description };
  }
  for (const [k, description] of Object.entries(seoText)) {
    out[k] = { ...out[k], description };
  }
  out['seo.ramp_per_day'] = {
    ...out['seo.ramp_per_day'],
    min: 0,
    max: 5000,
  };
  for (const k of Object.keys(out)) {
    if (k.startsWith('seo.checklist.')) {
      out[k] = {
        ...out[k],
        description:
          'Promotion checklist: the owner ticked this channel as done. Changed on the «Продвижение» page.',
      };
    }
  }
  out['scale.capacity_ceiling.mode'] = {
    type: 'string',
    defaultValue: 'off',
    description:
      'Biggest database / Redis size the autoscalers may use: auto = what the allowed monthly spend pays for (Экономика), off = only the Terraform ceiling. Changed on the «Расходы» page.',
    pattern: /^(off|auto)$/,
  };
  out['scale.bunny_hardstop.mode'] = {
    type: 'string',
    defaultValue: 'off',
    description:
      'New video uploads (Bunny): auto = pause when this month’s Bunny traffic or storage reaches the urgent threshold, on = paused now, off = never paused. Playback of existing videos is never touched. Changed on the «Расходы» page.',
    pattern: /^(off|on|auto)$/,
  };
  out['scale.cloudflare_hardstop.mode'] = {
    type: 'string',
    defaultValue: 'off',
    description:
      'Group video calls on Cloudflare SFU: auto = fall back to device-to-device when this month’s Cloudflare traffic reaches the urgent threshold, on = fallen back now, off = never. Calls are never refused. Changed on the «Расходы» page.',
    pattern: /^(off|on|auto)$/,
  };
  out['ops.outbox_sweep.mode'] = {
    type: 'string',
    defaultValue: 'auto',
    description:
      'Relay of events that cross database families (idle while there is one database): auto = run only when an event is waiting, on = every minute, off = never. Changed on the «Расходы» page.',
    pattern: /^(off|on|auto)$/,
  };
  out['usage.bunny_bandwidth_crit_gb'] = {
    ...out['usage.bunny_bandwidth_crit_gb'],
    description:
      'Urgent alert when Bunny video traffic this month (GB) reaches this; 0 = off.',
    min: 0,
    max: 1000000,
  };
  out['usage.bunny_storage_warn_gb'] = {
    ...out['usage.bunny_storage_warn_gb'],
    description: 'Warn when Bunny stored video (GB) reaches this; 0 = off.',
    min: 0,
    max: 1000000,
  };
  out['usage.bunny_storage_crit_gb'] = {
    ...out['usage.bunny_storage_crit_gb'],
    description:
      'Urgent alert when Bunny stored video (GB) reaches this; 0 = off.',
    min: 0,
    max: 1000000,
  };
  out['economy.max_spend_percent'] = {
    ...out['economy.max_spend_percent'],
    description:
      'Third-party services may cost at most this percent of the last 30 days’ revenue (admin: Экономика).',
    min: 1,
    max: 100,
  };
  out['ranking.events_mode'] = {
    ...out['ranking.events_mode'],
    description:
      'Ranking events log: off, on, or auto (impressions only while an experiment runs).',
    pattern: /^(off|on|auto)$/,
  };
  out['ranking.impression_sample_percent'] = {
    ...out['ranking.impression_sample_percent'],
    min: 0,
    max: 100,
  };
  // Owner rule (Выкл / Вкл / Авто): new-case alerts in waves.
  out['case_fanout.enabled'] = {
    ...out['case_fanout.enabled'],
    description:
      'off | on | auto (default). New-case alerts: off = one push to everyone matching at once (as before); on = waves and the smart order; auto = waves while the case-fanout queue is reachable and has at most case_fanout.auto_max_waiting jobs waiting, else one wave at once.',
    pattern: /^(off|on|auto)$/,
  };
  out['case_fanout.auto_max_waiting'] = {
    ...out['case_fanout.auto_max_waiting'],
    description:
      'Авто of case_fanout.enabled: more waiting wave jobs than this = the queue is behind, the case goes out in one wave right away.',
    min: 0,
    max: 100000,
  };
  // Programmatic SEO (2026-10-27): the page generator job.
  // Owner 2026-11-07 («SEO all ON»): nightly+events by default.
  out['seo.generator_mode'] = {
    ...out['seo.generator_mode'],
    description:
      'Public SEO pages built by the API: off (nothing runs) | nightly (after the nightly snapshot jobs) | nightly+events (default; also a minute after an attorney is published or removed).',
    pattern: /^(off|nightly|nightly\+events)$/,
  };
  out['seo.generator_debounce_seconds'] = {
    ...out['seo.generator_debounce_seconds'],
    min: 10,
    max: 3600,
  };
  out['seo.generator_min_interval_minutes'] = {
    ...out['seo.generator_min_interval_minutes'],
    min: 1,
    max: 1440,
  };
  out['seo.generator_max_attorneys'] = {
    ...out['seo.generator_max_attorneys'],
    min: 100,
    max: 50000,
  };
  out['seo.generator_max_uploads_per_run'] = {
    ...out['seo.generator_max_uploads_per_run'],
    min: 10,
    max: 50000,
  };
  out['seo.max_invalidation_paths_per_day'] = {
    ...out['seo.max_invalidation_paths_per_day'],
    min: 0,
    max: 500,
  };
  out['chat.search.backfill_mode'] = {
    ...out['chat.search.backfill_mode'],
    description:
      'Chat search index of old messages: off | on (every 5 minutes) | auto (default: at night until done, then idle).',
    pattern: /^(off|on|auto)$/,
  };
  out['chat.search.backfill_rows_per_run'] = {
    ...out['chat.search.backfill_rows_per_run'],
    min: 100,
    max: 100000,
  };
  out['chat.search.max_tokens_per_message'] = {
    ...out['chat.search.max_tokens_per_message'],
    description:
      'Chat search: index rows written per message (distinct words of 2+ characters, stop-words skipped; prefixes count too).',
    min: 8,
    max: 400,
  };
  out['chat.search.backfill_batch'] = {
    ...out['chat.search.backfill_batch'],
    description:
      'Chat search backfill: messages per batch (one short transaction each).',
    min: 50,
    max: 5000,
  };
  out['economy.ceiling_mode'] = {
    ...out['economy.ceiling_mode'],
    description:
      'Autoscaling ceiling: auto (follows the economy rule) or manual.',
    pattern: /^(auto|manual)$/,
  };
  // Queues hardening 2026-10-25: three-state switches (off | on | auto).
  for (const key of ['queues.scale_signal_mode', 'queues.push_rate_mode']) {
    out[key] = {
      ...out[key],
      description: 'off, on or auto (default auto).',
      pattern: /^(off|on|auto)$/,
    };
  }
  out['queues.push_rate_per_sec'] = {
    ...out['queues.push_rate_per_sec'],
    description:
      'Push sends per second for the whole system (FCM project quota is 10 000/s).',
    min: 50,
    max: 10_000,
  };
  out['economy.aws_cap_usd'] = {
    ...out['economy.aws_cap_usd'],
    min: 0,
    max: 1_000_000,
  };
  for (const key of ['economy.manual_api_max', 'economy.manual_worker_max']) {
    out[key] = { ...out[key], min: 1, max: 1000 };
  }
  out['trust.payout_delay_days'] = {
    ...out['trust.payout_delay_days'],
    description:
      'Stripe payout delay (days) for attorneys not yet cleared; 0 = Stripe default (2).',
    min: 0,
    max: 30,
  };
  out['trust.complaints_to_suspend'] = {
    ...out['trust.complaints_to_suspend'],
    min: 1,
    max: 20,
  };
  out['trust.complaint_window_days'] = {
    ...out['trust.complaint_window_days'],
    min: 1,
    max: 3650,
  };
  out['billing.trial_days'] = {
    ...out['billing.trial_days'],
    description:
      'Free trial for new attorney subscriptions, days (0 = no trial). Running trials keep their end date.',
    min: 0,
    max: TRIAL_DAYS_MAX,
  };
  out['admin.ip_allowlist_enabled'] = {
    ...out['admin.ip_allowlist_enabled'],
    description:
      'Only the addresses in admin.ip_allowlist may use the admin panel. Needs a fresh 2FA code; refused if your own address is not on the list. Emergency bypass: docs/runbooks/ADMIN_HARDENING.md.',
  };
  out['admin.ip_allowlist'] = {
    ...out['admin.ip_allowlist'],
    description:
      'Addresses allowed into the admin panel when the allowlist is on: IPv4/IPv6 or IPv4 CIDR (203.0.113.0/24). Needs a fresh 2FA code.',
    pattern: IP_OR_CIDR_PATTERN,
  };
  out['admin.country_allowlist'] = {
    ...out['admin.country_allowlist'],
    description:
      'Countries (two letters: US, GB, KG…) from which mass-work and finance staff may work. Works only with the switch «Блокировать вход с нового устройства или страны». Empty = no check. Needs a fresh 2FA code.',
    pattern: /^[A-Z]{2}$/,
  };
  out['admin.login_alert_enabled'] = {
    ...out['admin.login_alert_enabled'],
    description:
      'E-mail the owner when an admin signs in from a new device or a new address.',
  };
  out['admin.max_concurrent_sessions'] = {
    ...out['admin.max_concurrent_sessions'],
    description:
      'Live sessions per admin; a new sign-in ends the oldest one (0 = no limit). Needs a fresh 2FA code.',
    min: 0,
    max: 20,
  };
  out['admin.private_stepup_seconds'] = {
    ...out['admin.private_stepup_seconds'],
    description:
      'Revealing a private message needs a 2FA code entered within this many seconds (30–300).',
    min: 30,
    max: 300,
  };
  out['admin.audit_export_enabled'] = {
    ...out['admin.audit_export_enabled'],
    description:
      'Daily copy of the audit log to the locked audit bucket (works only when the bucket is set up in Terraform).',
  };
  out['admin.access_report_enabled'] = {
    ...out['admin.access_report_enabled'],
    description:
      'Monthly e-mail to the owner: who read private content, how many times and why.',
  };
  out['admin.reason_required_areas'] = {
    ...out['admin.reason_required_areas'],
    description:
      'Sections where admins (not the super admin) must write a reason for an action.',
    pattern: REASON_AREA_PATTERN,
  };
  out['feed.default_content_mode'] = {
    ...out['feed.default_content_mode'],
    description:
      'Feed content for people who never chose: all = every post, legal_only = only legal posts (general posts hidden).',
    pattern: /^(all|legal_only)$/,
  };
  out['translate.scope'] = {
    ...out['translate.scope'],
    description:
      'Where the translator works: all = every zone, zones = only the switched-on translate.<zone> keys.',
    pattern: /^(all|zones)$/,
  };
  // Owner 2026-10-05: support 24/7 and «Лучший сотрудник».
  out['support.open_days'] = {
    ...out['support.open_days'],
    description: 'Support working days, 1 = Monday … 7 = Sunday.',
    min: 1,
    max: 7,
  };
  out['support.open_from_hour'] = {
    ...out['support.open_from_hour'],
    min: 0,
    max: 23,
  };
  out['support.open_to_hour'] = {
    ...out['support.open_to_hour'],
    min: 1,
    max: 24,
  };
  out['support.timezone'] = {
    ...out['support.timezone'],
    description: 'IANA time zone of the support hours, e.g. America/Chicago.',
    pattern: /^[A-Za-z_]+(\/[A-Za-z0-9_+-]+){0,2}$/,
  };
  out['rewards.period'] = {
    ...out['rewards.period'],
    description: '«Лучший сотрудник» period: month or week.',
    pattern: /^(month|week)$/,
  };
  // Owner 2026-10-26: hash partitioning of messages / group messages /
  // notifications is opt-in (off | on | auto at partition.auto_rows).
  for (const t of ['messages', 'chat_group_messages', 'notifications']) {
    out[`partition.${t}_mode`] = {
      ...out[`partition.${t}_mode`],
      description: `Hash partitioning of ${t}: auto = converts by itself at partition.auto_rows (default; nothing happens while small), on = the online runner converts now, off = never.`,
      pattern: /^(off|on|auto)$/,
    };
  }
  out['growth.shard_db_gb'] = {
    ...out['growth.shard_db_gb'],
    description:
      'Primary database size (GB) at which the health card says it is time to prepare a second database (yellow from 80%, red at 100%). A signal only: nothing is moved by itself.',
    min: 10,
    max: 100_000,
  };
  out['growth.shard_rows'] = {
    ...out['growth.shard_rows'],
    description:
      'Estimated rows of the sharded-family tables at which the health card says it is time to prepare a second database (yellow from 80%, red at 100%). A signal only.',
    min: 1_000_000,
    max: 100_000_000_000,
  };
  out['partition.post_view_events_mode'] = {
    ...out['partition.post_view_events_mode'],
    description:
      'Monthly partitioning of post_view_events: auto = converts by itself at partition.auto_rows (default), on = the online runner converts now, off = never.',
    pattern: /^(off|on|auto)$/,
  };
  out['infra.search_engine_on_people'] = {
    ...out['infra.search_engine_on_people'],
    description:
      'People at which the cloud automation switches the search engine (OpenSearch) on; it goes off again below 80 % of it (default 5 million).',
    min: 1,
    max: 1_000_000_000,
  };
  out['infra.waf_attack_blocked_per_5m'] = {
    ...out['infra.waf_attack_blocked_per_5m'],
    description:
      'Requests the load-balancer WAF blocked in 5 minutes that count as an attack: WAF Bot Control and the extra WAF rules on «Авто» switch on in block mode; they go off again after infra.waf_calm_off_hours below half of it (default 1000).',
    min: 1,
    max: 100_000_000,
  };
  out['infra.waf_attack_auth_failed_per_5m'] = {
    ...out['infra.waf_attack_auth_failed_per_5m'],
    description:
      'Failed sign-ins in 5 minutes that count as an attack (same switch-on as the WAF line; off again after infra.waf_calm_off_hours below half of it) (default 50).',
    min: 1,
    max: 10_000_000,
  };
  out['infra.waf_attack_on_minutes'] = {
    ...out['infra.waf_attack_on_minutes'],
    description:
      'Minutes the WAF attack signal must hold before WAF Bot Control and the extra WAF rules on «Авто» switch on in block mode (default 5; the automation looks every 10 minutes).',
    min: 1,
    max: 1440,
  };
  out['infra.waf_calm_off_hours'] = {
    ...out['infra.waf_calm_off_hours'],
    description:
      'Hours of calm (below half of both attack lines) before the WAF protections the automation switched on go off again (default 3).',
    min: 1,
    max: 720,
  };
  out['economy.db_cpu_limit_percent'] = {
    ...out['economy.db_cpu_limit_percent'],
    description:
      'Database CPU % above which it counts as busy: alert, read copy and size step by themselves (default 70).',
    min: 1,
    max: 100,
  };
  out['partition.auto_rows'] = {
    ...out['partition.auto_rows'],
    description:
      'Rows at which the «auto» partition mode converts a table (default 50 million).',
    min: 1_000_000,
    max: 5_000_000_000,
  };
  out['sms.allowed_country_codes'] = {
    type: 'string[]',
    defaultValue: ['US'],
    description: 'ISO-3166 alpha-2 countries SMS codes may be sent to.',
    pattern: /^[A-Z]{2}$/,
  };
  // Scale audit 2026-10-23: bounds and English descriptions for the knobs of
  // the phone's own traffic (client.*) and the chat photo size.
  for (const [key, def] of Object.entries(CLIENT_TUNING_DEFS) as [
    string,
    ClientTuningDef,
  ][]) {
    out[key] = {
      ...out[key],
      description: def.description,
      ...(def.min !== undefined ? { min: def.min } : {}),
      ...(def.max !== undefined ? { max: def.max } : {}),
      ...(def.pattern ? { pattern: def.pattern } : {}),
    };
  }
  out['media.chat_photo_max_px'] = {
    ...out['media.chat_photo_max_px'],
    description:
      'Longest side (px) of a photo sent in a chat, shrunk on the phone before upload.',
    min: 640,
    max: 4096,
  };
  out['media.chat_photo_quality'] = {
    ...out['media.chat_photo_quality'],
    description: 'JPEG quality (50–100) of a photo sent in a chat.',
    min: 50,
    max: 100,
  };
  for (const platform of ['ios', 'android']) {
    // The "Update" button of the forced / soft update screen. Needed for
    // iOS before the first release: the App Store id exists only after the
    // app is registered, and the app cannot learn it any other way.
    out[`store_url_${platform}`] = {
      type: 'string',
      defaultValue: null,
      description: `Store page of the ${platform} app (https link) opened by the "Update" button of the update screen.`,
      pattern: /^https:\/\/[^\s]+$/,
    };
    out[`min_app_version_${platform}`] = {
      type: 'string',
      defaultValue: null,
      description: `Minimum ${platform} app version (semver); older builds get 426 APP_UPDATE_REQUIRED.`,
      pattern: /^\d+\.\d+\.\d+$/,
    };
    // Audit 2026-10-02: the app reads the soft-update version too.
    out[`soft_update_version_${platform}`] = {
      type: 'string',
      defaultValue: null,
      description: `Suggested ${platform} app version (semver); older builds see a dismissible "update available".`,
      pattern: /^\d+\.\d+\.\d+$/,
    };
  }
  // Owner 2026-10-28 (legal safety): enumerated modes and sane ranges.
  out['qa.pii_mode'] = {
    ...out['qa.pii_mode'],
    pattern: /^(off|warn|redact|block)$/,
  };
  out['qa.pii_kinds'] = {
    ...out['qa.pii_kinds'],
    pattern:
      /^(?:(?:ssn|card|address|case_number|party_name|immigration_id|dob|id_number|phone|email)(?:\s*,\s*|$))+$/,
  };
  out['qa.advice_flag_mode'] = {
    ...out['qa.advice_flag_mode'],
    pattern: /^(off|flag|hold)$/,
  };
  out['legal.disclaimer.by_state'] = {
    ...out['legal.disclaimer.by_state'],
    pattern: /^\{[\s\S]{0,20000}\}$/,
  };
  out['qa.new_account_cooldown_hours'] = {
    ...out['qa.new_account_cooldown_hours'],
    min: 0,
    max: 720,
  };
  out['qa.max_links'] = { ...out['qa.max_links'], min: 0, max: 50 };
  out['qa.duplicate_window_days'] = {
    ...out['qa.duplicate_window_days'],
    min: 0,
    max: 365,
  };
  out['qa.duplicate_cross_user_max'] = {
    ...out['qa.duplicate_cross_user_max'],
    min: 1,
    max: 100,
  };
  out['qa.answer_duplicate_max'] = {
    ...out['qa.answer_duplicate_max'],
    min: 1,
    max: 100,
  };
  out['rate_limit.answer_per_day'] = {
    ...out['rate_limit.answer_per_day'],
    min: 1,
    max: 10_000,
  };
  moderationTuning(out);
  return out;
}

/** Owner 2026-10-27: scores take decimals, modes take fixed words,
 * classifier confidences stay within 0–1. */
function moderationTuning(out: Record<string, ConfigKeySchema>): void {
  for (const k of [
    'moderation.auto_hide_score',
    'moderation.verified_attorney_score',
    'moderation.auto.strike_score',
    'moderation.auto.detect_score',
    'moderation.auto.limit_at',
    'moderation.auto.suspend_temp_at',
    'moderation.auto.suspend_at',
    'moderation.auto.verified_attorney_multiplier',
    'moderation.weight.verified_reporter',
  ]) {
    if (out[k]) out[k] = { ...out[k], type: 'number', max: 1000 };
  }
  for (const k of [
    'moderation.weight.new_account',
    'moderation.weight.unverified_contact',
    'moderation.weight.burst',
    'moderation.detect.hold_at',
    'moderation.detect.block_at',
    'moderation.detect.log_at',
  ]) {
    if (out[k]) out[k] = { ...out[k], type: 'number', max: 1 };
  }
  const patterns: Record<string, RegExp> = {
    'moderation.auto_hide_mode': /^(weighted|count)$/,
    'moderation.verified_attorney_action': /^(review|hide)$/,
    'moderation.auto.verified_attorney_action': /^(review|higher_bar)$/,
    'moderation.auto.account_mode': /^(off|shadow|enforce)$/,
    'moderation.detect.mode': /^(off|shadow|enforce)$/,
    'moderation.detect.provider': /^openai$/,
    'moderation.detect.categories':
      /^(harassment|harassment\/threatening|hate|hate\/threatening|illicit|illicit\/violent|sexual|sexual\/minors|self-harm|violence|violence\/graphic)$/,
  };
  for (const [k, pattern] of Object.entries(patterns)) {
    if (out[k]) out[k] = { ...out[k], pattern };
  }
  if (out['moderation.report_abuse.unfounded_percent']) {
    out['moderation.report_abuse.unfounded_percent'].max = 100;
  }
}

function inferred(def: unknown): ConfigKeySchema {
  if (Array.isArray(def)) {
    // An empty default (e.g. moderation.blocked_terms) is a string list.
    const numeric = def.length > 0 && def.every((x) => typeof x === 'number');
    return {
      type: numeric ? 'integer[]' : 'string[]',
      defaultValue: def,
      description: null,
      ...(numeric ? { min: 0, max: 100_000 } : {}),
    };
  }
  if (typeof def === 'number') {
    return {
      type: Number.isInteger(def) ? 'integer' : 'number',
      defaultValue: def,
      description: null,
      min: 0,
      max: 10_000_000,
    };
  }
  if (typeof def === 'boolean')
    return { type: 'boolean', defaultValue: def, description: null };
  return { type: 'string', defaultValue: def, description: null };
}

/** Returns a human error, or null when [value] fits [schema]. */
export function validateConfigValue(
  schema: ConfigKeySchema,
  value: unknown,
): string | null {
  const num = (v: unknown, integer: boolean): string | null => {
    if (typeof v !== 'number' || !Number.isFinite(v)) return 'must be a number';
    if (integer && !Number.isInteger(v)) return 'must be an integer';
    if (schema.min !== undefined && v < schema.min)
      return `must be ≥ ${schema.min}`;
    if (schema.max !== undefined && v > schema.max)
      return `must be ≤ ${schema.max}`;
    return null;
  };
  const str = (v: unknown): string | null => {
    if (typeof v !== 'string' || v.length === 0 || v.length > 500)
      return 'must be a non-empty string (≤ 500)';
    if (schema.pattern && !schema.pattern.test(v))
      return `must match ${schema.pattern.source}`;
    return null;
  };
  switch (schema.type) {
    case 'integer':
      return num(value, true);
    case 'number':
      return num(value, false);
    case 'boolean':
      return typeof value === 'boolean' ? null : 'must be true or false';
    case 'string':
      return str(value);
    case 'string[]':
    case 'integer[]': {
      if (!Array.isArray(value) || value.length > 1000)
        return 'must be an array (≤ 1000 items)';
      for (const item of value) {
        const err = schema.type === 'string[]' ? str(item) : num(item, true);
        if (err) return `items ${err}`;
      }
      return null;
    }
    default:
      return 'unsupported type';
  }
}
