/**
 * Owner 2026-10-05 («Продвижение»): demo mode for bloggers. The owner's
 * switches live in ONE app_config row (`demo.program`, JSON) edited from
 * the admin (Деньги → Партнёры → Демо-доступ); a missing or malformed row
 * falls back to these defaults field by field. Everything is "auto" by
 * default (automation principle): the world cleans itself.
 */
export const DEMO_SETTINGS_KEY = 'demo.program';

export const DEMO_ROLES = ['client', 'attorney', 'assistant'] as const;
export type DemoRole = (typeof DEMO_ROLES)[number];

export interface DemoBannerText {
  en: string;
  ru: string;
}

export interface DemoProgramSettings {
  /** Master switch. Off: nobody can enter demo accounts; existing demo
   * sessions get 401 on their next request (the guard still lets the
   * world exist, the sweep keeps cleaning). */
  enabled: boolean;
  /** A demo account idle for this many days is deleted by the sweep. */
  ttlDays: number;
  /** How many demo accounts one partner may hold at a time. */
  maxAccountsPerPartner: number;
  /** Off: the hourly sweep deletes nothing (the admin deletes by hand). */
  autoClean: boolean;
  /** Upload quota per demo account, megabytes. */
  uploadQuotaMb: number;
  /** The banner shown in the app while in a demo account. */
  bannerText: DemoBannerText;
}

export const DEMO_LIMITS = {
  ttlDays: { min: 1, max: 60 },
  maxAccountsPerPartner: { min: 0, max: 20 },
  uploadQuotaMb: { min: 1, max: 500 },
  bannerText: 120,
  label: 200,
  name: 60,
} as const;

export const DEFAULT_DEMO_SETTINGS: DemoProgramSettings = {
  enabled: true,
  ttlDays: 7,
  maxAccountsPerPartner: 5,
  autoClean: true,
  uploadQuotaMb: 20,
  bannerText: {
    en: 'Demo mode: the data is not real',
    ru: 'Демо-режим: данные ненастоящие',
  },
};

/** Invite codes for bloggers without an app account: 8 unambiguous chars. */
export const DEMO_INVITE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const DEMO_INVITE_LENGTH = 8;
export const DEMO_INVITE_TTL_DAYS = 30;

function clampInt(v: unknown, def: number, min: number, max: number): number {
  const n = typeof v === 'number' ? Math.round(v) : Number.NaN;
  if (!Number.isFinite(n)) return def;
  return Math.min(max, Math.max(min, n));
}

export function parseDemoSettings(raw: unknown): DemoProgramSettings {
  const d = DEFAULT_DEMO_SETTINGS;
  const o =
    raw && typeof raw === 'object' && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  const banner =
    o.bannerText && typeof o.bannerText === 'object'
      ? (o.bannerText as Record<string, unknown>)
      : {};
  const text = (k: keyof DemoBannerText): string => {
    const v = banner[k];
    return typeof v === 'string' && v.trim() !== ''
      ? v.trim().slice(0, DEMO_LIMITS.bannerText)
      : d.bannerText[k];
  };
  return {
    enabled: typeof o.enabled === 'boolean' ? o.enabled : d.enabled,
    ttlDays: clampInt(
      o.ttlDays,
      d.ttlDays,
      DEMO_LIMITS.ttlDays.min,
      DEMO_LIMITS.ttlDays.max,
    ),
    maxAccountsPerPartner: clampInt(
      o.maxAccountsPerPartner,
      d.maxAccountsPerPartner,
      DEMO_LIMITS.maxAccountsPerPartner.min,
      DEMO_LIMITS.maxAccountsPerPartner.max,
    ),
    autoClean: typeof o.autoClean === 'boolean' ? o.autoClean : d.autoClean,
    uploadQuotaMb: clampInt(
      o.uploadQuotaMb,
      d.uploadQuotaMb,
      DEMO_LIMITS.uploadQuotaMb.min,
      DEMO_LIMITS.uploadQuotaMb.max,
    ),
    bannerText: { en: text('en'), ru: text('ru') },
  };
}
