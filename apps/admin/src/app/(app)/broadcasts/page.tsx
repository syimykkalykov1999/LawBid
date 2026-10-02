'use client';

import { BellRinging, Megaphone, PaperPlaneTilt, UsersThree } from '@phosphor-icons/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'motion/react';
import { useState } from 'react';
import { PushPreview } from '@/components/email/push-preview';
import { ErrorNote, PageHeader, SectionTitle } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Badge, Card } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/empty';
import { Field, Input, Select, Textarea } from '@/components/ui/input';
import { Table, TableEmpty, Td, Th } from '@/components/ui/table';
import { useToast } from '@/components/ui/toast';
import { api, errorText } from '@/lib/api/client';
import { cn, formatDateTime } from '@/lib/utils';

type Audience = 'all' | 'attorneys' | 'clients' | 'assistants';

const AUDIENCE: Record<Audience, string> = {
  all: 'все пользователи',
  attorneys: 'адвокаты',
  clients: 'клиенты',
  assistants: 'помощники',
};

const AUDIENCE_HINT: Record<Audience, string> = {
  all: 'Все активные аккаунты: клиенты, адвокаты и помощники.',
  attorneys: 'Только адвокаты — с подпиской и без.',
  clients: 'Только клиенты, которые ищут адвоката.',
  assistants: 'Только помощники в командах адвокатов.',
};

const TITLE_MAX = 120;
const BODY_MAX = 1000;

/**
 * Owner 2026-09-30 — broadcasts: a push and an in-app notification from
 * the LawBid team to an audience (optionally one state).
 */
