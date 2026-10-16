import type { components } from '@/lib/api/schema';

/** The «Экономика» card payload (API: AdminEconomyController). */
export type Economy = components['schemas']['EconomyReportDto'];

export function usd(n: number): string {
  return `$${n.toLocaleString('ru-RU', { maximumFractionDigits: 2, minimumFractionDigits: n % 1 === 0 ? 0 : 2 })}`;
}

const LINES: Record<string, { title: string; hint: string }> = {
  aws: { title: 'AWS (серверы, база, трафик)', hint: 'счёт за месяц из бюджета AWS' },
  sms: { title: 'SMS (Twilio)', hint: 'коды входа и сброса пароля × цена за SMS' },
  video: { title: 'Видео (Bunny)', hint: 'загрузки роликов × цена за загрузку' },
  translate: { title: 'Переводы (Google)', hint: 'переводы сообщений × цена за перевод' },
};

export function economyLine(key: string): { title: string; hint: string } {
  return LINES[key] ?? { title: key, hint: '' };
}
