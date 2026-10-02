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

// ---- Added by the legacy-pages restyle (append-only) ----

export const REJECTION_CODE: Record<string, string> = {
  license_not_found: 'лицензия не найдена',
  license_inactive: 'лицензия неактивна',
  name_mismatch: 'имя не совпадает',
  document_unreadable: 'документ нечитаем',
  document_expired: 'документ просрочен',
  selfie_mismatch: 'селфи не совпадает',
  suspected_fraud: 'подозрение на мошенничество',
  incomplete_submission: 'неполная заявка',
  other: 'другое',
};

/** Object types the moderation queue / card API accept (no sticker packs there). */
export const MODERATION_TARGET_TYPES = [
  'post',
  'comment',
  'case_comment',
  'message',
  'user',
  'case',
  'review',
  'client_review',
] as const;
export type ModerationTargetType = (typeof MODERATION_TARGET_TYPES)[number];

/** Status of a reported object: content, user account or case. */
export const TARGET_STATUS: Record<string, string> = {
  ...CASE_STATUS,
  ...STATUS_LABEL,
  ...CONTENT_STATUS,
};

/** app_config value types (admin-config.dto ConfigValueType). */
export const CONFIG_TYPE: Record<string, string> = {
  integer: 'целое число',
  number: 'число',
  boolean: 'да / нет',
  string: 'строка',
  'string[]': 'список строк',
  'integer[]': 'список чисел',
};

/** Audit-log action names written by the API services (grep `action:` in apps/api/src). */
export const AUDIT_ACTION: Record<string, string> = {
  'admin.login': 'Вход в панель',
  'admin.logout': 'Выход из панели',
  'admin.recovery_code_used': 'Вход по резервному коду',
  'admin.totp_enrolled': 'Привязан аутентификатор',
  'admins.create': 'Создан администратор',
  'admins.disable': 'Администратор отключён',
  'admins.enable': 'Администратор включён',
  'admins.set_role': 'Смена роли администратора',
  'admins.reset_2fa': 'Сброс 2FA администратора',
  'users.warn': 'Предупреждение пользователю',
  'users.suspend': 'Пользователь приостановлен',
  'users.restore': 'Пользователь восстановлен',
  'users.sessions_revoked': 'Сессии пользователя отозваны',
  'users.phone_changed': 'Смена телефона пользователя',
  'verification.take': 'Заявка взята в работу',
  'verification.approve': 'Верификация одобрена',
  'verification.reject': 'Верификация отклонена',
  'verification.request_info': 'Запрошена информация',
  'verification.license_decision': 'Решение по лицензии',
  'verification.license_recheck': 'Перепроверка лицензии',
  'verification.document_view': 'Просмотр документа',
  'verification.suspend': 'Адвокат приостановлен',
  'verification.restore': 'Адвокат восстановлен',
  'case_dispute.resolve': 'Решение по спору',
  'contact_issue.resolve': 'Решение по «Не могу связаться»',
  'client.suspend': 'Клиент приостановлен (жалобы)',
  'admin.case.archive': 'Кейс в архив',
  'admin.case.close': 'Кейс закрыт',
  'admin.case.hide': 'Кейс скрыт',
  'admin.case.restore': 'Кейс восстановлен',
  'admin.post.restore': 'Публикация восстановлена',
  'admin.comment.restore': 'Комментарий восстановлен',
  'admin.review_appeal.decide': 'Решение по обжалованию отзыва',
  'admin.team.member_remove': 'Помощник удалён из команды',
  'admin.video.takedown': 'Видео снято',
  'admin.sticker_pack.create': 'Создан набор стикеров',
  'admin.sticker_pack.hide': 'Набор стикеров скрыт',
  'admin.sticker_pack.unhide': 'Набор стикеров показан',
  'admin.sticker.add': 'Стикер добавлен',
  'admin.sticker.remove': 'Стикер удалён',
  'config.app_config': 'Изменена настройка',
  'config.flag': 'Изменена функция (флаг)',
  'config.language': 'Изменён язык',
  'legal.create': 'Создан юр. документ',
  'legal.publish': 'Опубликован юр. документ',
  'data_request.create': 'Зарегистрирован запрос госоргана',
  'data_request.package': 'Подготовлен пакет данных',
  'data_request.status': 'Статус запроса госоргана',
  'attorney.practice_areas.replace': 'Изменены квалификации адвоката',
  'subscription.extend': 'Подписка продлена',
  'billing.refund.create': 'Возврат платежа',
  'billing.promo_code.create': 'Создан промокод',
  'billing.promo_code.update': 'Изменён промокод',
  'billing.contract_grant.create': 'Выдан доступ по договору',
  'billing.contract_grant.extend': 'Продлён доступ по договору',
  'billing.contract_grant.revoke': 'Отозван доступ по договору',
  'promotions.grant': 'Продвижение выдано',
  'promotions.extend': 'Продвижение продлено',
  'promotions.cancel': 'Продвижение отменено',
  'promotions.settings': 'Настройки продвижения',
  'referrals.qualify': 'Реферал: условие выполнено',
  'referrals.reward': 'Реферал: награда выдана',
  'referrals.reject': 'Реферал отклонён',
  'referrals.settings': 'Настройки рефералов',
  'review.hide': 'Отзыв скрыт',
  'review.restore': 'Отзыв показан',
  'review.remove': 'Отзыв удалён',
};

