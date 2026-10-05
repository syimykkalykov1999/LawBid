'use client';

import { ArrowLeft, EnvelopeSimple, NotePencil, Phone } from '@phosphor-icons/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { TonePill } from '@/components/billing/shared';
import {
  CALL_OUTCOMES,
  formatPhone,
  fromLocalInput,
  LEAD_STATUSES,
  LEAD_TONE,
  leadName,
  partnerName,
  SYSTEM_STATUSES,
  toLocalInput,
  type CallOutcome,
  type LeadDetail,
  type LeadKind,
  type LeadStatus,
  type OutreachContext,
} from '@/components/outreach/shared';
import { ErrorNote, PageHeader, SectionTitle } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/empty';
import { Field, Input, Select, Textarea } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';
import { api, errorText } from '@/lib/api/client';
import { CALL_OUTCOME, LEAD_KIND, LEAD_SOURCE, LEAD_STATUS, OUTREACH_ACTIVITY } from '@/lib/labels';
import { formatDateTime } from '@/lib/utils';

/** One contact: who, how to reach them, what was done, what is next. */
export default function LeadPage() {
  const { id } = useParams<{ id: string }>();
  const ctx = useQuery({
    queryKey: ['outreach-context'],
    queryFn: async () => (await api.GET('/admin/outreach/context')).data!.data,
  });
  const lead = useQuery({
    queryKey: ['outreach-lead', id],
    queryFn: async () => (await api.GET('/admin/outreach/leads/{id}', { params: { path: { id } } })).data!.data,
  });

  return (
    <>
      <div className="mb-3">
        <Link href="/outreach" className="inline-flex items-center gap-1 text-sm text-muted hover:text-ink">
          <ArrowLeft size={14} /> Все контакты
        </Link>
      </div>
      {lead.isPending || ctx.isPending ? (
        <Skeleton className="h-96 rounded-[var(--radius-lg)]" />
      ) : lead.error || !lead.data || !ctx.data ? (
        <ErrorNote text={lead.error ? errorText(lead.error) : 'Контакт не найден или вам не назначен.'} />
      ) : (
        <Body lead={lead.data} ctx={ctx.data} />
      )}
    </>
  );
}

