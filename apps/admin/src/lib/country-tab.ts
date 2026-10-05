'use client';

/**
 * Owner 2026-10-05: the country tab the admin works in. Every request
 * carries it as `X-Admin-Country`; the API narrows queues and lists to
 * that country (and never beyond the countries the admin is assigned).
 * Empty means "all my countries".
 */
const KEY = 'lawbid.admin.country';
const listeners = new Set<() => void>();

export function countryTab(): string {
  if (typeof window === 'undefined') return '';
  try {
    return window.localStorage.getItem(KEY) ?? '';
  } catch {
    return '';
  }
}

export function setCountryTab(code: string): void {
  try {
    if (code) window.localStorage.setItem(KEY, code);
    else window.localStorage.removeItem(KEY);
  } catch {
    // private window: the tab just isn't remembered
  }
  listeners.forEach((l) => l());
}

export function onCountryTab(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}
