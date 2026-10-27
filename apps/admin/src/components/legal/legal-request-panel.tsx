'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Badge, Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input, Label } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';
import { api } from '@/lib/api/client';
import { formatDateTime } from '@/lib/utils';
import { useStepUp } from './legal-workspace';

interface Intake {
  legalBasis: string | null;
  country: string | null;
  subjectUserId: string | null;
  dueAt: string | null;
  doNotNotify: boolean;
  nondisclosureUntil: string | null;
  userNotifiedAt: string | null;
}

/**
 * Owner 2026-10-28: the intake details of one legal request — legal basis,
 * due date, the person it concerns, the gag (do-not-notify) order with its
 * end date — and the notice to the person, which the server refuses while a
 * gag order is in force. Every change needs a fresh 2FA step-up.
 */
export function LegalRequestPanel({ requestId, intake }: { requestId: string; intake: Intake }) {
  const qc = useQueryClient();
  const toast = useToast();
  const stepUp = useStepUp();
  const [subject, setSubject] = useState(intake.subjectUserId ?? '');
  const [basis, setBasis] = useState(intake.legalBasis ?? '');
  const [due, setDue] = useState(intake.dueAt ? intake.dueAt.slice(0, 16) : '');
  const [gag, setGag] = useState(intake.doNotNotify);
  const [until, setUntil] = useState(intake.nondisclosureUntil ? intake.nondisclosureUntil.slice(0, 16) : '');

  const notice = useQuery({
    queryKey: ['legal-notice', requestId, intake.doNotNotify, intake.nondisclosureUntil, intake.userNotifiedAt, intake.subjectUserId],
    queryFn: async () =>
      (await api.GET('/admin/data-requests/legal/requests/{requestId}/user-notice', { params: { path: { requestId } } })).data!.data,
  });
  const save = useMutation({
    mutationFn: () =>
      new Promise<void>((resolve, reject) =>
        stepUp.run(async () => {
          await api.PATCH('/admin/data-requests/legal/requests/{requestId}/intake', {
            params: { path: { requestId } },
            body: {
              legalBasis: basis.trim(),
              doNotNotify: gag,
              ...(subject.trim() ? { subjectUserId: subject.trim() } : {}),
              ...(due ? { dueAt: new Date(due).toISOString() } : {}),
              ...(gag && until ? { nondisclosureUntil: new Date(until).toISOString() } : {}),
            },
          });
          resolve();
        }, reject),
      ),
    onSuccess: () => {
      toast.success('Сохранено');
      void qc.invalidateQueries({ queryKey: ['data-request', requestId] });
      void qc.invalidateQueries({ queryKey: ['legal-notice', requestId] });
    },
    onError: (e) => toast.error(e),
  });
  const send = useMutation({
    mutationFn: () =>
      new Promise<void>((resolve, reject) =>
        stepUp.run(async () => {
          await api.POST('/admin/data-requests/legal/requests/{requestId}/user-notice', { params: { path: { requestId } } });
          resolve();
        }, reject),
      ),
    onSuccess: () => {
      toast.success('Письмо пользователю отправлено');
      void qc.invalidateQueries({ queryKey: ['data-request', requestId] });
      void qc.invalidateQueries({ queryKey: ['legal-notice', requestId] });
    },
    onError: (e) => toast.error(e),
  });
  const n = notice.data;

  return (
    <Card className="mt-6">
      {stepUp.dialog}
      <CardHeader>
        <CardTitle>Основание, срок и уведомление пользователя</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="lb">Закон / основание</Label>
            <Input id="lb" maxLength={300} value={basis} onChange={(e) => setBasis(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="ldue">Срок ответа</Label>
            <Input id="ldue" type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} />
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label htmlFor="lsub">Человек, которого касается запрос (id)</Label>
            <Input id="lsub" value={subject} onChange={(e) => setSubject(e.target.value)} />
          </div>
          <div className="space-y-1 sm:col-span-2">
            <label className="flex cursor-pointer items-center gap-2 text-ink">
              <input type="checkbox" checked={gag} onChange={(e) => setGag(e.target.checked)} />
              Запрет рассказывать пользователю (gag / non-disclosure order)
            </label>
            {gag ? (
              <div className="space-y-1">
                <Label htmlFor="luntil">Запрет действует до (напомним, когда он кончится)</Label>
                <Input id="luntil" type="datetime-local" value={until} onChange={(e) => setUntil(e.target.value)} />
              </div>
            ) : null}
          </div>
        </div>
        <Button loading={save.isPending} onClick={() => save.mutate()}>
          Сохранить
        </Button>

        <div className="space-y-2 rounded-[var(--radius-md)] border border-line p-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-ink">Письмо пользователю</span>
            {intake.userNotifiedAt ? <Badge tone="success">отправлено {formatDateTime(intake.userNotifiedAt)}</Badge> : null}
            {n && !n.allowed && !intake.userNotifiedAt ? <Badge tone="warning">нельзя: {n.blockedReason}</Badge> : null}
          </div>
          {n ? <p className="whitespace-pre-wrap text-xs text-muted">{n.text}</p> : null}
          <p className="text-xs text-muted">Текст меняется в «Настройках» (legal.notice_template_ru / _en).</p>
          <Button variant="outline" disabled={!n?.allowed} loading={send.isPending} onClick={() => send.mutate()}>
            Отправить письмо
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
