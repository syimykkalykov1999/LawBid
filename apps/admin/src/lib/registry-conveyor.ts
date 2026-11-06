/**
 * Owner 2026-11-04 (R-400): the attorney-verification conveyor. Pure rules
 * shared by the request card, the review screen and the tests: which state
 * registry to open and in which browser tab, what the one-tap copy chips
 * hold, and how the card finds the next request of the same queue filter.
 *
 * The registry addresses are NOT kept here: the API already has the one
 * table per state (apps/api/src/modules/verification/state-bar-links.ts,
 * research 2026-10-03/16/28) and sends each license with its `lookupUrl`
 * (a profile page when the state has one per number, else the search page).
 * The admin only shows what the API sent — one source, no second map.
 */
import { pickNext } from '@/lib/review-flow';

/**
 * The name of the browser tab every «Открыть реестр» opens into. A named
 * target makes `window.open` reuse the same tab (the browser navigates it
 * instead of opening another one) — that is the whole point: one registry
 * tab per admin, however many requests they check. `noopener` must NOT be
 * passed on that call: it severs the link to the named context and every
 * click would open a fresh tab again. The address is safe to open this way
 * because it only ever comes from the API's state table (`lookupUrl`),
 * never from the attorney or any other input.
 */
export const REGISTRY_TAB = 'lawbid-registry';

export interface RegistryLicense {
  stateCode: string;
  stateName?: string | null;
  barNumber: string;
  lookupUrl: string | null;
}

export interface RegistryLink {
  stateCode: string;
  stateName: string;
  barNumber: string;
  /** null = the state has no lookup page in the API's table. */
  url: string | null;
}

/** One link per state of the request (the first license of a state wins). */
export function registryLinks(licenses: readonly RegistryLicense[]): RegistryLink[] {
  const out: RegistryLink[] = [];
  for (const l of licenses) {
    if (out.some((x) => x.stateCode === l.stateCode)) continue;
    out.push({ stateCode: l.stateCode, stateName: l.stateName || l.stateCode, barNumber: l.barNumber, url: l.lookupUrl });
  }
  return out;
}

/** The label of the button: one state — «Открыть реестр штата», several — with the code. */
export function registryButtonLabel(link: RegistryLink, total: number): string {
  return total > 1 ? `Открыть реестр ${link.stateCode}` : 'Открыть реестр штата';
}

/**
 * Opens the state registry in the ONE named tab (see REGISTRY_TAB). Returns
 * the window the browser gave back (null when a popup blocker refused).
 * Deliberately without `noopener`/`noreferrer`: the named target would stop
 * being reused (see REGISTRY_TAB).
 */
export function openRegistry(url: string, win: Pick<Window, 'open'> | undefined = typeof window === 'undefined' ? undefined : window): Window | null {
  if (!win) return null;
  const w = win.open(url, REGISTRY_TAB);
  w?.focus?.();
  return w;
}

export type CopyChipId = 'name' | 'bar' | 'state' | 'birth';

export interface CopyChip {
  id: CopyChipId;
  /** What the chip says («ФИО», «№ лицензии»…). */
  label: string;
  /** What lands in the clipboard. */
  value: string;
}

export interface CopyChipSource {
  attorney: { firstName?: string | null; lastName?: string | null; username?: string; birthDate?: string | null };
  licenses: readonly RegistryLicense[];
}

/**
 * The one-tap copy chips under the documents and on the last slide: the name
 * exactly as in the application, the bar number (one chip per license when
 * there are several), the state, and the date of birth when the application
 * carries one (the API does not send it yet — the chip appears by itself the
 * day it does).
 */
export function copyChips(src: CopyChipSource): CopyChip[] {
  const name = [src.attorney.firstName, src.attorney.lastName].filter(Boolean).join(' ').trim();
  const chips: CopyChip[] = [];
  if (name) chips.push({ id: 'name', label: 'ФИО', value: name });
  const many = src.licenses.length > 1;
  for (const l of src.licenses) {
    if (!l.barNumber) continue;
    chips.push({ id: 'bar', label: many ? `№ ${l.stateCode}` : '№ лицензии', value: l.barNumber });
  }
  const states = Array.from(new Set(src.licenses.map((l) => l.stateCode).filter(Boolean)));
  for (const s of states) {
    const full = src.licenses.find((l) => l.stateCode === s)?.stateName;
    chips.push({ id: 'state', label: states.length > 1 ? `Штат ${s}` : 'Штат', value: full && full !== s ? `${s} — ${full}` : s });
  }
  if (src.attorney.birthDate) chips.push({ id: 'birth', label: 'Дата рождения', value: src.attorney.birthDate.slice(0, 10) });
  return chips;
}

// --- the next request of the same queue filter --------------------------------

/** The list filter the card was opened from (the tabs and the state box of the queue page). */
export interface QueueFilter {
  status: string;
  stateCode: string;
}

const STATUSES = ['submitted', 'in_review', 'needs_more_info'];

/** The filter from the card's address (`?status=…&stateCode=…`), unknown values dropped. */
export function queueFilterFrom(params: Pick<URLSearchParams, 'get'>): QueueFilter {
  const status = params.get('status') ?? '';
  const state = (params.get('stateCode') ?? '').toUpperCase();
  return { status: STATUSES.includes(status) ? status : '', stateCode: /^[A-Z]{2}$/.test(state) ? state : '' };
}

/** The query string that carries the filter from the list to the card (empty when nothing is set). */
export function queueSearch(filter: QueueFilter): string {
  const p = new URLSearchParams();
  if (filter.status) p.set('status', filter.status);
  if (filter.stateCode) p.set('stateCode', filter.stateCode);
  const s = p.toString();
  return s ? `?${s}` : '';
}

/** The address of a request card inside the same filter. */
export function cardHref(id: string, filter: QueueFilter): string {
  return `/verification/${encodeURIComponent(id)}${queueSearch(filter)}`;
}

export interface QueueRow {
  id: string;
  status: string;
  reviewerId: string | null;
}

/**
 * The next request of the queue after [currentId]: the oldest one nobody else
 * holds, not one skipped here. Without a status filter the requests waiting
 * for the attorney (needs_more_info) are passed over, as the focus mode does.
 */
export function nextInQueue(rows: readonly QueueRow[], currentId: string, filter: QueueFilter, meId: string | undefined, skipped: ReadonlySet<string>): string | null {
  const usable = (r: QueueRow) => (!r.reviewerId || r.reviewerId === meId) && (filter.status !== '' || r.status !== 'needs_more_info');
  return pickNext(rows, (r) => r.id, currentId, skipped, usable)?.id ?? null;
}
