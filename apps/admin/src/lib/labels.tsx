import { Badge, type Tone } from '@/components/ui/card';

/** Russian labels for API enums shared by the users and verification pages. */
export const STATUS_LABEL: Record<string, string> = {
  active: 'активен',
  suspended: 'приостановлен',
  deletion_pending: 'удаляется',
  deleted: 'удалён',
};

export const ROLE_TEXT: Record<string, string> = {
  client: 'Клиент',
  attorney: 'Адвокат',
  admin: 'Админ',
  assistant: 'Помощник',
};

export const REQUEST_STATUS: Record<string, string> = {
  draft: 'черновик',
  submitted: 'подана',
  in_review: 'в работе',
  needs_more_info: 'нужна информация',
  approved: 'одобрена',
  rejected: 'отклонена',
};

export const TARGET_TYPE: Record<string, string> = {
  post: 'Пост',
  comment: 'Комментарий',
  message: 'Сообщение',
  user: 'Пользователь',
  case: 'Кейс',
  review: 'Отзыв об адвокате',
  client_review: 'Отзыв о клиенте / помощнике',
  case_comment: 'Комментарий к кейсу',
  sticker_pack: 'Набор стикеров',
};

export const REPORT_REASON: Record<string, string> = {
  spam: 'спам',
  abuse: 'оскорбления',
  misinformation: 'дезинформация',
  impersonation: 'выдача себя за другого',
  inappropriate: 'неприемлемое',
  other: 'другое',
  // Owner 2026-10-01: Google's review policy categories.
  off_topic: 'не по теме',
  conflict_of_interest: 'конфликт интересов',
  profanity: 'нецензурная лексика',
  harassment: 'травля или оскорбления',
  hate_speech: 'дискриминация / разжигание ненависти',
  personal_info: 'личные данные',
};

export const MOD_ACTION: Record<string, string> = {
  hide: 'Скрыть',
  remove: 'Удалить',
  warn: 'Предупредить автора',
  suspend: 'Приостановить пользователя',
  restore: 'Восстановить',
  dismiss: 'Отклонить жалобу',
};

export const CONTENT_STATUS: Record<string, string> = {
  published: 'опубликован',
  hidden: 'скрыт',
  removed: 'удалён',
  processing: 'обрабатывается',
};

export const CASE_STATUS: Record<string, string> = {
  open: 'открыт',
  in_progress: 'в работе',
  pending_completion: 'ожидает подтверждения',
  disputed: 'спор',
  closed: 'закрыт',
  archived: 'в архиве',
};

export const JOURNAL_EVENT: Record<string, string> = {
  created: 'кейс создан',
  updated: 'кейс изменён',
  bid_placed: 'бид отправлен',
  offer_made: 'встречное предложение',
  bid_accepted: 'бид принят',
  bid_rejected: 'бид отклонён',
  bid_withdrawn: 'бид отозван',
  negotiation_failed: 'переговоры не удались',
  contacts_disclosed: 'контакты раскрыты',
  completion_requested: 'запрошено завершение',
  completion_confirmed: 'завершение подтверждено',
  auto_closed: 'закрыт автоматически',
  disputed: 'открыт спор',
  dispute_resolved: 'спор решён',
  archived: 'в архив',
  restored: 'восстановлен',
  deleted: 'удалён',
  closed: 'закрыт',
};

export const ISSUE_TYPE: Record<string, string> = {
  phone_invalid: 'номер недействителен',
  no_answer: 'не отвечает',
  email_bounce: 'письмо не доставлено',
  wrong_person: 'другой человек',
  other: 'другое',
};

export const DATA_REQUEST_STATUS: Record<string, string> = {
  received: 'получен',
  in_progress: 'в работе',
  fulfilled: 'исполнен',
  rejected: 'отклонён',
};

export function partyName(p: { firstName: string | null; lastName: string | null; username?: string | null; id: string } | null): string {
  if (!p) return '—';
  return [p.firstName, p.lastName].filter(Boolean).join(' ') || (p.username ? `@${p.username}` : p.id.slice(0, 8));
}

export function StatusBadge({ status }: { status: string }) {
  return (
    <Badge tone={status === 'deletion_pending' ? 'warning' : toneFor(status)} dot>
      {STATUS_LABEL[status] ?? status}
    </Badge>
  );
}

/** Small helper: a Russian label or the raw value as a last resort. */
export function label(map: Record<string, string>, v: string | null | undefined): string {
  if (!v) return '—';
  return map[v] ?? v;
}

export const VERIFICATION_STATUS: Record<string, string> = {
  unverified: 'не верифицирован',
  pending: 'на проверке',
  verified: 'верифицирован',
  rejected: 'отклонён',
  suspended: 'приостановлен',
};

export const LICENSE_STATUS: Record<string, string> = {
  pending: 'на проверке',
  verified: 'подтверждена',
  rejected: 'отклонена',
  expired: 'истекла',
  suspended: 'приостановлена',
};

export const VERIFICATION_PROVIDER: Record<string, string> = {
  manual: 'вручную',
  stripe_identity: 'Stripe Identity',
  persona: 'Persona',
};

