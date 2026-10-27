import type { components } from '@/lib/api/schema';

export type PnlReport = components['schemas']['PnlReportDto'];
export type PnlPeriod = components['schemas']['PnlPeriodDto'];

export const KIND_LABEL: Record<string, string> = {
  subscriptions: 'Подписки адвокатов',
  seats: 'Места помощников',
  promotions: 'Продвижение (бусты)',
  client_subscriptions: 'Подписки клиентов',
  stars: 'Звёзды',
  bid_packs: 'Пакеты ставок',
};

/** «Маржа»: profit as a share of revenue; no revenue = no margin. */
export function marginText(m: number | null | undefined): string {
  return m == null ? 'нет дохода' : `${m.toLocaleString('ru-RU', { maximumFractionDigits: 1 })} %`;
}
