'use client';

import { ChatText, PencilSimple, Plus, Trash } from '@phosphor-icons/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { ErrorNote, PageHeader } from '@/components/page-header';
import { canWriteSupport, CATEGORIES, type SupportMacro, type TicketCategory } from '@/components/support/support-labels';
import { SupportNav } from '@/components/support/support-nav';
import { Button } from '@/components/ui/button';
import { Badge, Card } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { EmptyState, Skeleton } from '@/components/ui/empty';
import { Field, Input, Select, Textarea } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/components/ui/toast';
import { api, errorText } from '@/lib/api/client';
import { useMe } from '@/lib/hooks';
import { TICKET_CATEGORY } from '@/lib/labels';

type Draft = { id?: string; title: string; body: string; bodyRu: string; category: '' | TicketCategory; active: boolean };
const EMPTY: Draft = { title: '', body: '', bodyRu: '', category: '', active: true };

/** Ready answers: the team picks one in the reply box and edits before sending. */
export default function SupportMacrosPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const { data: me } = useMe();
  const canWrite = canWriteSupport(me);
  const [draft, setDraft] = useState<Draft | null>(null);

  const list = useQuery({
    queryKey: ['support-macros', 'all'],
    queryFn: async () => (await api.GET('/admin/support/macros', { params: { query: { all: true } } })).data!.data,
  });
  const done = (text: string) => {
    toast.success(text);
    setDraft(null);
    void qc.invalidateQueries({ queryKey: ['support-macros'] });
  };

  const save = useMutation({
    mutationFn: async (d: Draft) => {
      const body = {
        title: d.title.trim(),
        body: d.body.trim(),
        // Empty = no Russian text (the composer then uses English).
        bodyRu: d.bodyRu.trim() || null,
        category: d.category || null,
        active: d.active,
      };
      if (d.id) await api.PATCH('/admin/support/macros/{id}', { params: { path: { id: d.id } }, body });
      else await api.POST('/admin/support/macros', { body });
    },
    onSuccess: (_r, d) => done(d.id ? 'Ответ сохранён' : 'Ответ добавлен'),
    onError: (e) => toast.error(e),
  });
  const toggle = useMutation({
    mutationFn: async (m: SupportMacro) =>
      api.PATCH('/admin/support/macros/{id}', { params: { path: { id: m.id } }, body: { active: !m.active } }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['support-macros'] }),
    onError: (e) => toast.error(e),
  });
  const remove = useMutation({
    mutationFn: async (id: string) => api.DELETE('/admin/support/macros/{id}', { params: { path: { id } } }),
    onSuccess: () => done('Ответ удалён'),
    onError: (e) => toast.error(e),
  });

  const rows = list.data ?? [];
  const ready = !!draft && draft.title.trim().length > 0 && draft.body.trim().length > 0;

  return (
    <>
      <PageHeader
        eyebrow="Связь · Поддержка"
        title="Готовые ответы"
        subtitle="Частые ответы для команды. В окне ответа выберите «Готовый ответ», поправьте текст и отправьте. Чаще используемые стоят выше."
        actions={
          canWrite ? (
            <Button variant="gold" size="sm" onClick={() => setDraft(EMPTY)}>
              <Plus size={15} weight="bold" /> Добавить ответ
            </Button>
          ) : null
        }
      />
      <SupportNav />
      <ErrorNote text={list.error ? errorText(list.error) : null} />

      {list.isPending ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-[var(--radius-lg)]" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <EmptyState icon={ChatText} title="Готовых ответов пока нет" text="Добавьте ответы на частые вопросы, чтобы отвечать быстрее." />
      ) : (
        <ul className="space-y-3">
          {rows.map((m) => (
            <li key={m.id}>
              <Card className={m.active ? 'p-4' : 'p-4 opacity-60'}>
                <div className="flex flex-wrap items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium break-words text-heading">{m.title}</span>
                      {m.category ? <Badge tone="neutral">{TICKET_CATEGORY[m.category] ?? m.category}</Badge> : null}
                      <Badge tone="info">использован {m.uses}</Badge>
                    </div>
                    <p className="mt-1.5 line-clamp-3 text-sm break-words whitespace-pre-wrap text-muted">
                      <span className="mr-1.5 text-[11px] font-semibold text-faint">EN</span>
                      {m.body}
                    </p>
                    {m.bodyRu ? (
                      <p className="mt-1 line-clamp-3 text-sm break-words whitespace-pre-wrap text-muted">
                        <span className="mr-1.5 text-[11px] font-semibold text-faint">RU</span>
                        {m.bodyRu}
                      </p>
                    ) : (
                      <p className="mt-1 text-[11px] text-faint">Русского текста нет — русскоязычным покажем английский.</p>
                    )}
                  </div>
                  {canWrite ? (
                    <div className="flex shrink-0 items-center gap-1">
                      <Switch
                        checked={m.active}
                        disabled={toggle.isPending}
                        label={m.active ? 'Выключить' : 'Включить'}
                        onChange={() => toggle.mutate(m)}
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Изменить"
                        onClick={() =>
                          setDraft({
                            id: m.id,
                            title: m.title,
                            body: m.body,
                            bodyRu: m.bodyRu ?? '',
                            category: m.category ?? '',
                            active: m.active,
                          })
                        }
                      >
                        <PencilSimple size={16} weight="light" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Удалить"
                        loading={remove.isPending && remove.variables === m.id}
                        onClick={() => {
                          if (window.confirm(`Удалить ответ «${m.title}»?`)) remove.mutate(m.id);
                        }}
                      >
                        <Trash size={16} weight="light" />
                      </Button>
                    </div>
                  ) : null}
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}

      <Dialog
        open={!!draft}
        onClose={() => setDraft(null)}
        title={draft?.id ? 'Изменить ответ' : 'Новый готовый ответ'}
        description="Пользователь увидит только текст ответа, на своём языке."
      >
        {draft ? (
          <div className="space-y-4">
            <Field label="Название (для команды)" htmlFor="mc-title">
              <Input
                id="mc-title"
                maxLength={120}
                value={draft.title}
                onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                placeholder="Например: Сброс пароля"
              />
            </Field>
            <Field label="Категория" htmlFor="mc-cat">
              <Select
                id="mc-cat"
                value={draft.category}
                onChange={(e) => setDraft({ ...draft, category: e.target.value as '' | TicketCategory })}
              >
                <option value="">Любая</option>
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {TICKET_CATEGORY[c]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field
              label="Текст на английском"
              htmlFor="mc-body"
              hint="Его получат все, у кого язык не русский, и те, для кого нет русского текста."
            >
              <Textarea
                id="mc-body"
                maxLength={5000}
                className="min-h-32"
                value={draft.body}
                onChange={(e) => setDraft({ ...draft, body: e.target.value })}
              />
            </Field>
            <Field
              label="Текст на русском"
              htmlFor="mc-body-ru"
              hint="Необязательно. В окне ответа подставится тому, у кого приложение на русском."
            >
              <Textarea
                id="mc-body-ru"
                maxLength={5000}
                className="min-h-32"
                value={draft.bodyRu}
                onChange={(e) => setDraft({ ...draft, bodyRu: e.target.value })}
              />
            </Field>
            <p className="rounded-lg bg-surface-2 px-3 py-2 text-xs text-muted">
              Переменные в тексте: <code>{'{name}'}</code> — имя пользователя (если имени нет: «there» по-английски, ничего по-русски),{' '}
              <code>{'{ticket}'}</code> — номер обращения (например, #3A9F01C2). Сервер подставит их при отправке ответа.
            </p>
            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="ghost" onClick={() => setDraft(null)}>
                Отмена
              </Button>
              <Button variant="gold" loading={save.isPending} disabled={!ready} onClick={() => save.mutate(draft)}>
                Сохранить
              </Button>
            </div>
          </div>
        ) : null}
      </Dialog>
    </>
  );
}
