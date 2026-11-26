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
  /** Alarm occurrences ([alarmKey]) that no longer count for this change:
   * blamed on a newer change, or already alerted as an incident that was
   * going on before it (judgeAlarms). */
  excused?: string[];
}

export interface RolloutSettings {
  watchMinutes: number;
  percent: number;
  skipPrefixes: string[];
  /** Review of #1332: the same SLO alarm open, or closed less than this
   * many minutes before a change started = an incident was already going
   * on; its next firing alerts instead of reverting. */
  incidentQuietMinutes: number;
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
    incidentQuietMinutes: finite(
      config['settings.incident_quiet_minutes'],
      APP_SETTINGS['settings.incident_quiet_minutes'],
      0,
    ),
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

/** One firing of one alarm (the same component can fire many times). */
export function alarmKey(a: AlarmRow): string {
  return `${a.component}@${a.opened_at.toISOString()}`;
}

/** Rollouts started within this of the newest one share its blame (one
 * admin saving two sections in a row). */
export const SAME_CHANGE_MS = 60_000;

export interface AlarmJudgement {
  /** Rollouts to revert, with the alarm that did it. */
  revert: { rollout: ConfigRollout; alarm: AlarmRow }[];
  /** The alarm fired during the watch but the same alarm was already open,
   * or closed less than incidentQuietMinutes before the change: an
   * incident in progress, not this change. Alert, do not revert. */
  held: { rollout: ConfigRollout; alarm: AlarmRow }[];
  /** rollout id → alarm keys that stop counting for it (blamed on a newer
   * change, or held once already). */
  excuse: Map<string, string[]>;
}

/**
 * Review of #1332 (owner rule «надёжность важнее скорости», 13.11): which
 * pending changes an SLO fast-burn alarm is blamed on. Big-platform change
 * management blames the LATEST change before the breach (Google SRE
 * Workbook ch. 16: roll back the most recent change first), not every
 * change under watch:
 *  1. an alarm counts only for rollouts that started at or before it fired
 *     (and have not excused it);
 *  2. of those, only the newest (plus any started within SAME_CHANGE_MS of
 *     it) is blamed; the older ones excuse this firing;
 *  3. if the same alarm was already open when the blamed change started,
 *     or closed less than [quietMs] before, an incident was going on: the
 *     change is held (alert, no automatic revert during the incident).
 */
export function judgeAlarms(
  list: readonly ConfigRollout[],
  alarms: readonly AlarmRow[],
  quietMs: number,
): AlarmJudgement {
  const out: AlarmJudgement = { revert: [], held: [], excuse: new Map() };
  const reverted = new Set<string>();
  const excuse = (id: string, key: string) => {
    const keys = out.excuse.get(id) ?? [];
    if (!keys.includes(key)) keys.push(key);
    out.excuse.set(id, keys);
  };
  const fired = alarms
    .filter((a) => ROLLOUT_ALARM.test(a.component))
    .sort((a, b) => a.opened_at.getTime() - b.opened_at.getTime());
  for (const a of fired) {
    const key = alarmKey(a);
    const at = a.opened_at.getTime();
    const candidates = list.filter(
      (r) =>
        !reverted.has(r.id) &&
        Date.parse(r.startedAt) <= at &&
        !(r.excused ?? []).includes(key) &&
        !(out.excuse.get(r.id) ?? []).includes(key),
    );
    if (candidates.length === 0) continue;
    const newest = Math.max(...candidates.map((r) => Date.parse(r.startedAt)));
    for (const r of candidates) {
      const start = Date.parse(r.startedAt);
      if (start < newest - SAME_CHANGE_MS) {
        excuse(r.id, key);
        continue;
      }
      const incident = alarms.some(
        (b) =>
          b.component === a.component &&
          b.opened_at.getTime() < start &&
          (b.closed_at === null || b.closed_at.getTime() >= start - quietMs),
      );
      if (incident) {
        out.held.push({ rollout: r, alarm: a });
        excuse(r.id, key);
      } else {
        out.revert.push({ rollout: r, alarm: a });
        reverted.add(r.id);
      }
    }
  }
  return out;
}

/**
 * The alarm that stops [r] on its own (no other change pending), or null.
 * Only an alarm that went to ALARM at or after the start counts: one
 * already firing before the change (opened earlier, still open) is not
 * this change's fault. The worker uses judgeAlarms (blame + incidents).
 */
export function breachOf(
  r: ConfigRollout,
  alarms: readonly AlarmRow[],
): AlarmRow | null {
  return judgeAlarms([r], alarms, 0).revert[0]?.alarm ?? null;
}

/** Ids of rollouts whose hold has run out (window + grace over) while the
 * record is still stored: the old values stopped applying on their own,
 * so every cached copy of the config must be dropped once (review #1332). */
export function expiredHoldIds(
  config: Readonly<Record<string, unknown>>,
  now: number,
): string[] {
  if (!(ROLLOUTS_KEY in config)) return [];
  return parseRollouts(config[ROLLOUTS_KEY])
    .filter((r) => !isHolding(r, now))
    .map((r) => r.id);
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
