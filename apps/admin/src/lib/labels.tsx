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
  review: 'Отзыв',
};

export const REPORT_REASON: Record<string, string> = {
  spam: 'спам',
  abuse: 'оскорбления',
  misinformation: 'дезинформация',
  impersonation: 'выдача себя за другого',
  inappropriate: 'неприемлемое',
  other: 'другое',
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
