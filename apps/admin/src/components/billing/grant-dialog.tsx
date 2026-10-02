'use client';

import { CheckCircle, MagnifyingGlass, X } from '@phosphor-icons/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field, Input, Textarea } from '@/components/ui/input';
import { Tabs } from '@/components/ui/tabs';
import { useToast } from '@/components/ui/toast';
import { api, errorText } from '@/lib/api/client';
import { partyName } from '@/lib/labels';
import { dayStartIso, formatDate, monthsText, Stepper, todayStr, useDebounced } from './shared';

export type PickedAttorney = { id: string; name: string | null; email?: string | null };

const MONTHS = ['3', '6', '9', '12'] as const;

/** Every query that shows grants or subscriptions. */
export function invalidateBilling(qc: ReturnType<typeof useQueryClient>, userId?: string) {
  void qc.invalidateQueries({ queryKey: ['contract-grants'] });
  void qc.invalidateQueries({ queryKey: ['billing-subscriptions'] });
  void qc.invalidateQueries({ queryKey: ['billing-overview'] });
  if (userId) {
    void qc.invalidateQueries({ queryKey: ['user-contract-grants', userId] });
    void qc.invalidateQueries({ queryKey: ['admin-subscription', userId] });
  }
}

/**
 * "Новая подписка по договору": free access for a blogger attorney
 * (incl. assistant seats) for 3–12 months. `attorney` pre-fills and locks the pick.
 */
export function GrantDialog({
  open,
  onClose,
  attorney,
}: {
  open: boolean;
  onClose: () => void;
  attorney?: PickedAttorney | null;
}) {
  return open ? <GrantForm onClose={onClose} attorney={attorney ?? null} /> : null;
}

function GrantForm({ onClose, attorney }: { onClose: () => void; attorney: PickedAttorney | null }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [picked, setPicked] = useState<PickedAttorney | null>(attorney);
  const [search, setSearch] = useState('');
  const q = useDebounced(search.trim(), 300);
  const [months, setMonths] = useState<(typeof MONTHS)[number]>('6');
  const [seats, setSeats] = useState(0);
  const [start, setStart] = useState(todayStr());
  const [ref, setRef] = useState('');
  const [note, setNote] = useState('');
  const [key] = useState(() => crypto.randomUUID());

  const found = useQuery({
    queryKey: ['grant-attorney-search', q],
    enabled: !picked && q.length >= 2,
    queryFn: async () =>
      (await api.GET('/admin/users', { params: { query: { role: 'attorney', q, limit: 8 } } })).data!.data,
  });

  const create = useMutation({
    mutationFn: async () => {
      if (!picked) throw new Error('Выберите адвоката');
      const r = await api.POST('/admin/billing/contract-grants', {
        headers: { 'Idempotency-Key': key },
        body: {
          userId: picked.id,
          months: Number(months),
          assistantSeats: seats,
          startsAt: start && start !== todayStr() ? dayStartIso(start) : undefined,
          contractRef: ref.trim() || undefined,
          note: note.trim() || undefined,
        },
      });
      return r.data!.data;
    },
    onSuccess: (g) => {
      toast.success(`Подписка по договору выдана до ${formatDate(g.endsAt)}`);
      invalidateBilling(qc, g.userId);
      onClose();
    },
    onError: (e) => toast.error(e instanceof Error && !('status' in e) ? e.message : e),
  });

  const endPreview = (() => {
    const d = new Date(`${start || todayStr()}T00:00:00`);
    d.setMonth(d.getMonth() + Number(months));
    return formatDate(d.toISOString());
  })();

  return (
    <Dialog
      open
      wide
      onClose={onClose}
      eyebrow="По договору"
      title="Новая подписка по договору"
      description="Бесплатный доступ к платным функциям для адвоката-блогера на 3–12 месяцев, вместе с местами для помощников. Stripe не участвует, адвокат получит уведомление."
    >
      <form
        className="space-y-5"
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate();
        }}
      >
        <Field label="Адвокат" htmlFor="grant-q">
          {picked ? (
            <div className="flex items-center gap-3 rounded-[var(--radius-md)] border border-line-strong bg-surface-2 px-3 py-2.5">
              <CheckCircle size={18} weight="light" className="text-success" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-ink">{picked.name || 'Этот адвокат'}</div>
                {picked.email ? <div className="truncate text-xs text-faint">{picked.email}</div> : null}
              </div>
              {!attorney ? (
                <Button type="button" size="sm" variant="ghost" onClick={() => setPicked(null)}>
                  <X size={14} /> Другой
                </Button>
              ) : null}
            </div>
          ) : (
            <div>
              <div className="relative">
                <MagnifyingGlass size={16} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-faint" />
                <Input
                  id="grant-q"
                  autoFocus
                  className="pl-9"
                  placeholder="имя, email, @username"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              {q.length >= 2 ? (
                <ul className="mt-2 max-h-56 overflow-y-auto rounded-[var(--radius-md)] border border-line bg-surface">
                  {found.isPending ? (
                    <li className="px-3 py-2.5 text-sm text-faint">Ищем…</li>
                  ) : found.error ? (
                    <li className="px-3 py-2.5 text-sm text-danger">{errorText(found.error)}</li>
                  ) : (found.data ?? []).length === 0 ? (
                    <li className="px-3 py-2.5 text-sm text-muted">Адвокаты не найдены</li>
                  ) : (
                    found.data!.map((u) => (
                      <li key={u.id}>
                        <button
                          type="button"
                          className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left text-sm transition-colors hover:bg-surface-2"
                          onClick={() => setPicked({ id: u.id, name: partyName(u) })}
                        >
                          <span className="font-medium text-ink">{partyName(u)}</span>
                          <span className="text-xs text-faint">{u.username ? `@${u.username}` : u.id.slice(0, 8)}</span>
                        </button>
                      </li>
                    ))
                  )}
                </ul>
              ) : (
                <p className="mt-1.5 text-xs text-muted">Введите хотя бы 2 символа.</p>
              )}
            </div>
          )}
        </Field>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Срок">
            <Tabs value={months} onChange={setMonths} items={MONTHS.map((m) => ({ value: m, label: `${m} мес.` }))} />
          </Field>
          <Field label="Места помощников" hint="0–6, бесплатно на весь срок">
            <Stepper value={seats} min={0} max={6} onChange={setSeats} label="Места помощников" />
          </Field>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Начало" htmlFor="grant-start" hint={`Закончится ${endPreview}`}>
            <Input id="grant-start" type="date" min={todayStr()} value={start} onChange={(e) => setStart(e.target.value)} />
          </Field>
          <Field label="Договор" htmlFor="grant-ref" hint="номер договора или ник блогера">
            <Input id="grant-ref" maxLength={200} value={ref} onChange={(e) => setRef(e.target.value)} placeholder="№ 12/2026 или @handle" />
          </Field>
        </div>

        <Field label="Заметка" htmlFor="grant-note">
          <Textarea id="grant-note" rows={2} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} placeholder="условия, контакт менеджера…" />
        </Field>

        <div className="rounded-xl bg-accent-soft px-3.5 py-2.5 text-sm text-gold-600">
          {monthsText(Number(months))} бесплатно{seats ? ` · помощников: ${seats}` : ''}. Оплаченная подписка в Stripe, если есть, не
          отменяется и продолжит списываться.
        </div>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Отмена
          </Button>
          <Button type="submit" variant="gold" loading={create.isPending} disabled={!picked || create.isPending}>
            Выдать подписку
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