/** audit_log.target_type values (service rows + the auto-audit route segment). */
export const AUDIT_TARGET: Record<string, string> = {
  admin: 'администратор',
  admins: 'администраторы',
  app_config: 'настройка',
  config: 'настройка',
  assistant_membership: 'помощник',
  teams: 'команда',
  attorney_license: 'лицензия',
  attorney_profile: 'профиль адвоката',
  case: 'кейс',
  cases: 'кейс',
  case_dispute: 'спор',
  case_disputes: 'спор',
  case_promotion: 'продвижение кейса',
  promotions: 'продвижение',
  contact_issue_report: '«Не могу связаться»',
  contact_issues: '«Не могу связаться»',
  contract_grant: 'доступ по договору',
  data_access_request: 'запрос госоргана',
  data_requests: 'запрос госоргана',
  export: 'выгрузка CSV',
  feature_flag: 'функция (флаг)',
  feature_flags: 'функция (флаг)',
  integration: 'ключи сервиса',
  integrations: 'ключи сервиса',
  legal_document: 'юр. документ',
  legal_documents: 'юр. документ',
  payment: 'платёж',
  billing: 'оплата',
  promo_code: 'промокод',
  referral: 'реферал',
  referrals: 'реферал',
  review_appeal: 'обжалование отзыва',
  review_appeals: 'обжалование отзыва',
  sticker_pack: 'набор стикеров',
  subscription: 'подписка',
  user: 'пользователь',
  users: 'пользователь',
  verification: 'верификация',
  verification_document: 'документ верификации',
  verification_request: 'заявка на верификацию',
  video_asset: 'видео',
  moderation: 'модерация',
  content: 'контент',
  practice_areas: 'квалификация',
  i18n: 'локализация',
  broadcasts: 'рассылка',
  support: 'поддержка',
  auth: 'вход',
  post: 'публикация',
  comment: 'комментарий',
  case_comment: 'комментарий к кейсу',
  review: 'отзыв',
  client_review: 'отзыв о клиенте',
  message: 'сообщение',
};

const HTTP_VERB: Record<string, string> = {
  get: 'Просмотр',
  post: 'Действие',
  patch: 'Изменение',
  put: 'Изменение',
  delete: 'Удаление',
};

/**
 * Russian text for an audit action. Service rows use dotted names (map
 * above); the generic interceptor writes `admin.<method> admin/<route>`.
 */
export function auditActionLabel(action: string): string {
  if (AUDIT_ACTION[action]) return AUDIT_ACTION[action];
  const exp = /^admin\.export\.(.+)$/.exec(action);
  if (exp) return `Выгрузка CSV: ${AUDIT_TARGET[exp[1]] ?? exp[1]}`;
  const restore = /^admin\.(\w+)\.restore$/.exec(action);
  if (restore) return `Восстановлено: ${AUDIT_TARGET[restore[1]] ?? restore[1]}`;
  const mod = /^moderation\.(\w+)$/.exec(action);
  if (mod) return `Модерация: ${(MOD_ACTION[mod[1]] ?? mod[1]).toLowerCase()}`;
  const http = /^admin\.(get|post|patch|put|delete) admin\/([^/\s]+)(.*)$/.exec(action);
  if (http) {
    const section = AUDIT_TARGET[http[2].replace(/-/g, '_')] ?? http[2];
    const tail = http[3]
      .split('/')
      .filter((s) => s && !s.startsWith(':'))
      .pop();
    return `${HTTP_VERB[http[1]] ?? http[1]}: ${section}${tail ? ` · ${tail.replace(/[-_]/g, ' ')}` : ''}`;
  }
  return action;
}
