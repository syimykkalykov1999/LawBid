'use client';

import { useInfiniteQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { ErrorNote, PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Input, Label } from '@/components/ui/input';
import { Table, Td, Th } from '@/components/ui/table';
import { api, errorText } from '@/lib/api/client';
import { useMe } from '@/lib/hooks';
import { formatDateTime } from '@/lib/utils';

interface Filters {
  adminId: string;
  action: string;
  targetType: string;
  targetId: string;
  from: string;
  to: string;
}

const EMPTY: Filters = {
  adminId: '',
  action: '',
  targetType: '',
  targetId: '',
  from: '',
  to: '',
};

/** docs/06 §2.3 item 12: filters by admin, action, object, dates; every
 * role but super_admin sees only its own rows (enforced server-side). */
export default function AuditLogPage() {
  const { data: me } = useMe();
  const [draft, setDraft] = useState<Filters>(EMPTY);
  const [filters, setFilters] = useState<Filters>(EMPTY);

  const q = useInfiniteQuery({
    queryKey: ['audit-log', filters],
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }) => {
      const res = await api.GET('/admin/audit-log', {
        params: {
          query: {
            cursor: pageParam,
            limit: 50,
            adminId: filters.adminId || undefined,
            action: filters.action || undefined,
            targetType: filters.targetType || undefined,
            targetId: filters.targetId || undefined,
            from: filters.from
              ? new Date(filters.from).toISOString()
              : undefined,
            to: filters.to ? new Date(filters.to).toISOString() : undefined,
          },
        },
      });
      return res.data!;
    },
    getNextPageParam: (last) => last.meta?.nextCursor ?? undefined,
  });
  const rows = q.data?.pages.flatMap((p) => p.data) ?? [];
  const field = (k: keyof Filters, label: string, type = 'text') => (
    <div className="space-y-1">
      <Label htmlFor={`f-${k}`}>{label}</Label>
      <Input
        id={`f-${k}`}
        type={type}
        className="h-9"
        value={draft[k]}
        onChange={(e) => setDraft({ ...draft, [k]: e.target.value })}
      />
    </div>
  );

  return (
    <>
      <PageHeader
        title="Журнал аудита"
        subtitle={
          me?.role === 'super_admin'
            ? 'Все действия администраторов.'
            : 'Ваши действия (полный журнал видит супер-админ).'
        }
      />
      <form
        className="mb-4 grid gap-3 rounded-[var(--radius-lg)] border border-line bg-surface p-4 sm:grid-cols-3 xl:grid-cols-7"
        onSubmit={(e) => {
          e.preventDefault();
          setFilters(draft);
        }}
      >
        {me?.role === 'super_admin'
          ? field('adminId', 'Администратор (id)')
          : null}
        {field('action', 'Действие (префикс)')}
        {field('targetType', 'Тип объекта')}
        {field('targetId', 'Объект (id)')}
        {field('from', 'С', 'datetime-local')}
        {field('to', 'По', 'datetime-local')}
        <div className="flex items-end gap-2">
          <Button type="submit" size="sm">
            Применить
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => {
              setDraft(EMPTY);
              setFilters(EMPTY);
            }}
          >
            Сброс
          </Button>
        </div>
      </form>
      <ErrorNote text={q.error ? errorText(q.error) : null} />
      <Table>
        <thead>
          <tr>
            <Th>Когда</Th>
            <Th>Кто</Th>
            <Th>Действие</Th>
            <Th>Объект</Th>
            <Th>Причина</Th>
            <Th>До / после</Th>
            <Th>IP</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <Td className="whitespace-nowrap">
                {formatDateTime(r.createdAt)}
              </Td>
              <Td className="max-w-48 truncate" title={r.adminId}>
                {r.adminEmail ?? r.adminId}
              </Td>
              <Td className="font-mono text-xs">{r.action}</Td>
              <Td className="font-mono text-xs">
                {r.targetType}
                {r.targetId ? (
                  <div className="text-muted">{r.targetId}</div>
                ) : null}
              </Td>
              <Td className="max-w-64 text-xs">{r.justification ?? ''}</Td>
              <Td className="max-w-80">
                <Json label="до" value={r.before} />
                <Json label="после" value={r.after} />
              </Td>
              <Td className="font-mono text-xs">{r.ip ?? ''}</Td>
            </tr>
          ))}
          {!q.isPending && rows.length === 0 ? (
            <tr>
              <Td colSpan={7} className="py-8 text-center text-muted">
                Записей нет
              </Td>
            </tr>
          ) : null}
        </tbody>
      </Table>
      {q.hasNextPage ? (
        <div className="mt-4 flex justify-center">
          <Button
            variant="outline"
            disabled={q.isFetchingNextPage}
            onClick={() => void q.fetchNextPage()}
          >
            Показать ещё
          </Button>
        </div>
      ) : null}
    </>
  );
}

function Json({ label, value }: { label: string; value: unknown }) {
  if (value == null) return null;
  return (
    <details className="text-xs">
      <summary className="cursor-pointer text-muted">{label}</summary>
      <pre className="mt-1 max-h-40 overflow-auto rounded bg-canvas p-2">
        {JSON.stringify(value, null, 2)}
      </pre>
    </details>
  );
}