export const CHECK_TYPE: Record<string, string> = {
  bar_lookup: 'проверка в реестре адвокатов',
  id_check: 'проверка документа',
  face_match: 'сверка лица',
};

export const CHECK_RESULT: Record<string, string> = {
  pass: 'пройдена',
  fail: 'не пройдена',
  manual_review: 'нужна ручная проверка',
};

export const BID_STATUS: Record<string, string> = {
  active: 'активна',
  accepted: 'принята',
  rejected_by_client: 'отклонена клиентом',
  rejected_auto: 'отклонена автоматически',
  withdrawn: 'отозвана',
  failed_negotiation: 'переговоры не удались',
};

export const FEE_TYPE: Record<string, string> = {
  fixed: 'фикс',
  hourly: 'почасово',
  free_consultation: 'бесплатная консультация',
};

export const SUBSCRIPTION_STATUS: Record<string, string> = {
  incomplete: 'не подтверждена',
  trialing: 'пробный период',
  active: 'активна',
  past_due: 'просрочена',
  canceled: 'отменена',
  expired: 'истекла',
};

export const PLAN: Record<string, string> = {
  monthly: 'месячный',
  yearly: 'годовой',
};

export const PAYMENT_STATUS: Record<string, string> = {
  pending: 'в обработке',
  succeeded: 'оплачен',
  failed: 'ошибка',
  refunded: 'возвращён',
};

export const REPORT_STATUS: Record<string, string> = {
  open: 'открыта',
  actioned: 'приняты меры',
  dismissed: 'отклонена',
};

export const PARTY_ROLE: Record<string, string> = {
  client: 'клиент',
  attorney: 'адвокат',
  admin: 'администратор',
  system: 'система',
};

export const CONTACT_ISSUE_STATUS: Record<string, string> = {
  open: 'открыта',
  confirmed: 'подтверждена',
  rejected: 'отклонена',
};

export const LEGAL_DOC_TYPE: Record<string, string> = {
  terms: 'Условия использования',
  privacy: 'Политика конфиденциальности',
  disclaimer: 'Отказ от ответственности',
  client_contact_sharing: 'Согласие на передачу контактов',
};

export const DATA_REQUEST_TYPE: Record<string, string> = {
  subpoena: 'повестка (subpoena)',
  court_order: 'решение суда',
};

export const DOC_TYPE: Record<string, string> = {
  bar_license: 'лицензия адвоката',
  drivers_license: 'водительские права',
  passport: 'паспорт',
  state_id: 'ID штата',
  selfie: 'селфи',
  other: 'другое',
};

export const TICKET_STATUS: Record<string, string> = {
  open: 'открыто',
  waiting_user: 'ждём пользователя',
  resolved: 'решено',
  closed: 'закрыто',
};

export const TICKET_CATEGORY: Record<string, string> = {
  account: 'аккаунт',
  billing: 'оплата',
  verification: 'верификация',
  case: 'кейс',
  bug: 'ошибка в приложении',
  abuse: 'жалоба',
  other: 'другое',
};

export const PRIORITY: Record<string, string> = {
  low: 'низкий',
  normal: 'обычный',
  high: 'высокий',
  urgent: 'срочно',
};

export const PROMOTION_STATUS: Record<string, string> = {
  pending_payment: 'ждёт оплаты',
  active: 'идёт',
  finished: 'завершено',
  canceled: 'отменено',
  refunded: 'возвращено',
};

export const REFERRAL_STATUS: Record<string, string> = {
  pending: 'ждёт условия',
  qualified: 'условие выполнено',
  rewarded: 'награда выдана',
  rejected: 'отклонён',
};

export const VIDEO_STATUS: Record<string, string> = {
  awaiting_upload: 'ждёт загрузки',
  uploading: 'загружается',
  processing: 'обрабатывается',
  ready: 'готово',
  failed: 'ошибка',
  deleted: 'удалено',
};

/** Badge tone for common statuses. */
export function toneFor(status: string | null | undefined): Tone {
  switch (status) {
    case 'active':
    case 'verified':
    case 'published':
    case 'succeeded':
    case 'accepted':
    case 'approved':
    case 'pass':
    case 'resolved':
    case 'rewarded':
    case 'ready':
    case 'fulfilled':
      return 'success';
    case 'trialing':
    case 'qualified':
    case 'in_progress':
    case 'in_review':
    case 'processing':
    case 'waiting_user':
    case 'submitted':
      return 'info';
    case 'pending':
    case 'past_due':
    case 'needs_more_info':
    case 'open':
    case 'pending_payment':
    case 'manual_review':
    case 'hidden':
    case 'disputed':
      return 'warning';
    case 'suspended':
    case 'rejected':
    case 'removed':
    case 'failed':
    case 'fail':
    case 'canceled':
    case 'expired':
    case 'deleted':
    case 'refunded':
      return 'danger';
    default:
      return 'neutral';
  }
}

export function StatusPill({ map, value }: { map: Record<string, string>; value: string | null | undefined }) {
  if (!value) return <span className="text-faint">—</span>;
  return (
    <Badge tone={toneFor(value)} dot>
      {map[value] ?? value}
    </Badge>
  );
}

export function usd(cents: number | null | undefined, digits = 0): string {
  if (cents == null) return '—';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(cents / 100);
}
