/** Owner 2026-10-22: the words of the on-call alerts (push + e-mail). The
 * recipients are the team, so Russian and English are enough; the admin
 * panel itself is Russian. */
export type IncidentEventKind = 'opened' | 'reminder' | 'resolved';

const NAMES: Record<string, { ru: string; en: string }> = {
  worker: { ru: 'Фоновый сервер (worker)', en: 'Background worker' },
  database: { ru: 'База данных', en: 'Database' },
  redis: { ru: 'Redis (кэш и очереди)', en: 'Redis (cache and queues)' },
  queues: { ru: 'Очереди задач', en: 'Job queues' },
  stripe_webhooks: { ru: 'Платежи Stripe (вебхуки)', en: 'Stripe webhooks' },
  push: { ru: 'Доставка пушей', en: 'Push delivery' },
  turn: { ru: 'TURN-сервер звонков', en: 'TURN call relay' },
  cloudflare_turn: {
    ru: 'Звонки: Cloudflare TURN',
    en: 'Calls: Cloudflare TURN',
  },
  cloudflare_sfu: {
    ru: 'Групповые звонки: Cloudflare SFU',
    en: 'Group calls: Cloudflare SFU',
  },
  r2: { ru: 'Фото и медиа: Cloudflare R2', en: 'Media: Cloudflare R2' },
  http: { ru: 'Ошибки и скорость API', en: 'API errors and speed' },
};

export function componentName(key: string, lang: 'ru' | 'en'): string {
  return NAMES[key]?.[lang] ?? key;
}

export function incidentTitle(
  component: string,
  kind: IncidentEventKind,
  lang: 'ru' | 'en',
): string {
  const name = componentName(component, lang);
  if (lang === 'ru') {
    return kind === 'resolved'
      ? `Восстановлено: ${name}`
      : kind === 'reminder'
        ? `Всё ещё не работает: ${name}`
        : `Сбой: ${name}`;
  }
  return kind === 'resolved'
    ? `Resolved: ${name}`
    : kind === 'reminder'
      ? `Still down: ${name}`
      : `Incident: ${name}`;
}

/** One plain sentence with the numbers that matter. */
export function incidentBody(
  detail: Record<string, unknown>,
  kind: IncidentEventKind,
  lang: 'ru' | 'en',
  openedAt: Date,
  now: Date,
): string {
  const min = Math.max(
    0,
    Math.round((now.getTime() - openedAt.getTime()) / 60_000),
  );
  const err = typeof detail.error === 'string' ? detail.error : null;
  const bits: string[] = [];
  if (err) bits.push(err);
  for (const [k, v] of Object.entries(detail)) {
    if (k === 'error') continue;
    if (
      typeof v !== 'string' &&
      typeof v !== 'number' &&
      typeof v !== 'boolean'
    )
      continue;
    if (bits.length >= 4) break;
    bits.push(`${k}: ${v}`);
  }
  const facts = bits.join(', ');
  if (lang === 'ru') {
    if (kind === 'resolved') return `Снова в норме. Сбой длился ${min} мин.`;
    const base =
      kind === 'reminder'
        ? `Сбой длится ${min} мин.`
        : 'Проверка не прошла дважды подряд.';
    return facts ? `${base} ${facts}` : base;
  }
  if (kind === 'resolved') return `Back to normal after ${min} min.`;
  const base =
    kind === 'reminder'
      ? `Open for ${min} min.`
      : 'Failed two checks in a row.';
  return facts ? `${base} ${facts}` : base;
}
