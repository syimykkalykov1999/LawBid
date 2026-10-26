/**
 * Owner 2026-10-25: «Инструкции» — step-by-step guides for everything the
 * owner does outside our code. The guides are markdown files in
 * apps/admin/content/guides/*.md with a small front-matter block; this file
 * reads that block and does the searching/grouping. No file access here
 * (lib/guides-server.ts reads the folder), so it is easy to test.
 */
export const GUIDE_CATEGORIES = [
  { id: 'launch', title: 'Запуск' },
  { id: 'money', title: 'Деньги' },
  { id: 'people', title: 'Люди' },
  { id: 'content', title: 'Контент' },
  { id: 'legal', title: 'Право' },
  { id: 'system', title: 'Система' },
] as const;

export type GuideCategory = (typeof GUIDE_CATEGORIES)[number]['id'];

export interface GuideSource {
  title: string;
  url: string;
}

export interface GuideMeta {
  id: string;
  title: string;
  category: GuideCategory;
  cost: string;
  time: string;
  /** «Запуск» step ids this guide covers (the first one is the main one). */
  launch: string[];
  /** ISO date the UI names were last checked on the live sites. */
  verified: string;
  sources: GuideSource[];
}

export interface Guide extends GuideMeta {
  body: string;
}

export const categoryTitle = (id: string): string => GUIDE_CATEGORIES.find((c) => c.id === id)?.title ?? id;

/** Splits «key: value» lines on the FIRST colon only (values may hold colons). */
export function parseGuide(raw: string): Guide {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(raw);
  if (!m) throw new Error('нет блока front-matter (--- ... ---) в начале файла');
  const fields: Record<string, string> = {};
  const sources: GuideSource[] = [];
  let inSources = false;
  for (const line of m[1].split(/\r?\n/)) {
    if (!line.trim()) continue;
    const item = /^\s+-\s+(.*)$/.exec(line);
    if (inSources && item) {
      const cut = item[1].lastIndexOf(' | ');
      if (cut < 0) throw new Error(`источник без « | ссылка»: ${item[1]}`);
      sources.push({ title: item[1].slice(0, cut).trim(), url: item[1].slice(cut + 3).trim() });
      continue;
    }
    const kv = /^([a-z]+):\s*(.*)$/.exec(line);
    if (!kv) throw new Error(`не понял строку front-matter: ${line}`);
    inSources = kv[1] === 'sources';
    if (!inSources) fields[kv[1]] = kv[2].trim();
  }
  return {
    id: fields.id ?? '',
    title: fields.title ?? '',
    category: fields.category as GuideCategory,
    cost: fields.cost ?? '',
    time: fields.time ?? '',
    launch: (fields.launch ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    verified: fields.verified ?? '',
    sources,
    body: m[2].trim(),
  };
}

/** Problems with one guide; an empty list means fine. Used by the tests. */
export function guideProblems(g: Guide): string[] {
  const out: string[] = [];
  if (!/^[a-z0-9-]+$/.test(g.id)) out.push('id: только a-z, 0-9 и «-»');
  if (!g.title) out.push('нет title');
  if (!GUIDE_CATEGORIES.some((c) => c.id === g.category)) out.push(`category «${g.category}» не из списка`);
  if (!g.cost) out.push('нет cost');
  if (!g.time) out.push('нет time');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(g.verified) || Number.isNaN(Date.parse(g.verified))) out.push('verified: нужна дата ГГГГ-ММ-ДД');
  if (g.sources.length < 1) out.push('нет sources');
  for (const s of g.sources) {
    if (!/^https:\/\/[^\s]+$/.test(s.url)) out.push(`источник не https: ${s.url}`);
    if (!s.title) out.push(`у источника нет названия: ${s.url}`);
  }
  if (g.body.length < 200) out.push('текст слишком короткий');
  return out;
}

/** All words must be found in the title, cost, text or source names. */
export function searchGuides<T extends GuideMeta & { body?: string }>(guides: readonly T[], query: string): T[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [...guides];
  return guides.filter((g) => {
    const hay = `${g.title} ${g.cost} ${g.body ?? ''} ${g.sources.map((s) => s.title).join(' ')}`.toLowerCase();
    return words.every((w) => hay.includes(w));
  });
}

export function groupGuides<T extends GuideMeta>(guides: readonly T[]): { id: GuideCategory; title: string; guides: T[] }[] {
  return GUIDE_CATEGORIES.map((c) => ({ id: c.id, title: c.title, guides: guides.filter((g) => g.category === c.id) })).filter(
    (c) => c.guides.length > 0,
  );
}

/** The guide that explains a «Запуск» step (null if none). */
export function guideForStep<T extends GuideMeta>(guides: readonly T[], stepId: string): T | null {
  return guides.find((g) => g.launch.includes(stepId)) ?? null;
}

/** The newest check date among the guides («последнее обновление»), or '' for none. */
export function latestVerified<T extends Pick<GuideMeta, 'verified'>>(guides: readonly T[]): string {
  return guides.map((g) => g.verified).filter((v) => Number.isFinite(Date.parse(v))).sort().at(-1) ?? '';
}

/** «проверено 25 октября 2026». */
export function verifiedWord(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return `проверено ${d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })}`;
}

/** Guides older than this many days get a «пора перепроверить» hint. */
export const STALE_DAYS = 180;
export function isStale(iso: string, now: Date = new Date()): boolean {
  const t = Date.parse(iso);
  return Number.isFinite(t) && (now.getTime() - t) / 86_400_000 > STALE_DAYS;
}

/** Where «Сделано» is remembered when no manual «Запуск» step carries it. */
export const localDoneKey = (id: string) => `lawbid-guide-done:${id}`;
