import { Badge, type Tone } from '@/components/ui/card';

/**
 * Owner 2026-10-05 — Russian texts of attorney trust levels
 * (apps/api/src/modules/attorney-trust, docs/ATTORNEY_TRUST.md). The level
 * only grows with checks LawBid did not take the attorney's word for.
 */
export const TRUST_LEVELS = [0, 1, 2, 3] as const;

export const TRUST_LEVEL_RU: Record<number, { short: string; long: string; hint: string }> = {
  0: {
    short: 'Заявлен',
    long: '0 — Заявлен',
    hint: 'Только присяга адвоката: штат и номер лицензии со слов.',
  },
  1: {
    short: 'Реестр',
    long: '1 — Реестр',
    hint: 'Номер лицензии совпал с реестром штата или подтверждён сотрудником.',
  },
  2: {
    short: 'Личность',
    long: '2 — Личность',
    hint: 'Stripe KYC: юридическое имя совпало с профилем / реестром, либо подтверждена связь с фирмой.',
  },
  3: {
    short: 'Документы',
    long: '3 — Документы',
    hint: 'Сотрудник проверил карточку адвоката и удостоверение, плюс личность по Stripe.',
  },
};

export function trustLevelLabel(level: number | null | undefined): string {
  if (level == null) return '—';
  return TRUST_LEVEL_RU[level]?.long ?? `Ур. ${level}`;
}

export function trustLevelTone(level: number | null | undefined): Tone {
  switch (level) {
    case 3:
      return 'success';
    case 2:
      return 'info';
    case 1:
      return 'gold';
    default:
      return 'neutral';
  }
}

/** Small chip «Ур. N · Название» for lists and cards. */
export function TrustLevelChip({ level, long }: { level: number | null | undefined; long?: boolean }) {
  if (level == null) return <span className="text-faint">—</span>;
  const t = TRUST_LEVEL_RU[level];
  return (
    <Badge tone={trustLevelTone(level)} dot>
      {long ? trustLevelLabel(level) : `Ур. ${level}${t ? ` · ${t.short}` : ''}`}
    </Badge>
  );
}

/** `payments_hold` / `bids_hold` codes. */
export const HOLD_RU: Record<string, string> = {
  complaint: 'Жалоба клиента',
  name_mismatch: 'Имя в Stripe не совпало',
  duplicate_claim: 'Номер заявлен другим адвокатом',
  admin: 'Поставлен администратором',
};

export const NAME_CHECK_RU: Record<string, { text: string; tone: Tone }> = {
  match: { text: 'Совпало', tone: 'success' },
  mismatch: { text: 'Не совпало', tone: 'danger' },
  unknown: { text: 'Не проверялось', tone: 'neutral' },
};

export const FIRM_LINK_STATUS_RU: Record<string, { text: string; tone: Tone }> = {
  none: { text: 'Не требуется', tone: 'neutral' },
  pending: { text: 'Нужно подтвердить', tone: 'warning' },
  confirmed: { text: 'Подтверждена', tone: 'success' },
};

export const FIRM_LINK_SOURCE_RU: Record<string, string> = {
  registry: 'по реестру штата',
  email: 'по e-mail на домене фирмы',
  staff: 'сотрудником',
};

export const LICENSE_CONFIRMED_BY_RU: Record<string, string> = {
  registry: 'реестр штата',
  staff: 'сотрудник',
};

export const BUSINESS_TYPE_RU: Record<string, string> = {
  individual: 'физлицо',
  company: 'компания',
  non_profit: 'некоммерческая организация',
  government_entity: 'госорган',
};

export const TRUST_EVENT_RU: Record<string, string> = {
  level_changed: 'Уровень изменён',
  license_confirmed: 'Лицензия подтверждена',
  license_unconfirmed: 'Подтверждение лицензии снято',
  documents_verified: 'Документы проверены',
  stripe_kyc: 'Stripe KYC',
  name_check: 'Сверка имени',
  hold: 'Холд',
  release: 'Холд снят',
  complaint: 'Жалоба',
  auto_suspended: 'Автоприостановка',
  duplicate_claim: 'Номер заявлен другим',
  duplicate_claim_made: 'Заявил чужой номер',
  payout_delay: 'Задержка выплат',
  firm_link: 'Связь с фирмой',
  firm_email: 'E-mail фирмы',
};

export const TRUST_ACTOR_RU: Record<string, string> = {
  system: 'система',
  admin: 'администратор',
  attorney: 'адвокат',
  client: 'клиент',
  stripe: 'Stripe',
};

export const GATE_REASON_RU: Record<string, string> = {
  level: 'не хватает уровня',
  hold: 'холд',
  suspended: 'профиль приостановлен',
};

export function attorneyName(a: { firstName: string | null; lastName: string | null; username: string }): string {
  return [a.firstName, a.lastName].filter(Boolean).join(' ') || `@${a.username}`;
}

/** Compact one-line text of an event's `details`. */
export function eventDetails(d: Record<string, unknown>): string {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(d)) {
    if (v == null || v === '' || typeof v === 'object') continue;
    const key = DETAIL_KEY_RU[k] ?? k;
    const val = typeof v === 'string' ? (DETAIL_VALUE_RU[v] ?? v) : String(v);
    parts.push(`${key}: ${val}`);
  }
  return parts.join(' · ');
}

const DETAIL_KEY_RU: Record<string, string> = {
  note: 'заметка',
  reason: 'причина',
  code: 'код',
  by: 'кем',
  source: 'источник',
  payments: 'платежи',
  bids: 'ставки',
  result: 'результат',
  stripeName: 'имя в Stripe',
  profileName: 'имя в профиле',
  registryName: 'имя в реестре',
  days: 'дней',
  domain: 'домен',
  complaints: 'жалоб',
  stateCode: 'штат',
  barNumber: 'номер',
  businessType: 'тип аккаунта',
  companyName: 'компания',
};

const DETAIL_VALUE_RU: Record<string, string> = {
  ...HOLD_RU,
  ...FIRM_LINK_SOURCE_RU,
  true: 'да',
  false: 'нет',
  match: 'совпало',
  mismatch: 'не совпало',
  unknown: 'неизвестно',
  registry: 'реестр',
  staff: 'сотрудник',
  email: 'e-mail',
};
