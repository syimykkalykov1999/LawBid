import { Badge, type Tone } from '@/components/ui/card';

/**
 * Owner 2026-10-05 — Russian texts of «Борьба с мошенниками»
 * (apps/api/src/modules/attorney-trust, docs/ATTORNEY_TRUST.md). The owner
 * picks what to require of an attorney; what can be checked automatically is,
 * the rest waits for a person in the staff queue; «Подтвердить» ends the
 * checks for good.
 */
export const TRUST_LEVELS = [0, 1, 2, 3] as const;

export const TRUST_LEVEL_RU: Record<number, { short: string; long: string; hint: string }> = {
  0: { short: 'Заявлен', long: '0 — Заявлен', hint: 'Только присяга адвоката: штат и номер лицензии со слов.' },
  1: { short: 'Реестр', long: '1 — Реестр', hint: 'Номер лицензии совпал с реестром штата или подтверждён сотрудником.' },
  2: {
    short: 'Личность',
    long: '2 — Личность',
    hint: 'Stripe KYC: юридическое имя совпало с профилем / реестром, либо подтверждена связь с фирмой.',
  },
  3: { short: 'Документы', long: '3 — Документы', hint: 'Сотрудник проверил карточку адвоката и удостоверение, плюс личность по Stripe.' },
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

/** `AdminTrustCardDto.staffStatus`. */
export const STAFF_STATUS_RU: Record<string, { text: string; tone: Tone }> = {
  self_declared: { text: 'Заявлен', tone: 'neutral' },
  needs_staff: { text: 'На проверке', tone: 'warning' },
  cleared: { text: 'Подтверждён', tone: 'success' },
  suspended: { text: 'Приостановлен', tone: 'danger' },
};

/**
 * `badgeStatus` — the one status the owner manages in «Адвокаты» (what the
 * blue check means right now), in enum order.
 */
export const BADGE_STATUSES = [
  'not_verified',
  'self_declared',
  'registry_matched',
  'pending_review',
  'documents_requested',
  'cleared',
  'rejected',
  'suspended',
] as const;
export type BadgeStatus = (typeof BADGE_STATUSES)[number];

export const BADGE_STATUS_RU: Record<BadgeStatus, { text: string; hint: string }> = {
  not_verified: { text: 'Не проверено', hint: 'Адвокат ещё не назвал штат и номер лицензии.' },
  self_declared: { text: 'Указано адвокатом', hint: 'Штат и номер со слов адвоката, под присягой; проверки ещё идут.' },
  registry_matched: { text: 'Сверено с реестром', hint: 'Номер лицензии совпал с реестром штата.' },
  pending_review: { text: 'В ожидании проверки', hint: 'Ждёт сотрудника в очереди.' },
  documents_requested: { text: 'Документы запрошены', hint: 'Сотрудник запросил документы, адвокат ещё не загрузил.' },
  cleared: { text: 'Проверено', hint: 'Подтверждён: галочка и приём денег открыты насовсем.' },
  rejected: { text: 'Отклонено', hint: 'Отклонён сотрудником, аккаунт приостановлен.' },
  suspended: { text: 'Приостановлено', hint: 'Профиль приостановлен — по жалобам или администратором.' },
};

export function badgeStatusTone(status: string | null | undefined): Tone {
  switch (status) {
    case 'cleared':
      return 'success';
    case 'registry_matched':
      return 'gold';
    case 'pending_review':
    case 'documents_requested':
      return 'warning';
    case 'rejected':
    case 'suspended':
      return 'danger';
    default:
      return 'neutral';
  }
}

/** Chip with the badge status in Russian (lists, queue, the attorney card). */
export function BadgeStatusChip({ status }: { status: string | null | undefined }) {
  if (!status) return <span className="text-faint">—</span>;
  return (
    <Badge tone={badgeStatusTone(status)} dot>
      {BADGE_STATUS_RU[status as BadgeStatus]?.text ?? status}
    </Badge>
  );
}

/** `TrustSetStatusDto.status` — statuses a person may set by hand. */
export const MANUAL_STATUSES = ['cleared', 'self_declared', 'documents_requested', 'rejected'] as const;
export type ManualStatus = (typeof MANUAL_STATUSES)[number];
export const MANUAL_STATUS_RU: Record<ManualStatus, { text: string; hint: string }> = {
  cleared: { text: 'Проверено (подтвердить)', hint: 'Галочка и приём денег открываются насовсем, перепроверок не будет.' },
  self_declared: { text: 'Указано адвокатом (снять подтверждение)', hint: 'Адвокат снова проходит требования как все.' },
  documents_requested: { text: 'Документы запрошены', hint: 'Адвокат получит запрос документов; ждём загрузки.' },
  rejected: { text: 'Отклонено (приостановить)', hint: 'Аккаунт приостанавливается, ставки отзываются.' },
};

export const CLEARED_BY_RU: Record<string, string> = {
  auto: 'автоматически',
  staff: 'сотрудником',
};

/** Why an attorney waits in the staff queue (`reasons` / `queueReasons`). */
export const QUEUE_REASONS = ['documents', 'firm_link', 'name_mismatch', 'duplicate_claim', 'registry_flag', 'complaint'] as const;
export type QueueReason = (typeof QUEUE_REASONS)[number];
export const QUEUE_REASON_RU: Record<QueueReason, { text: string; tone: Tone }> = {
  documents: { text: 'Документы загружены', tone: 'info' },
  firm_link: { text: 'Связь с фирмой', tone: 'warning' },
  name_mismatch: { text: 'Имя в Stripe не совпало', tone: 'danger' },
  duplicate_claim: { text: 'Номер заявлен дважды', tone: 'danger' },
  registry_flag: { text: 'Расхождение с реестром', tone: 'warning' },
  complaint: { text: 'Жалоба', tone: 'danger' },
};

/** Requirements the owner can switch on (`missing`, `requirements`). */
export const REQUIREMENTS = ['registry', 'identity', 'documents'] as const;
export type Requirement = (typeof REQUIREMENTS)[number];
export const REQUIREMENT_RU: Record<Requirement, { text: string; hint: string }> = {
  registry: { text: 'Реестр', hint: 'номер лицензии совпал с реестром штата или подтверждён сотрудником' },
  identity: { text: 'Личность', hint: 'Stripe KYC на самого адвоката (имя совпало) или подтверждённая связь с фирмой' },
  documents: { text: 'Документы', hint: 'сотрудник сверил удостоверение, селфи и карточку адвоката' },
};

/** `DocumentRequestDto.template`. */
export const DOC_TEMPLATES = ['id_selfie', 'bar_card', 'firm_letter', 'custom'] as const;
export type DocTemplate = (typeof DOC_TEMPLATES)[number];
export const DOC_TEMPLATE_RU: Record<DocTemplate, string> = {
  id_selfie: 'ID + селфи',
  bar_card: 'Bar card',
  firm_letter: 'Письмо на бланке фирмы',
  custom: 'Свой текст',
};

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
  documents_requested: 'Запрошены документы',
  cleared: 'Подтверждён сотрудником',
  uncleared: 'Подтверждение снято',
  rejected: 'Отклонён',
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
  requirements: 'не пройдены требования',
  hold: 'холд',
  suspended: 'профиль приостановлен',
};

