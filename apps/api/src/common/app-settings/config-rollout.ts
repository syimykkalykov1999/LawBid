import { randomUUID } from 'node:crypto';
import type { Prisma } from '../../generated/prisma/client';
import { APP_SETTINGS } from './app-settings.defaults';

/**
 * Б3 (25.11): a setting change is released like code (Meta «Holistic
 * Configuration Management at Facebook» / Configerator, SOSP 2015 §3.3
 * «canary»; Google SRE Workbook ch. 16 «Canarying Releases», config is
 * canaried the same way as binaries). No library does this for a
 * table-backed config, so it is our own code (owner 25.11: «Сам решай»).
 *
 * How it works:
 * 1. The admin save writes the NEW value to app_config as before (the admin
 *    sees what he saved, optimistic checks keep working) and, in the same
 *    transaction, a rollout record under [ROLLOUTS_KEY]: the keys, their
 *    old values, the start and the end of the watch window.
 * 2. A canary share of API tasks (`settings.canary_percent`, at least one
 *    task) reads the new values; every other process (the rest of the API
 *    tasks, the workers, the app start answer) reads the OLD values over the
 *    record ([controlView]) — the same change, a small share of traffic.
 * 3. Each minute the worker looks at the SLO fast-burn alarms (the
 *    alarm-events hook writes them to system_incidents). An alarm that
 *    fired after the start (it was OK before) = the old values are written
 *    back for everyone ([breachOf], audit `settings.auto_revert`). The
 *    window over with no alarm = the record is removed, everyone reads the
 *    new values (audit `settings.rollout_promoted`).
 * 4. Money and «Авто» keys, the canary settings themselves and the keys of
 *    calls and realtime (both ends of a call must agree) are applied at
 *    once as before (`settings.canary_skip_prefixes`).
 */

/** The app_config row that holds the rollouts under watch (internal, not
 * an admin setting; stripped from every reader's map). */
export const ROLLOUTS_KEY = 'settings.rollouts';

/** Alarm rows (system_incidents.component, see alarmComponent) that stop a
 * rollout: the SLO fast-burn composites and the availability fast burn. */
export const ROLLOUT_ALARM = /^alarm:(availability|slo-[a-z0-9_-]+)-fast$/;

/** A missed promotion (the worker was away) stops holding old values this
 * long after the window: the admin's change then reaches everyone. */
export const ROLLOUT_GRACE_MS = 10 * 60_000;

export const ROLLOUT_AUDIT = {
  autoRevert: 'settings.auto_revert',
  promoted: 'settings.rollout_promoted',
  emergency: 'settings.rollout_emergency',
  revert: 'settings.revert',
} as const;

type Json = Prisma.JsonValue;

export interface ConfigRollout {
  id: string;
  adminId: string;
  action: string;
  keys: string[];
  /** Old values; null = there was no stored row (the default applied). */
  before: Record<string, Json | null>;
  after: Record<string, Json | null>;
  startedAt: string;
  watchUntil: string;
  percent: number;
}

export interface RolloutSettings {
  watchMinutes: number;
  percent: number;
  skipPrefixes: string[];
}

function finite(
  v: unknown,
  fallback: number,
  min: number,
  max = Number.POSITIVE_INFINITY,
) {
  return typeof v === 'number' && Number.isFinite(v)
    ? Math.min(max, Math.max(min, v))
    : fallback;
}

/** The three admin settings from a raw app_config map. */
export function rolloutSettings(
  config: Readonly<Record<string, unknown>>,
): RolloutSettings {
  const prefixes = config['settings.canary_skip_prefixes'];
  return {
    watchMinutes: finite(
      config['settings.watch_minutes'],
      APP_SETTINGS['settings.watch_minutes'],
      0,
    ),
    percent: finite(
      config['settings.canary_percent'],
      APP_SETTINGS['settings.canary_percent'],
      1,
      100,
    ),
    skipPrefixes:
      Array.isArray(prefixes) && prefixes.every((p) => typeof p === 'string')
        ? prefixes
        : [...APP_SETTINGS['settings.canary_skip_prefixes']],
  };
}

/** Applied at once, never canaried. */
export function skipsCanary(key: string, prefixes: readonly string[]): boolean {
  return (
    key === ROLLOUTS_KEY ||
    key.startsWith('settings.') ||
    prefixes.some((p) => p.length > 0 && key.startsWith(p))
  );
}

export function parseRollouts(raw: unknown): ConfigRollout[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (r): r is ConfigRollout =>
      typeof r === 'object' &&
      r !== null &&
      typeof (r as ConfigRollout).id === 'string' &&
      Array.isArray((r as ConfigRollout).keys) &&
      typeof (r as ConfigRollout).before === 'object' &&
      typeof (r as ConfigRollout).startedAt === 'string' &&
      typeof (r as ConfigRollout).watchUntil === 'string',
  );
}

/** Still holding old values for the non-canary processes at [now]. */
export function isHolding(r: ConfigRollout, now: number): boolean {
  return Date.parse(r.watchUntil) + ROLLOUT_GRACE_MS > now;
}

/** The map the canary tasks read: the stored values, record removed. */
export function canaryView(
  config: Record<string, unknown>,
): Record<string, unknown> {
  if (!(ROLLOUTS_KEY in config)) return config;
  const out = { ...config };
  delete out[ROLLOUTS_KEY];
  return out;
}