function Body({ lead, ctx }: { lead: LeadDetail; ctx: OutreachContext }) {
  const qc = useQueryClient();
  const toast = useToast();
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['outreach-lead', lead.id] });
    void qc.invalidateQueries({ queryKey: ['outreach-leads'] });
    void qc.invalidateQueries({ queryKey: ['outreach-context'] });
  };
  const [action, setAction] = useState<'call' | 'note' | 'email' | null>(null);
  const [outcome, setOutcome] = useState<CallOutcome>('talked');
  const [body, setBody] = useState('');
  const [next, setNext] = useState('');
  const [templateId, setTemplateId] = useState('');

  const templates = useQuery({
    queryKey: ['outreach-templates'],
    queryFn: async () => (await api.GET('/admin/outreach/templates')).data!.data,
    enabled: action === 'email',
  });
  const usable = (templates.data ?? []).filter((t) => t.active && (t.kind === 'any' || t.kind === lead.kind));

  const activity = useMutation({
    mutationFn: async () =>
      (
        await api.POST('/admin/outreach/leads/{id}/activities', {
          params: { path: { id: lead.id } },
          body: {
            kind: action === 'call' ? 'call' : 'note',
            outcome: action === 'call' ? outcome : undefined,
            body: body.trim() || null,
            nextActionAt: next ? fromLocalInput(next) : undefined,
          },
        })
      ).data!.data,
    onSuccess: () => {
      toast.success(action === 'call' ? 'Звонок записан' : 'Заметка добавлена');
      setAction(null);
      setBody('');
      setNext('');
      refresh();
    },
    onError: (e) => toast.error(e),
  });
  const email = useMutation({
    mutationFn: async () =>
      (await api.POST('/admin/outreach/leads/{id}/email', { params: { path: { id: lead.id } }, body: { templateId } })).data!.data,
    onSuccess: (r) => {
      toast.success(`Письмо отправлено: «${r.subject}». Осталось сегодня: ${r.remainingToday}`);
      setAction(null);
      refresh();
    },
    onError: (e) => toast.error(e),
  });

  const emailBlock = !lead.email
    ? 'нет email'
    : lead.unsubscribed
      ? 'отписался от писем'
      : ctx.settings.dailyEmailLimit === 0
        ? 'письма выключены в настройках'
        : !ctx.settings.footerAddress || !ctx.settings.apiPublicUrl
          ? 'заполните адрес и публичный URL в настройках'
          : ctx.emailsLeftToday <= 0
            ? 'дневной лимит писем исчерпан'
            : null;

  return (
    <>
      <PageHeader
        eyebrow={`${LEAD_KIND[lead.kind]} · ${LEAD_SOURCE[lead.source]}`}
        title={leadName(lead)}
        subtitle={
          <span className="inline-flex flex-wrap items-center gap-2">
            <TonePill map={LEAD_STATUS} tones={LEAD_TONE} value={lead.status} />
            <span>сотрудник: {partnerName(lead.partner)}</span>
            {lead.convertedUserId ? (
              <Link href={`/users/${lead.convertedUserId}`} className="text-gold-600 underline-offset-2 hover:underline">
                профиль в приложении
              </Link>
            ) : null}
          </span>
        }
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant={action === 'call' ? 'default' : 'outline'} onClick={() => setAction(action === 'call' ? null : 'call')} disabled={!lead.phone}>
              <Phone size={16} /> Звонок
            </Button>
            <Button variant={action === 'note' ? 'default' : 'outline'} onClick={() => setAction(action === 'note' ? null : 'note')}>
              <NotePencil size={16} /> Заметка
            </Button>
            <Button variant={action === 'email' ? 'default' : 'gold'} onClick={() => setAction(action === 'email' ? null : 'email')} disabled={!!emailBlock} title={emailBlock ?? undefined}>
              <EnvelopeSimple size={16} /> Письмо
            </Button>
          </div>
        }
      />
      {emailBlock && lead.email ? <p className="-mt-4 mb-4 text-xs text-muted">Письмо: {emailBlock}.</p> : null}

      {action === 'call' || action === 'note' ? (
        <Card className="mb-6 p-5">
          <h3 className="font-medium text-heading">{action === 'call' ? 'Как прошёл звонок' : 'Заметка'}</h3>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            {action === 'call' ? (
              <Field label="Результат" htmlFor="la-outcome" hint="статус контакта поменяется сам">
                <Select id="la-outcome" value={outcome} onChange={(e) => setOutcome(e.target.value as CallOutcome)}>
                  {CALL_OUTCOMES.map((o) => (
                    <option key={o} value={o}>
                      {CALL_OUTCOME[o]}
                    </option>
                  ))}
                </Select>
              </Field>
            ) : null}
            <Field label="Когда связаться снова" htmlFor="la-next" hint="попадёт во вкладку «Пора связаться»">
              <Input id="la-next" type="datetime-local" value={next} onChange={(e) => setNext(e.target.value)} />
            </Field>
          </div>
          <Field label="Текст" htmlFor="la-body" className="mt-4">
            <Textarea id="la-body" rows={3} value={body} onChange={(e) => setBody(e.target.value)} placeholder={action === 'call' ? 'О чём говорили, что обещали…' : 'Что важно помнить'} />
          </Field>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setAction(null)}>
              Отмена
            </Button>
            <Button loading={activity.isPending} disabled={action === 'note' && !body.trim()} onClick={() => activity.mutate()}>
              Сохранить
            </Button>
          </div>
        </Card>
      ) : null}

      {action === 'email' ? (
        <Card className="mb-6 p-5">
          <h3 className="font-medium text-heading">Письмо на {lead.email}</h3>
          <p className="mt-1 text-sm text-muted">
            Уйдёт с {lead.partner ? `ссылкой сотрудника ${partnerName(lead.partner)}` : ctx.scope ? 'вашей партнёрской ссылкой' : 'вашей ссылкой'}, подписью компании и ссылкой «отписаться». Осталось сегодня: {ctx.emailsLeftToday}.
          </p>
          <Field label="Шаблон" htmlFor="la-template" className="mt-3">
            <Select id="la-template" value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
              <option value="">— выберите —</option>
              {usable.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} — {t.subject}
                </option>
              ))}
            </Select>
          </Field>
          {templates.data && usable.length === 0 ? <p className="mt-2 text-xs text-warning">Нет включённых шаблонов для этого типа контакта. Их создаёт владелец во вкладке «Шаблоны писем».</p> : null}
          {templateId ? (
            <pre className="mt-3 max-h-48 overflow-auto whitespace-pre-wrap rounded-[var(--radius)] bg-surface-2 p-3 text-xs text-muted">
              {usable.find((t) => t.id === templateId)?.body}
            </pre>
          ) : null}
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setAction(null)}>
              Отмена
            </Button>
            <Button variant="gold" disabled={!templateId} loading={email.isPending} onClick={() => email.mutate()}>
              Отправить
            </Button>
          </div>
        </Card>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
        <div>
          <SectionTitle>Данные</SectionTitle>
          <EditForm key={lead.id + lead.status + lead.note} lead={lead} ctx={ctx} onSaved={refresh} />
        </div>
        <div>
          <SectionTitle>История</SectionTitle>
          <Card className="divide-y divide-line">
            {lead.activities.length === 0 ? (
              <p className="p-4 text-sm text-muted">Пока ничего: контакт только добавлен.</p>
            ) : (
              lead.activities.map((a) => (
                <div key={a.id} className="flex gap-3 p-4 text-sm">
                  <div className="w-36 shrink-0 text-xs text-faint">{formatDateTime(a.createdAt)}</div>
                  <div className="min-w-0 flex-1">
                    <div className="text-ink">
                      {OUTREACH_ACTIVITY[a.kind] ?? a.kind}
                      {a.outcome ? <span className="text-muted"> · {CALL_OUTCOME[a.outcome] ?? LEAD_STATUS[a.outcome] ?? outcomeText(a.outcome)}</span> : null}
                    </div>
                    {a.body ? <div className="mt-0.5 whitespace-pre-wrap text-muted">{a.body}</div> : null}
                    {a.actorName ? <div className="mt-0.5 text-xs text-faint">{a.actorName}</div> : null}
                  </div>
                </div>
              ))
            )}
          </Card>
        </div>
      </div>
    </>
  );
}

