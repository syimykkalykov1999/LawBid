import { APP_SETTINGS } from '../../common/app-settings/app-settings.defaults';
import { REALTIME_SETTING_DEFS } from '../../common/app-settings/realtime-settings';
import { TEXT_LIMIT_DEFS } from '../../common/app-settings/text-limits';
import {
  CLIENT_TUNING_DEFS,
  type ClientTuningDef,
} from '../../common/app-settings/client-tuning';
import { COST_PROVIDERS } from '../../common/cost-guard/cost-guard.constants';
import type { ConfigValueType } from './admin-config.dto';
import { ADMIN_AREAS } from '../admin-auth/admin-permissions';
import { SEATS_HARD_CAP, TRIAL_DAYS_MAX } from '../billing/billing.constants';
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
  out['search.engine'] = {
    type: 'string',
    defaultValue: 'postgres',
    description:
      'Who answers searches: postgres (today), shadow (ask the search engine too, show Postgres, log the differences) or engine (the search engine, Postgres if it fails or is slow). The engine needs Integrations → Search engine (OpenSearch).',
    pattern: /^(postgres|shadow|engine)$/,
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
      'Who carries video calls: p2p (device to device, up to 9 people), livekit (media server; needs the LiveKit keys in Integrations) or cloudflare (Cloudflare SFU for group calls; needs the Cloudflare SFU keys in Integrations).',
    pattern: /^(p2p|livekit|cloudflare)$/,
  };
  out['calls.sfu_max_participants'] = {
    type: 'integer',
    defaultValue: 20,
    description:
      'Most people in one group call while calls run on Cloudflare SFU (calls.video_provider = cloudflare).',
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
    defaultValue: 30,
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
      'Daily money cap for all paid services together, in US cents (empty = BUDGET_GLOBAL_DAILY_CENTS, $500; 0 = none). An alert fires at 80 %.',
    min: 0,
    max: 100_000_000,
  };
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
  // Owner 2026-10-22: duties per assistant (10 exist; the app and the API
  // both refuse more).
  out['assistants.max_duties'] = {
    ...out['assistants.max_duties'],
    type: 'integer',
    description:
      'How many duties (roles) one assistant may hold at most, out of 10.',
    min: 1,
    // The 10 duties of assistants/assistant-duties.ts (not imported: the
    // admin config stays free of feature modules).
    max: 10,
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
      'Requests per minute one signed-in admin may make (users stay at 100); ADMIN_THROTTLE_LIMIT in the env overrides it.',
    min: ADMIN_THROTTLE_MIN,
    max: ADMIN_THROTTLE_MAX,
  };
  for (const key of [
    'rate_limit.bid_create_per_day',
    'rate_limit.bid_counter_per_hour',
    'rate_limit.case_create_per_day',
    'rate_limit.chat_save_per_minute',
    'rate_limit.forward_per_minute',
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
      'On (default): remember who other than the owner opened a confidential file and from which device; the owner can see it. Off: nothing is recorded.',
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
  out['billing.cancel_on_verification_loss'] = {
    ...out['billing.cancel_on_verification_loss'],
    description:
      'An attorney who loses verification (rejected / suspended): the subscription ends now and the unused part of the period, offer packs and Boost is refunded. Off: nothing is canceled automatically.',
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
  out['sms.login_code_enabled'] = {
    ...out['sms.login_code_enabled'],
    description:
      'Off (default): a registered number signs in with its password; an SMS code goes only to register a new number and to reset a password. On: the old sign-in code works again (rollback).',
  };
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
  out['storage.daily_upload_mb_per_user'] = {
    ...out['storage.daily_upload_mb_per_user'],
    description:
      'Most MB one person may upload per UTC day (avatars, documents and exports do not count). Stops an upload-and-delete loop. 0 = no cap.',
    min: 0,
    max: 1_000_000,
  };
  // Owner 2026-10-05: zero-maintenance operations (Система → Здоровье системы).
  out['ops.db_slow_ms'] = {
    ...out['ops.db_slow_ms'],
    description:
      'Database answer time (ms) above which heavy background jobs pause on their own for 15 minutes.',
    min: 100,
    max: 60_000,
  };
  out['ops.backup_max_age_hours'] = {
    ...out['ops.backup_max_age_hours'],
    description:
      'Alert when the newest database backup is older than this many hours.',
    min: 2,
    max: 24 * 14,
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
  out['scale.capacity_ceiling.mode'] = {
    type: 'string',
    defaultValue: 'auto',
    description:
      'Biggest database / Redis size the autoscalers may use: auto = what the allowed monthly spend pays for (Экономика), off = only the Terraform ceiling. Changed on the «Расходы» page.',
    pattern: /^(off|auto)$/,
  };
  out['scale.bunny_hardstop.mode'] = {
    type: 'string',
    defaultValue: 'auto',
    description:
      'New video uploads (Bunny): auto = pause when this month’s Bunny traffic or storage reaches the urgent threshold, on = paused now, off = never paused. Playback of existing videos is never touched. Changed on the «Расходы» page.',
    pattern: /^(off|on|auto)$/,
  };
  out['scale.cloudflare_hardstop.mode'] = {
    type: 'string',
    defaultValue: 'auto',
    description:
      'Group video calls on Cloudflare SFU: auto = fall back to device-to-device when this month’s Cloudflare traffic reaches the urgent threshold, on = fallen back now, off = never. Calls are never refused. Changed on the «Расходы» page.',
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
  out['economy.ceiling_mode'] = {
    ...out['economy.ceiling_mode'],
    description:
      'Autoscaling ceiling: auto (follows the economy rule) or manual.',
    pattern: /^(auto|manual)$/,
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
  out['billing.dual_approval_min_cents'] = {
    ...out['billing.dual_approval_min_cents'],
    description:
      'Bulk payouts and refunds of this many cents or more wait for a second admin to approve them (0 = all of them). Changing it needs a fresh 2FA code.',
    min: 0,
    max: 100_000_000,
  };
  out['admin.dual_control'] = {
    ...out['admin.dual_control'],
    description:
      'Second-admin approval for payouts, refunds, bonuses and the ops buttons. Off (default): the admin who asks runs the action at once after a fresh 2FA code. On: amounts from billing.dual_approval_min_cents wait for another admin.',
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
  return out;
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
