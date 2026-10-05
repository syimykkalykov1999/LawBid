'use client';

import { ArrowCounterClockwise, Prohibit, WarningCircle } from '@phosphor-icons/react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { invalidateBilling } from '@/components/billing/grant-dialog';
import { useReason } from '@/components/reason-dialog';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field, Select, Textarea } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';
import { api } from '@/lib/api/client';
import type { components } from '@/lib/api/schema';
import { usd } from '@/lib/labels';
import { formatDateTime } from '@/lib/utils';

type When = components['schemas']['AdminSubscriptionCancelWhen'];
type Refund = components['schemas']['AdminSubscriptionCancelRefund'];
type Result = components['schemas']['AdminSubscriptionActionResultDto'];

/** What the attorney loses, in one sentence, for the confirmation dialog. */
export function cancelSummary(when: When, refund: Refund, periodEnd: string | null | undefined): string {
  if (when === 'period_end') {
    return periodEnd
      ? `Доступ останется до ${formatDateTime(periodEnd)}, потом подписка не продлится. Денег не списываем и не возвращаем.`
      : 'Подписка не продлится в конце текущего периода. Денег не списываем и не возвращаем.';
  }
  const money =
    refund === 'full' ? 'Последний платёж вернём полностью.' : refund === 'prorated' ? 'Вернём деньги за неиспользованные дни.' : 'Деньги не возвращаем.';
  return `Доступ закроется сразу: ставки и платные функции станут недоступны. ${money}`;
}

function resultText(r: Result): string {
  const base = r.cancelAtPeriodEnd ? `Подписка отменится ${r.accessEndsAt ? formatDateTime(r.accessEndsAt) : 'в конце периода'}` : 'Подписка отменена';
  if (!r.refund) return base;
  if (r.refund.status === 'failed') return `${base}. Возврат не прошёл: ${r.refund.message ?? 'ошибка Stripe'}`;
  if (r.refund.status === 'skipped') return `${base}. Возвращать нечего`;
  return `${base}. Возврат ${usd(r.refund.amountCents, 2)} отправлен`;
}

/**
 * Owner 2026-10-04 — support cancels an attorney's subscription on request:
 * at period end (default) or now with an optional prorated / full refund;
 * a pending cancellation can be taken back. Reason goes to the audit log and
 * the attorney gets a notice.
 */
export function SubscriptionActions({
  userId,
  status,
  cancelAtPeriodEnd,
  periodEnd,
}: {
  userId: string;
  status: string;
  cancelAtPeriodEnd: boolean;
  periodEnd: string | null | undefined;
}) {
  const qc = useQueryClient();
  const toast = useToast();
  const { ask, dialog } = useReason();
  const [open, setOpen] = useState(false);

  const resume = useMutation({
    mutationFn: async () => {
      const a = await ask({
        title: 'Вернуть подписку',
        description: 'Отмена в конце периода снимается, подписка продлится как обычно. Адвокат получит уведомление.',
        label: 'Причина',
        confirm: 'Вернуть',
      });
      if (!a) return null;
      const r = await api.POST('/admin/subscriptions/{userId}/resume', { params: { path: { userId } }, body: { reason: a.text } });
      if (r.error) throw r.error;
      return r.data.data;
    },
    onSuccess: (r) => {
      if (!r) return;
      toast.success('Подписка снова продлевается');
      invalidateBilling(qc, userId);
    },
    onError: (e) => toast.error(e),
  });

  if (['canceled', 'expired', 'incomplete'].includes(status)) return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {dialog}
      {cancelAtPeriodEnd ? (
        <Button size="sm" variant="outline" loading={resume.isPending} onClick={() => resume.mutate()}>
          <ArrowCounterClockwise size={14} /> Вернуть подписку
        </Button>
      ) : null}
      <Button size="sm" variant="ghost" className="text-danger" onClick={() => setOpen(true)}>
        <Prohibit size={14} /> {cancelAtPeriodEnd ? 'Отменить сейчас' : 'Отменить подписку'}
      </Button>
      {open ? (
        <CancelDialog
          userId={userId}
          periodEnd={periodEnd}
          defaultWhen={cancelAtPeriodEnd ? 'now' : 'period_end'}
          lockNow={cancelAtPeriodEnd}
          onClose={() => setOpen(false)}
          onDone={(r) => {
            toast[r.refund?.status === 'failed' ? 'error' : 'success'](resultText(r));
            invalidateBilling(qc, userId);
          }}
        />
      ) : null}
    </div>
  );
}

function CancelDialog({
  userId,
  periodEnd,
  defaultWhen,
  lockNow,
  onClose,
  onDone,
}: {
  userId: string;
  periodEnd: string | null | undefined;
  defaultWhen: When;
  /** Already cancelling at period end: only "now" is left. */
  lockNow: boolean;
  onClose: () => void;
  onDone: (r: Result) => void;
}) {
  const toast = useToast();
  const [when, setWhen] = useState<When>(defaultWhen);
  const [refund, setRefund] = useState<Refund>('none');
  const [reason, setReason] = useState('');
  const ok = true;

  const cancel = useMutation({
    mutationFn: async () => {
      const r = await api.POST('/admin/subscriptions/{userId}/cancel', {
        params: { path: { userId } },
        body: { when, refund: when === 'now' ? refund : 'none', reason: reason.trim() },
      });
      if (r.error) throw r.error;
      return r.data.data;
    },
    onSuccess: (r) => {
      onDone(r);
      onClose();
    },
    onError: (e) => toast.error(e),
  });

  return (
    <Dialog open onClose={onClose} eyebrow="По просьбе адвоката" title="Отменить подписку">
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (ok) cancel.mutate();
        }}
      >
        <Field label="Когда" htmlFor="cancel-when">
          <Select id="cancel-when" value={when} disabled={lockNow} onChange={(e) => setWhen(e.target.value as When)}>
            <option value="period_end">В конце оплаченного периода</option>
            <option value="now">Сейчас</option>
          </Select>
        </Field>
        {when === 'now' ? (
          <Field label="Возврат денег" htmlFor="cancel-refund" hint="через Stripe, с последнего платежа">
            <Select id="cancel-refund" value={refund} onChange={(e) => setRefund(e.target.value as Refund)}>
              <option value="none">Без возврата</option>
              <option value="prorated">За неиспользованные дни</option>
              <option value="full">Весь последний платёж</option>
            </Select>
          </Field>
        ) : null}
        <Field label="Причина" htmlFor="cancel-reason" hint="необязательно, пишется в журнал аудита">
          <Textarea id="cancel-reason" rows={3} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
        <p data-testid="cancel-summary" className="flex items-start gap-2 rounded-xl bg-warning-soft px-3.5 py-2.5 text-sm text-warning">
          <WarningCircle size={18} className="mt-px shrink-0" />
          <span>{cancelSummary(when, refund, periodEnd)} Адвокат получит уведомление.</span>
        </p>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Не отменять
          </Button>
          <Button type="submit" variant="danger" loading={cancel.isPending} disabled={!ok || cancel.isPending}>
            {when === 'now' ? 'Отменить сейчас' : 'Отменить в конце периода'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
