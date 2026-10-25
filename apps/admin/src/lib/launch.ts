import type { components } from '@/lib/api/schema';

/**
 * Owner 2026-10-24: logic of the «Запуск», «Расходы» pages and the budget
 * card on «Масштаб». The pages only draw; wording, tones and the little
 * calculations live here so they can be tested without a browser.
 */
export type LaunchReport = components['schemas']['LaunchReportDto'];
export type LaunchItem = components['schemas']['LaunchItemDto'];
export type PagingStatus = components['schemas']['PagingStatusDto'];
export type AwsBudgets = components['schemas']['AwsBudgetsDto'];
export type AwsBudget = components['schemas']['AwsBudgetDto'];
export type SpendReport = components['schemas']['SpendReportDto'];
export type VendorSpend = components['schemas']['VendorSpendDto'];

type Tone = 'success' | 'warning' | 'danger' | 'neutral';

export const LAUNCH_TONE: Record<string, { tone: Tone; label: string }> = {
  green: { tone: 'success', label: 'Готово' },
  yellow: { tone: 'warning', label: 'Почти' },
  red: { tone: 'danger', label: 'Не готово' },
  manual: { tone: 'neutral', label: 'Отметьте сами' },
};

export const GROUP_TITLE: Record<string, string> = {
  release: 'Выкат и домен',
  servers: 'Серверы',
  calls: 'Звонки',
  media: 'Фото и медиа',
  alerts: 'Тревоги',
  money: 'Деньги',
  safety: 'Безопасность',
};

export function groupItems(items: readonly LaunchItem[]): { group: string; title: string; items: LaunchItem[] }[] {
  const out: { group: string; title: string; items: LaunchItem[] }[] = [];
  for (const i of items) {
    let g = out.find((x) => x.group === i.group);
    if (!g) {
      g = { group: i.group, title: GROUP_TITLE[i.group] ?? i.group, items: [] };
      out.push(g);
    }
    g.items.push(i);
  }
  return out;
}

/** «Готово 9 из 16» and what is left, in plain words. */
export function launchSummary(r: Pick<LaunchReport, 'greenCount' | 'total'>): string {
  if (r.total === 0) return 'Пока нечего проверять.';
  if (r.greenCount === r.total) return `Всё готово: ${r.total} из ${r.total}.`;
  return `Готово ${r.greenCount} из ${r.total}. Осталось ${r.total - r.greenCount}.`;
}

export const PAGING_WORD: Record<string, { tone: Tone; label: string; line: string }> = {
  none: { tone: 'danger', label: 'Нет подписки', line: 'Ссылка не подписана на топик тревог.' },
  pending: { tone: 'warning', label: 'Ждёт (Pending)', line: 'Подписка создана, PagerDuty подтвердит её сам за минуту.' },
  confirmed: { tone: 'success', label: 'Подтверждена (Confirmed)', line: 'Тревоги из критического топика идут в PagerDuty.' },
};

/** Parses «150», «150.5», «150,5», «$150»; null when it is not a sane monthly limit. */
export function parseLimit(raw: string): number | null {
  const t = raw.trim().replace(/^\$/, '').replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return null;
  const n = Number(t);
  return n >= 1 && n <= 100_000 ? n : null;
}

export function budgetPercent(b: Pick<AwsBudget, 'limitUsd' | 'actualUsd'>): number | null {
  if (!b.limitUsd || b.limitUsd <= 0 || b.actualUsd == null) return null;
  return Math.round((b.actualUsd / b.limitUsd) * 100);
}

export function budgetTone(pct: number | null): Tone {
  if (pct === null) return 'neutral';
  return pct >= 100 ? 'danger' : pct >= 80 ? 'warning' : 'success';
}

// --- «Расходы» --------------------------------------------------------------

export function money(n: number | null | undefined): string {
  if (n == null) return 'нет данных';
  return `$${n.toLocaleString('ru-RU', { maximumFractionDigits: 2, minimumFractionDigits: n % 1 === 0 ? 0 : 2 })}`;
}

export const VENDOR_STATUS: Record<string, { tone: Tone; label: string }> = {
  ok: { tone: 'success', label: 'Свежие данные' },
  stale: { tone: 'warning', label: 'Сервис не ответил, показаны прошлые цифры' },
  nodata: { tone: 'neutral', label: 'Нет данных' },
};

/** Heights (0..100) for the 30-day bars; the biggest day is 100. */
export function barHeights(days: readonly { usd: number }[]): number[] {
  const max = Math.max(0, ...days.map((d) => d.usd));
  if (max <= 0) return days.map(() => 0);
  return days.map((d) => Math.max(d.usd > 0 ? 4 : 0, Math.round((d.usd / max) * 100)));
}

