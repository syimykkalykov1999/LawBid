import { APP_SETTINGS } from '../../common/app-settings/app-settings.defaults';
import type { ConfigValueType } from './admin-config.dto';

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
export function configSchema(): Record<string, ConfigKeySchema> {
  const out: Record<string, ConfigKeySchema> = {};
  for (const [key, def] of Object.entries(APP_SETTINGS)) {
    out[key] = inferred(def);
  }
  for (const provider of ['sms', 'email', 'id_check', 'storage']) {
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
