'use client';

import { ChatCircleDots } from '@phosphor-icons/react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { ErrorNote } from '@/components/page-header';
import { Badge, Card } from '@/components/ui/card';
import { EmptyState, Skeleton } from '@/components/ui/empty';
import { api, errorText } from '@/lib/api/client';
import { formatDateTime } from '@/lib/utils';
import type { DeskSettingsView } from '@/lib/desk-data';
import { livePoll } from '@/lib/live';

/**
 * «Чаты»: the dialogs I am answering now — my open tickets, the ones with a
 * new message from the user first. Same list as «Обращения» filtered to me
 * (no new endpoint); the number of dialogs at once comes from the settings.
 */
export function SupportChatsTab({ settings }: { settings: DeskSettingsView }) {
  const q = useQuery({
    queryKey: ['desk-support-chats'],
    queryFn: async () =>
      (await api.GET('/admin/support/tickets', { params: { query: { status: 'open', assignee: 'me' } } })).data!.data,
    refetchInterval: livePoll(),
  });
  const rows = [...(q.data ?? [])].sort((a, b) => Number(b.unreadByAdmin) - Number(a.unreadByAdmin));
  const cap = settings.num('staff.lease.chat_capacity');
  return (
    <div className="space-y-3">
      <ErrorNote text={q.error ? errorText(q.error) : null} />
      <Card className="p-4 text-sm text-muted">
        Одновременно в работе: <span className="font-semibold text-heading tabular-nums">{rows.length}</span> из {cap}.
      </Card>
      {q.isPending ? (
        <Skeleton className="h-24 w-full" />
      ) : rows.length === 0 ? (
        <EmptyState icon={ChatCircleDots} title="Открытых диалогов нет" text="Откройте вкладку «Обращения» и нажмите «Следующий»." />
      ) : (
        rows.map((r) => (
          <Card key={r.id} className="flex flex-wrap items-center gap-3 p-4">
            <div className="min-w-0 flex-1">
              <Link href={`/support/${r.id}`} className="font-medium text-heading hover:underline">
                {r.subject}
              </Link>
              <div className="text-xs text-faint">Последнее сообщение: {formatDateTime(r.lastMessageAt)}</div>
            </div>
            {r.unreadByAdmin ? <Badge tone="gold">новое сообщение</Badge> : null}
            {r.slaBreached ? <Badge tone="danger">просрочено</Badge> : null}
          </Card>
        ))
      )}
    </div>
  );
}