/** Share of the free tier used, 0..100+ (for the bar); null without a free tier. */
export function freeTierPercent(t: { used: number; free: number } | null | undefined): number | null {
  if (!t || t.free <= 0) return null;
  return Math.round((t.used / t.free) * 100);
}

export function freeTierTone(pct: number | null): Tone {
  if (pct === null) return 'neutral';
  return pct >= 100 ? 'danger' : pct >= 70 ? 'warning' : 'success';
}

export interface FixedDraft {
  id: string;
  label: string;
  usd: string;
  period: 'month' | 'year' | 'once';
  paidMonth: string;
}

export const PERIOD_WORD: Record<FixedDraft['period'], string> = {
  month: 'каждый месяц',
  year: 'раз в год',
  once: 'один раз',
};

/** The editable rows → what the API accepts; null while a row is wrong. */
export function fixedFromDrafts(rows: readonly FixedDraft[]): { items: components['schemas']['FixedCostDto'][] } | null {
  const items: components['schemas']['FixedCostDto'][] = [];
  for (const r of rows) {
    const usd = Number(r.usd.trim().replace(',', '.'));
    const label = r.label.trim();
    if (!label || !Number.isFinite(usd) || usd < 0) return null;
    if (r.period === 'once' && !/^\d{4}-(0[1-9]|1[0-2])$/.test(r.paidMonth)) return null;
    items.push({
      id: r.id,
      label,
      usd,
      period: r.period,
      ...(r.period === 'once' ? { paidMonth: r.paidMonth } : {}),
    });
  }
  return { items };
}

export function newFixedId(existing: readonly { id: string }[]): string {
  let n = existing.length + 1;
  while (existing.some((e) => e.id === `c${n}`)) n++;
  return `c${n}`;
}

/** «Держать на счету»: one plain sentence for the owner. */
export function keepLine(t: SpendReport['total']): string {
  return `Прогноз счетов за месяц ${money(t.forecastUsd)} плюс запас ${t.marginPercent}%: держите на счету около ${money(t.keepOnAccountUsd)}.`;
}

// --- cost registry (owner 2026-10-25) --------------------------------------

export type CostRegistryReport = components['schemas']['CostRegistryReportDto'];
export type CostRegistryRow = components['schemas']['CostRegistryRowDto'];
export type CostState = 'off' | 'on' | 'auto';

export const COST_STATE_WORD: Record<CostState, string> = { off: 'Выкл', on: 'Вкл', auto: 'Авто' };

export const COST_KIND_TITLE: Record<string, string> = {
  aws: 'AWS (серверы, база, сеть, хранение)',
  vendor: 'Сторонние сервисы',
  sdk: 'Приложения, аккаунты и пакеты',
  ci: 'Сборка и проверки',
};

export const COST_NEEDED_WORD: Record<string, string> = {
  yes: 'Нужно сейчас',
  auto: 'Нужно, растёт само',
  later: 'Пока не нужно',
  no: 'Не нужно',
};

/** «≈ 18», «110–200», «0». */
export function usdRange(r: number[] | null | undefined): string {
  if (!r || r.length === 0) return '—';
  const f = (n: number) => n.toLocaleString('ru-RU', { maximumFractionDigits: 2 });
  return r[0] === r[1] ? `$${f(r[0])}` : `$${f(r[0])}–${f(r[1])}`;
}

/** Day-1 lines: not switched off by default and with a price above zero. */
export function dayOneRows(rows: CostRegistryRow[]): CostRegistryRow[] {
  return rows.filter((r) => r.defaultState !== 'off' && (r.usdLaunch[1] ?? 0) > 0);
}

/** Things the owner may switch on later (off by default, a price when on). */
export function switchableRows(rows: CostRegistryRow[]): CostRegistryRow[] {
  return rows.filter((r) => r.defaultState === 'off' && r.ifOnUsd != null);
}

/** Things that switch themselves on a signal (Авто is a position). */
export function autoRows(rows: CostRegistryRow[]): CostRegistryRow[] {
  return rows.filter((r) => r.states.includes('auto') && r.defaultState === 'auto');
}

export function groupByKind(rows: CostRegistryRow[]): [string, CostRegistryRow[]][] {
  const out = new Map<string, CostRegistryRow[]>();
  for (const r of rows) out.set(r.kind, [...(out.get(r.kind) ?? []), r]);
  return ['aws', 'vendor', 'sdk', 'ci'].filter((k) => out.has(k)).map((k) => [k, out.get(k)!]);
}

export function usersWord(n: number): string {
  return n >= 1_000_000 ? `${n / 1_000_000} млн` : n >= 1000 ? `${n / 1000} тыс.` : String(n);
}
