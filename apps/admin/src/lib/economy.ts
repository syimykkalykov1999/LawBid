import type { components } from '@/lib/api/schema';

/** The «Экономика» card payload (API: AdminEconomyController). */
export type Economy = components['schemas']['EconomyReportDto'];

export function usd(n: number): string {
  return `$${n.toLocaleString('ru-RU', { maximumFractionDigits: 2, minimumFractionDigits: n % 1 === 0 ? 0 : 2 })}`;
}

const LINES: Record<string, { title: string; hint: string }> = {
  aws: { title: 'AWS (серверы, база, трафик)', hint: 'счёт за месяц из бюджета AWS' },
  sms: { title: 'SMS (Twilio)', hint: 'счёт Twilio; если он не отвечает — коды × цена за SMS' },
  video: { title: 'Видео (Bunny)', hint: 'счёт Bunny; если он не отвечает — загрузки × цена' },
  translate: { title: 'Переводы (Google)', hint: 'символы × цена Google; если счётчика нет — переводы × цена' },
  id_check: { title: 'Проверка личности (Stripe Identity)', hint: 'проверки × 1,50 $' },
  email: { title: 'Письма (SES)', hint: 'уже входит в счёт AWS, второй раз не прибавляется' },
  image_moderation: { title: 'Проверка картинок (Rekognition)', hint: 'уже входит в счёт AWS, второй раз не прибавляется' },
  cloudflare: { title: 'Cloudflare (звонки, фото)', hint: 'трафик звонков сверх бесплатного и фото R2' },
};

export function economyLine(key: string): { title: string; hint: string } {
  return LINES[key] ?? { title: key, hint: '' };
}