/** The map everyone else reads: the old value of every key under watch
 * (a key that had no row goes back to its default), record removed. */
export function controlView(
  config: Record<string, unknown>,
  now: number,
): Record<string, unknown> {
  if (!(ROLLOUTS_KEY in config)) return config;
  const out = { ...config };
  for (const r of parseRollouts(config[ROLLOUTS_KEY])) {
    if (!isHolding(r, now)) continue;
    for (const key of r.keys) {
      const old = r.before[key];
      if (old === null || old === undefined) delete out[key];
      else out[key] = old;
    }
  }
  delete out[ROLLOUTS_KEY];
  return out;
}

/**
 * Is this process one of the canary tasks? [members] = the live API task
 * ids (heartbeats), [percent] = `settings.canary_percent`. The first
 * ceil(n · percent / 100) ids in sorted order (random UUIDs = a random,
 * stable choice), at least one: with 2 tasks and 10 % that is one task.
 */
export function inCanary(
  self: string,
  members: readonly string[],
  percent: number,
): boolean {
  if (!members.includes(self) || percent <= 0) return false;
  const sorted = [...new Set(members)].sort();
  const count = Math.max(
    1,
    Math.ceil((sorted.length * Math.min(percent, 100)) / 100),
  );
  return sorted.indexOf(self) < count;
}

/**
 * Adds [next] to the list. Keys already under watch keep their FIRST old
 * value (so a revert goes back to the value before both saves) and the
 * merged rollout restarts its window.
 */
export function addRollout(
  list: readonly ConfigRollout[],
  next: ConfigRollout,
): ConfigRollout[] {
  const overlapping = list.filter((r) =>
    r.keys.some((k) => next.keys.includes(k)),
  );
  if (overlapping.length === 0) return [...list, next];
  const before: Record<string, Json | null> = {};
  const after: Record<string, Json | null> = {};
  for (const r of overlapping) {
    Object.assign(before, r.before);
    Object.assign(after, r.after);
  }
  for (const k of next.keys) {
    if (!(k in before)) before[k] = next.before[k] ?? null;
    after[k] = next.after[k] ?? null;
  }
  const merged: ConfigRollout = {
    ...next,
    keys: Object.keys(before),
    before,
    after,
  };
  return [...list.filter((r) => !overlapping.includes(r)), merged];
}

/** A rollout record for a save, or null when nothing is canaried. */
export function newRollout(
  input: {
    adminId: string;
    action: string;
    before: Record<string, Json | null>;
    after: Record<string, Json | null>;
  },
  settings: RolloutSettings,
  now: Date,
): ConfigRollout | null {
  if (settings.watchMinutes <= 0) return null;
  const keys = Object.keys(input.after).filter(
    (k) =>
      !skipsCanary(k, settings.skipPrefixes) &&
      JSON.stringify(input.before[k] ?? null) !==
        JSON.stringify(input.after[k] ?? null),
  );
  if (keys.length === 0) return null;
  return {
    id: randomUUID(),
    adminId: input.adminId,
    action: input.action,
    keys,
    before: Object.fromEntries(keys.map((k) => [k, input.before[k] ?? null])),
    after: Object.fromEntries(keys.map((k) => [k, input.after[k] ?? null])),
    startedAt: now.toISOString(),
    watchUntil: new Date(
      now.getTime() + settings.watchMinutes * 60_000,
    ).toISOString(),
    percent: settings.percent,
  };
}

export interface AlarmRow {
  component: string;
  opened_at: Date;
  closed_at: Date | null;
}

/**
 * The alarm that stops [r], or null. Only an alarm that went to ALARM at or
 * after the start counts: one already firing before the change (opened
 * earlier, still open) is not this change's fault.
 */
export function breachOf(
  r: ConfigRollout,
  alarms: readonly AlarmRow[],
): AlarmRow | null {
  const start = Date.parse(r.startedAt);
  return (
    alarms.find(
      (a) => ROLLOUT_ALARM.test(a.component) && a.opened_at.getTime() >= start,
    ) ?? null
  );
}

/** What one audit row of a settings save changed, as {key: value} maps.
 * Two shapes exist: the generic editor ({key, value}) and the section
 * writers ({key: value, ...}). Null when the row is not a settings save. */
export function auditChange(
  before: unknown,
  after: unknown,
): {
  before: Record<string, Json | null>;
  after: Record<string, Json | null>;
} | null {
  const isObj = (v: unknown): v is Record<string, Json | null> =>
    typeof v === 'object' && v !== null && !Array.isArray(v);
  if (!isObj(after)) return null;
  if (typeof after.key === 'string' && 'value' in after) {
    const key = after.key;
    const old =
      isObj(before) && before.key === key ? (before.value ?? null) : null;
    return { before: { [key]: old }, after: { [key]: after.value ?? null } };
  }
  const keys = Object.keys(after);
  if (keys.length === 0) return null;
  return {
    before: Object.fromEntries(
      keys.map((k) => [k, isObj(before) ? (before[k] ?? null) : null]),
    ),
    after: Object.fromEntries(keys.map((k) => [k, after[k] ?? null])),
  };
}
