import { Badge } from '@/components/ui/card';

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
    <Badge
      tone={
        status === 'active'
          ? 'success'
          : status === 'suspended'
            ? 'danger'
            : 'neutral'
      }
    >
      {STATUS_LABEL[status] ?? status}
    </Badge>
  );
}
