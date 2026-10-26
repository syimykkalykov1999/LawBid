/**
 * Owner 2026-10-04 — bulk moderation helpers (pure, unit-tested in
 * lib/bulk.test.ts): selection sets, batching, the "select all matching
 * the filter" loader and the Russian texts of the confirmation step.
 */

/** The API takes at most this many ids per request. */
const BULK_BATCH = 500;
/** "Select everything matching the filter" stops here. */
export const SELECT_ALL_CAP = 2000;

export interface BulkResult {
  done: string[];
  skipped: { id: string; reason: string }[];
}

export function toggleId(set: ReadonlySet<string>, id: string): Set<string> {
  const next = new Set(set);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

/** Adds every id when some are missing, otherwise removes them all
 * (the header checkbox of a page). */
export function togglePage(set: ReadonlySet<string>, ids: string[]): Set<string> {
  const next = new Set(set);
  const all = ids.length > 0 && ids.every((id) => next.has(id));
  for (const id of ids) {
    if (all) next.delete(id);
    else next.add(id);
  }
  return next;
}

export function pageState(set: ReadonlySet<string>, ids: string[]): 'none' | 'some' | 'all' {
  const n = ids.filter((id) => set.has(id)).length;
  return n === 0 ? 'none' : n === ids.length ? 'all' : 'some';
}

export function chunk<T>(items: T[], size = BULK_BATCH): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** Sends the ids in batches the API accepts and merges the answers. */
export async function runInBatches(ids: string[], send: (batch: string[]) => Promise<BulkResult>): Promise<BulkResult> {
  const out: BulkResult = { done: [], skipped: [] };
  for (const batch of chunk(ids)) {
    const r = await send(batch);
    out.done.push(...r.done);
    out.skipped.push(...r.skipped);
  }
  return out;
}

/** Walks a cursor-paged list and collects ids (up to [cap]). */
export async function collectIds<T extends { id: string }>(
  fetchPage: (cursor: string | undefined) => Promise<{ data: T[]; nextCursor: string | null | undefined }>,
  accept: (row: T) => boolean = () => true,
  cap = SELECT_ALL_CAP,
): Promise<{ ids: string[]; capped: boolean }> {
  const ids: string[] = [];
  let cursor: string | undefined;
  for (;;) {
    const page = await fetchPage(cursor);
    for (const row of page.data) {
      if (!accept(row)) continue;
      if (ids.length >= cap) return { ids, capped: true };
      ids.push(row.id);
    }
    if (!page.nextCursor) return { ids, capped: false };
    cursor = page.nextCursor;
  }
}

export function plural(n: number, one: string, few: string, many: string): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

/** Noun forms: [one, few, many]. */
export type Noun = readonly [string, string, string];

export const count = (n: number, noun: Noun) => `${n.toLocaleString('ru-RU')} ${plural(n, ...noun)}`;

/** The line of the result toast: what was done and what was skipped. */
export function resultText(r: BulkResult, verb: string, noun: Noun): string {
  const parts = [`${verb}: ${count(r.done.length, noun)}`];
  if (r.skipped.length) parts.push(`пропущено ${r.skipped.length} (уже в этом состоянии или недоступны)`);
  return parts.join(' · ');
}

/** "YYYY-MM-DD" from a date input → ISO bounds the list filters take
 * (`to` is exclusive: the day after). */
export function dayBounds(from: string, to: string): { from?: string; to?: string } {
  const out: { from?: string; to?: string } = {};
  if (from) out.from = new Date(`${from}T00:00:00`).toISOString();
  if (to) {
    const d = new Date(`${to}T00:00:00`);
    d.setDate(d.getDate() + 1);
    out.to = d.toISOString();
  }
  return out;
}
