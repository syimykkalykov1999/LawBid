'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { ErrorNote, PageHeader, SectionTitle } from '@/components/page-header';
import { StepUpDialog } from '@/components/step-up-dialog';
import { Button } from '@/components/ui/button';
import { Badge, Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/empty';
import { Field, Input, Select, Textarea } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';
import { ApiError, api, errorText } from '@/lib/api/client';
import { formatDateTime } from '@/lib/utils';

const COMPONENTS: Record<string, string> = {
  app: 'Приложение',
  chats: 'Чаты',
  calls: 'Звонки',
  payments: 'Платежи',
  notifications: 'Уведомления',
};
const KINDS: Record<string, string> = {
  degraded: 'Есть проблемы',
  outage: 'Не работает',
  maintenance: 'Плановые работы',
};

type Kind = 'degraded' | 'outage' | 'maintenance';
type Component = 'app' | 'chats' | 'calls' | 'payments' | 'notifications';

/**
 * Owner 2026-10-25: what people see on status.lawbid.dev. Real failures
 * appear there by themselves; here the owner adds his own words (a problem
 * with a partner, planned work) and closes them. One open message per part.
 */
export default function StatusPageAdmin() {
  const qc = useQueryClient();
  const toast = useToast();
  const page = useQuery({
    queryKey: ['status-page'],
    queryFn: async () => (await api.GET('/admin/status-page')).data!.data,
  });
  const [component, setComponent] = useState<Component>('app');
  const [kind, setKind] = useState<Kind>('degraded');
  const [titleRu, setTitleRu] = useState('');
  const [messageRu, setMessageRu] = useState('');

  // One fresh 2FA code before posting or closing (no second admin).
  const [stepUp, setStepUp] = useState<{ id?: string } | null>(null);
  const stepUpOr = (e: unknown, id?: string) => {
    if (e instanceof ApiError && e.code === 'ADMIN_STEP_UP_REQUIRED') setStepUp({ id });
    else toast.error(e);
  };

  const post = useMutation({
    mutationFn: async () =>
      (await api.POST('/admin/status-page/incidents', { body: { component, kind, titleRu, messageRu } })).data!.data,
    onSuccess: (d) => {
      qc.setQueryData(['status-page'], d);
      setTitleRu('');
      setMessageRu('');
      toast.success('Опубликовано на странице статуса');
    },
    onError: (e) => stepUpOr(e),
  });
  const resolve = useMutation({
    mutationFn: async (id: string) =>
      (await api.POST('/admin/status-page/incidents/{id}/resolve', { params: { path: { id } } })).data!.data,
    onSuccess: (d) => {
      qc.setQueryData(['status-page'], d);
      toast.success('Отмечено как устранённое');
    },
    onError: (e, id) => stepUpOr(e, id),
  });

  const d = page.data;
  return (
    <>
      <PageHeader
        eyebrow="Система"
        title="Страница статуса"
        subtitle="Публичная страница для пользователей. Настоящие сбои на ней появляются сами; здесь вы пишете своё сообщение (сбой у партнёра, плановые работы) и закрываете его, когда всё починено."
      />
      <ErrorNote text={page.error ? errorText(page.error) : null} />
      {!d ? (
        <Skeleton className="h-48 rounded-[var(--radius-lg)]" />
      ) : (
        <>
          {!d.publishing ? (
            <Card className="mb-5 p-4 text-sm text-muted">
              Публикация выключена: не задан адрес хранилища страницы (инструкция docs/runbooks/STATUS_PAGE.md). Сообщения
              сохраняются и появятся после включения.
            </Card>
          ) : null}
          <SectionTitle>Новое сообщение</SectionTitle>
          <Card className="mb-6 grid gap-3 p-4 md:grid-cols-2">
            <Field label="Что затронуто" htmlFor="sp-comp">
              <Select id="sp-comp" value={component} onChange={(e) => setComponent(e.target.value as Component)}>
                {Object.entries(COMPONENTS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Что происходит" htmlFor="sp-kind">
              <Select id="sp-kind" value={kind} onChange={(e) => setKind(e.target.value as Kind)}>
                {Object.entries(KINDS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Заголовок" htmlFor="sp-title" className="md:col-span-2">
              <Input id="sp-title" maxLength={120} value={titleRu} onChange={(e) => setTitleRu(e.target.value)} />
            </Field>
            <Field label="Подробности (необязательно)" htmlFor="sp-msg" className="md:col-span-2">
              <Textarea id="sp-msg" maxLength={500} value={messageRu} onChange={(e) => setMessageRu(e.target.value)} />
            </Field>
            <div className="md:col-span-2">
              <Button loading={post.isPending} disabled={titleRu.trim().length < 3} onClick={() => post.mutate()}>
                Опубликовать
              </Button>
            </div>
          </Card>

          <SectionTitle>Ваши сообщения</SectionTitle>
          <Card className="divide-y divide-line">
            {d.incidents.length === 0 ? (
              <p className="p-4 text-sm text-muted">Пока ничего не публиковали.</p>
            ) : (
              d.incidents.map((i) => (
                <div key={i.id} className="flex flex-wrap items-center gap-3 p-4 text-sm">
                  <Badge tone={i.resolvedAt ? 'success' : 'danger'} dot className="shrink-0">
                    {i.resolvedAt ? 'Устранено' : 'Идёт сейчас'}
                  </Badge>
                  <span className="min-w-0 flex-1 break-words">
                    <span className="font-medium text-heading">{i.titleRu}</span>
                    <span className="text-muted">
                      {' '}
                      · {COMPONENTS[i.component] ?? i.component} · {KINDS[i.kind] ?? i.kind} · {formatDateTime(i.startedAt)}
                    </span>
                  </span>
                  {!i.resolvedAt ? (
                    <Button variant="outline" size="sm" loading={resolve.isPending} onClick={() => resolve.mutate(i.id)}>
                      Устранено
                    </Button>
                  ) : null}
                </div>
              ))
            )}
          </Card>
        </>
      )}
      <StepUpDialog
        open={stepUp !== null}
        description="Сообщение увидят все пользователи. Подтвердите, что это вы."
        onCancel={() => setStepUp(null)}
        onDone={() => {
          const s = stepUp;
          setStepUp(null);
          if (s?.id) resolve.mutate(s.id);
          else if (s) post.mutate();
        }}
      />
    </>
  );
}
