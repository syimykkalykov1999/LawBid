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