export default function BroadcastsPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [audience, setAudience] = useState<Audience>('all');
  const [state, setState] = useState('');
  const [confirming, setConfirming] = useState(false);
  const history = useQuery({
    queryKey: ['admin-broadcasts'],
    queryFn: async () => (await api.GET('/admin/broadcasts')).data!.data,
  });
  const send = useMutation({
    mutationFn: async () => {
      const r = await api.POST('/admin/broadcasts', {
        body: {
          title: title.trim(),
          body: body.trim(),
          audience,
          stateCode: state.trim().toUpperCase() || undefined,
        },
      });
      if (r.error) throw r.error;
      return r.data!.data;
    },
    onSuccess: (b) => {
      setTitle('');
      setBody('');
      setConfirming(false);
      toast.success(`Рассылка отправлена · получателей: ${b.recipients.toLocaleString('ru-RU')}`);
      void qc.invalidateQueries({ queryKey: ['admin-broadcasts'] });
    },
    onError: (e) => {
      setConfirming(false);
      toast.error(e);
    },
  });

  const stateCode = state.trim().toUpperCase();
  const stateOk = !stateCode || /^[A-Z]{2}$/.test(stateCode);
  const ready = !!title.trim() && !!body.trim() && stateOk;
  const audienceText = `${AUDIENCE[audience]}${stateCode && stateOk ? ` из штата ${stateCode}` : ''}`;
  const rows = history.data ?? [];

  return (
    <>
      <PageHeader
        eyebrow="Связь"
        title="Рассылки"
        subtitle="Пуш и уведомление в приложении от команды LawBid — всем или сегменту. Отправка сразу, отменить нельзя."
      />

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}>
          <Card className="p-5 sm:p-6">
            <div className="mb-5 flex items-center gap-3">
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-surface-2 text-faint">
                <Megaphone size={18} weight="light" />
              </span>
              <h2 className="font-serif text-lg font-semibold text-heading">Новая рассылка</h2>
            </div>
            <div className="space-y-4">
              <Field label="Заголовок" htmlFor="bt" hint={<Counter n={title.length} max={TITLE_MAX} />}>
                <Input id="bt" value={title} maxLength={TITLE_MAX} placeholder="Например: Новые функции в LawBid" onChange={(e) => setTitle(e.target.value)} />
              </Field>
              <Field label="Текст" htmlFor="bb" hint={<Counter n={body.length} max={BODY_MAX} />}>
                <Textarea
                  id="bb"
                  value={body}
                  maxLength={BODY_MAX}
                  placeholder="Коротко и по делу — в пуше видно первые 2–3 строки."
                  onChange={(e) => setBody(e.target.value)}
                  className="min-h-32 resize-y"
                />
              </Field>
              <div className="grid gap-4 sm:grid-cols-[1fr_140px]">
                <Field label="Кому" htmlFor="ba">
                  <Select id="ba" value={audience} onChange={(e) => setAudience(e.target.value as Audience)}>
                    {(Object.keys(AUDIENCE) as Audience[]).map((v) => (
                      <option key={v} value={v}>
                        {AUDIENCE[v]}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Штат (необяз.)" htmlFor="bs">
                  <Input
                    id="bs"
                    value={state}
                    maxLength={2}
                    placeholder="IL"
                    onChange={(e) => setState(e.target.value)}
                    aria-invalid={!stateOk}
                    className={cn('uppercase', !stateOk && 'border-danger')}
                  />
                </Field>
              </div>
              <div className="flex items-start gap-3 rounded-xl border border-line bg-surface-2 px-4 py-3">
                <UsersThree size={18} weight="light" className="mt-0.5 shrink-0 text-gold-600" />
                <div className="text-sm">
                  <div className="font-medium text-ink">Получат: {audienceText}</div>
                  <div className="text-xs text-muted">
                    {AUDIENCE_HINT[audience]}
                    {stateCode && stateOk ? ` Только с штатом ${stateCode} в профиле.` : ''} Пуш придёт тем, у кого включены уведомления; в приложении уведомление увидят все.
                  </div>
                </div>
              </div>
              {!stateOk ? <p className="text-xs text-danger">Штат — две латинские буквы, например IL.</p> : null}
              <ErrorNote text={send.error ? errorText(send.error) : null} />
              <div className="flex flex-wrap items-center justify-end gap-3 pt-1">
                {send.data ? (
                  <Badge tone="success" dot>
                    последняя отправлена: {send.data.recipients.toLocaleString('ru-RU')}
                  </Badge>
                ) : null}
                <Button variant="gold" disabled={!ready} loading={send.isPending} onClick={() => setConfirming(true)}>
                  {send.isPending ? null : <PaperPlaneTilt size={16} weight="light" />}
                  Отправить
                </Button>
              </div>
            </div>
          </Card>
        </motion.div>

        <motion.div
          className="lg:sticky lg:top-4"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.06, ease: [0.16, 1, 0.3, 1] }}
        >
          <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-faint">
            <BellRinging size={14} weight="light" /> Так увидят на телефоне
          </div>
          <PushPreview title={title} body={body} />
        </motion.div>
      </div>

      <SectionTitle>История</SectionTitle>
      <ErrorNote text={history.error ? errorText(history.error) : null} />
      {!history.isPending && rows.length === 0 && !history.error ? (
        <EmptyState icon={Megaphone} title="Рассылок ещё не было" text="Отправленные рассылки появятся здесь с числом получателей." />
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Рассылка</Th>
              <Th>Кому</Th>
              <Th>Получателей</Th>
              <Th>Когда</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((b) => (
              <tr key={b.id}>
                <Td className="max-w-md">
                  <div className="font-medium text-ink">{b.title}</div>
                  <div className="line-clamp-2 text-xs text-muted">{b.body}</div>
                </Td>
                <Td className="text-xs">
                  {AUDIENCE[b.audience as Audience] ?? b.audience}
                  {b.stateCode ? `, ${b.stateCode}` : ''}
                </Td>
                <Td className="tabular-nums">{b.recipients.toLocaleString('ru-RU')}</Td>
                <Td className="whitespace-nowrap text-xs">{formatDateTime(b.createdAt)}</Td>
              </tr>
            ))}
            {history.isPending ? <TableEmpty colSpan={4} loading /> : null}
          </tbody>
        </Table>
      )}

      <Dialog
        open={confirming}
        onClose={() => (send.isPending ? undefined : setConfirming(false))}
        eyebrow="Рассылка"
        title="Отправить сейчас?"
        description={`Получат: ${audienceText}. Отменить после отправки нельзя.`}
      >
        <div className="mb-5 rounded-xl border border-line bg-surface-2 p-3 text-sm">
          <div className="font-medium text-ink">{title}</div>
          <div className="mt-1 line-clamp-4 whitespace-pre-wrap text-muted">{body}</div>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setConfirming(false)} disabled={send.isPending}>
            Отмена
          </Button>
          <Button variant="gold" loading={send.isPending} onClick={() => send.mutate()}>
            Отправить
          </Button>
        </div>
      </Dialog>
    </>
  );
}

function Counter({ n, max }: { n: number; max: number }) {
  return <span className={cn('tabular-nums', n > max * 0.9 && 'text-warning')}>{n} / {max}</span>;
}
