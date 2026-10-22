'use client';

import { WarningCircle } from '@phosphor-icons/react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field, Input, Textarea } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';
import { ApiError, api } from '@/lib/api/client';
import { usd } from '@/lib/labels';
import { formatDateTime } from '@/lib/utils';
import { type AdminPayment, dollarsToCents, userName } from './shared';
import { REASON_MIN, useReasonRequired } from '@/lib/reason-policy';

/** "Вернуть деньги": partial or full refund through Stripe. */
export function RefundDialog({ payment, onClose }: { payment: AdminPayment | null; onClose: () => void }) {
  return payment ? <RefundForm payment={payment} onClose={onClose} /> : null;
}

function RefundForm({ payment, onClose }: { payment: AdminPayment; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [amount, setAmount] = useState((payment.refundableCents / 100).toFixed(2));
  const [reason, setReason] = useState('');
  const [key] = useState(() => crypto.randomUUID());
  const cents = dollarsToCents(amount);
  const tooMuch = cents != null && cents > payment.refundableCents;
  const needReason = useReasonRequired('money');
  const ok = cents != null && !tooMuch && (!needReason || reason.trim().length >= REASON_MIN);

  const refund = useMutation({
    mutationFn: async () =>
      (
        await api.POST('/admin/billing/refunds', {
          params: { header: { 'Idempotency-Key': key } },
          body: { paymentId: payment.id, amountCents: cents!, reason: reason.trim() },
        })
      ).data!.data,
    onSuccess: (r) => {
      toast.success(r.status === 'failed' ? 'Stripe отклонил возврат' : `Возврат ${usd(r.amountCents, 2)} отправлен`);
      void qc.invalidateQueries({ queryKey: ['billing-payments'] });
      void qc.invalidateQueries({ queryKey: ['billing-refunds'] });
      void qc.invalidateQueries({ queryKey: ['billing-overview'] });
      void qc.invalidateQueries({ queryKey: ['admin-subscription', payment.userId] });
      onClose();
    },
    onError: (e) => {
      toast.error(e);
      // Owner 2026-10-22: from the limit on it waits for a second admin.
      if (e instanceof ApiError && e.code === 'ADMIN_APPROVAL_PENDING') {
        void qc.invalidateQueries({ queryKey: ['approvals-count'] });
        onClose();
      }
    },
  });

  return (
    <Dialog
      open
      onClose={onClose}
      eyebrow="Возврат"
      title="Вернуть деньги"
      description={`${userName(payment.user, payment.userId)} · платёж ${usd(payment.amountCents, 2)} от ${formatDateTime(payment.paidAt ?? payment.createdAt)}`}
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (ok) refund.mutate();
        }}
      >
        <Field
          label="Сумма, $"
          htmlFor="refund-amount"
          hint={
            tooMuch ? (
              <span className="text-danger">Можно вернуть не больше {usd(payment.refundableCents, 2)}</span>
            ) : (
              `Доступно к возврату: ${usd(payment.refundableCents, 2)}${payment.refundedCents ? ` · уже возвращено ${usd(payment.refundedCents, 2)}` : ''}`
            )
          }
        >
          <Input id="refund-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </Field>
        <Field label="Причина" htmlFor="refund-reason" hint={needReason ? `обязательно, не короче ${REASON_MIN} символов` : 'необязательно, пишется в журнал аудита'}>
          <Textarea id="refund-reason" rows={3} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
        <div className="flex items-start gap-2 rounded-xl bg-warning-soft px-3.5 py-2.5 text-sm text-warning">
          <WarningCircle size={18} className="mt-px shrink-0" />
          <span>Деньги уйдут на карту клиента через Stripe. Отменить возврат нельзя. Подписка при этом не отменяется.</span>
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Отмена
          </Button>
          <Button type="submit" variant="danger" loading={refund.isPending} disabled={!ok || refund.isPending}>
            Вернуть {cents && !tooMuch ? usd(cents, 2) : ''}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
