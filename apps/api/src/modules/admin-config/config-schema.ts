import { APP_SETTINGS } from '../../common/app-settings/app-settings.defaults';
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
const REASON_AREA_PATTERN = new RegExp(
  `^(${[...ADMIN_AREAS, 'money'].join('|')})$`,
);

export function configSchema(): Record<string, ConfigKeySchema> {
  const out: Record<string, ConfigKeySchema> = {};
  for (const [key, def] of Object.entries(APP_SETTINGS)) {
    // Owner 2026-10-05: how the Stripe balance is split changes only in
    // Деньги → Прибыль и резерв (super admin + a fresh 2FA code), never
    // through this generic editor (area `settings`).
    if (key.startsWith('treasury.')) continue;
    out[key] = inferred(def);
  }
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
  // Owner 2026-10-05: assistants per attorney, set in the admin.
  out['billing.max_assistant_seats'] = {
    ...out['billing.max_assistant_seats'],
    description:
      'How many assistants an attorney may add; the yearly plan covers this many.',
    min: 1,
    max: SEATS_HARD_CAP,
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
      'Alert when the newest CockroachDB Cloud backup is older than this many hours.',
    min: 2,
    max: 24 * 14,
  };
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
  for (const platform of ['ios', 'android']) {
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