function outcomeText(o: string): string {
  const map: Record<string, string> = { sent: 'отправлено', failed: 'не отправлено', assigned: 'назначен', unassigned: 'снят' };
  return map[o] ?? o;
}

function EditForm({ lead, ctx, onSaved }: { lead: LeadDetail; ctx: OutreachContext; onSaved: () => void }) {
  const toast = useToast();
  const [f, setF] = useState({
    kind: lead.kind as LeadKind,
    firstName: lead.firstName ?? '',
    lastName: lead.lastName ?? '',
    company: lead.company ?? '',
    stateCode: lead.stateCode ?? '',
    city: lead.city ?? '',
    practice: lead.practice ?? '',
    phone: lead.phone ? formatPhone(lead.phone) : '',
    email: lead.email ?? '',
    note: lead.note ?? '',
    nextActionAt: toLocalInput(lead.nextActionAt),
    partnerId: lead.partner?.id ?? '',
    status: lead.status as LeadStatus,
  });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setF((s) => ({ ...s, [k]: e.target.value }));
  const systemStatus = SYSTEM_STATUSES.includes(lead.status);
  const save = useMutation({
    mutationFn: async () =>
      (
        await api.PATCH('/admin/outreach/leads/{id}', {
          params: { path: { id: lead.id } },
          body: {
            kind: f.kind,
            firstName: f.firstName || null,
            lastName: f.lastName || null,
            company: f.company || null,
            stateCode: f.stateCode || null,
            city: f.city || null,
            practice: f.practice || null,
            phone: f.phone || null,
            email: f.email || null,
            note: f.note || null,
            nextActionAt: f.nextActionAt ? fromLocalInput(f.nextActionAt) : null,
            ...(ctx.manager ? { partnerId: f.partnerId || null } : {}),
            ...(!systemStatus && f.status !== lead.status ? { status: f.status } : {}),
          },
        })
      ).data!.data,
    onSuccess: () => {
      toast.success('Сохранено');
      onSaved();
    },
    onError: (e) => toast.error(e),
  });
  return (
    <Card className="p-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Кто" htmlFor="le-kind">
          <Select id="le-kind" value={f.kind} onChange={set('kind')} disabled={!!lead.convertedUserId}>
            <option value="attorney">Адвокат</option>
            <option value="client">Клиент</option>
          </Select>
        </Field>
        <Field label="Статус" htmlFor="le-status" hint={systemStatus ? 'выставлен системой: регистрация по ссылке / оплата' : 'меняется сам по результатам звонков и писем'}>
          <Select id="le-status" value={f.status} onChange={set('status')} disabled={systemStatus}>
            {LEAD_STATUSES.filter((s) => !SYSTEM_STATUSES.includes(s)).map((s) => (
              <option key={s} value={s}>
                {LEAD_STATUS[s]}
              </option>
            ))}
            {systemStatus ? <option value={lead.status}>{LEAD_STATUS[lead.status]}</option> : null}
          </Select>
        </Field>
        <Field label="Имя" htmlFor="le-first">
          <Input id="le-first" value={f.firstName} onChange={set('firstName')} />
        </Field>
        <Field label="Фамилия" htmlFor="le-last">
          <Input id="le-last" value={f.lastName} onChange={set('lastName')} />
        </Field>
        <Field label="Фирма" htmlFor="le-company">
          <Input id="le-company" value={f.company} onChange={set('company')} />
        </Field>
        <Field label="Практика" htmlFor="le-practice">
          <Input id="le-practice" value={f.practice} onChange={set('practice')} />
        </Field>
        <Field label="Телефон" htmlFor="le-phone">
          <Input id="le-phone" value={f.phone} onChange={set('phone')} />
        </Field>
        <Field label="Email" htmlFor="le-email" hint={lead.unsubscribed ? 'отписался — письма не уйдут' : undefined}>
          <Input id="le-email" type="email" value={f.email} onChange={set('email')} />
        </Field>
        <Field label="Штат" htmlFor="le-state">
          <Input id="le-state" value={f.stateCode} onChange={set('stateCode')} maxLength={2} />
        </Field>
        <Field label="Город" htmlFor="le-city">
          <Input id="le-city" value={f.city} onChange={set('city')} />
        </Field>
        <Field label="Связаться снова" htmlFor="le-next">
          <Input id="le-next" type="datetime-local" value={f.nextActionAt} onChange={set('nextActionAt')} />
        </Field>
        {ctx.manager ? (
          <Field label="Сотрудник" htmlFor="le-partner">
            <Select id="le-partner" value={f.partnerId} onChange={set('partnerId')}>
              <option value="">не назначен</option>
              {ctx.partners.map((p) => (
                <option key={p.id} value={p.id}>
                  {partnerName(p)}
                </option>
              ))}
            </Select>
          </Field>
        ) : null}
      </div>
      <Field label="Заметка" htmlFor="le-note" className="mt-4">
        <Textarea id="le-note" rows={3} value={f.note} onChange={set('note')} />
      </Field>
      <div className="mt-4 flex items-center justify-between text-xs text-faint">
        <span>добавлен {formatDateTime(lead.createdAt)}</span>
        <Button size="sm" loading={save.isPending} onClick={() => save.mutate()}>
          Сохранить
        </Button>
      </div>
    </Card>
  );
}