export function attorneyName(a: { firstName: string | null; lastName: string | null; username: string }): string {
  return [a.firstName, a.lastName].filter(Boolean).join(' ') || `@${a.username}`;
}

export function staffName(a: { name: string | null; email: string | null; id: string }): string {
  return a.name || a.email || `${a.id.slice(0, 8)}…`;
}

/** «12 с» / «3 мин» / «2 ч 05 мин» for the staff decision pace. */
export function formatSeconds(sec: number | null | undefined): string {
  if (sec == null) return '—';
  const s = Math.round(sec);
  if (s < 60) return `${s} с`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} мин`;
  const h = Math.floor(m / 60);
  return `${h} ч ${String(m % 60).padStart(2, '0')} мин`;
}

/** `details.documentsSeen` of staff events, in Russian. */
export function documentsSeenText(d: Record<string, unknown>, docType: Record<string, string>): string | null {
  const v = d.documentsSeen;
  if (!Array.isArray(v) || v.length === 0) return null;
  return v.map((x) => (typeof x === 'string' ? (docType[x] ?? x) : String(x))).join(', ');
}

/** «Реестр, Документы» from a `missing` list. */
export function missingText(missing: readonly string[]): string {
  return missing.map((m) => REQUIREMENT_RU[m as Requirement]?.text ?? m).join(', ');
}

/** Compact one-line text of an event's `details`. */
export function eventDetails(d: Record<string, unknown>): string {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(d)) {
    if (v == null || v === '' || typeof v === 'object' || k === 'ip' || k === 'documentsSeen') continue;
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
  template: 'шаблон',
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
  clearedBy: 'кем подтверждён',
  adminName: 'сотрудник',
};

const DETAIL_VALUE_RU: Record<string, string> = {
  ...HOLD_RU,
  ...FIRM_LINK_SOURCE_RU,
  ...DOC_TEMPLATE_RU,
  true: 'да',
  false: 'нет',
  match: 'совпало',
  mismatch: 'не совпало',
  unknown: 'неизвестно',
  registry: 'реестр',
  staff: 'сотрудник',
  email: 'e-mail',
  auto: 'автоматически',
};
