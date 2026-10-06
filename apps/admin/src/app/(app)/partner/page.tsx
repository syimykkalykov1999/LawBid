'use client';

import { CheckCircle, Handshake, UsersThree } from '@phosphor-icons/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';
import { Goals, MonthLine, Settlements } from '@/components/country-partners/shared';
import { ErrorNote, PageHeader, SectionTitle } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/card';
import { useToast } from '@/components/ui/toast';
import { api, errorText } from '@/lib/api/client';
import { PARTNER_STATUS } from '@/lib/country-partners';
import { formatDateTime } from '@/lib/utils';

/**
 * Owner 2026-10-06 — the country partner's own page: the contract to
 * accept first, the goals, the team limit and (for the partner and their
 * accountant) the country's monthly report. Nothing here changes money.
 */
export default function PartnerPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const [agree, setAgree] = useState(false);
  const q = useQuery({
    queryKey: ['country-partner-portal'],
    queryFn: async () => (await api.GET('/admin/country-partner')).data!.data,
  });
  const accept = useMutation({
    mutationFn: async (version: number) =>
      (await api.POST('/admin/country-partner/accept-contract', { body: { version } })).data!.data,
    onSuccess: (d) => {
      qc.setQueryData(['country-partner-portal'], d);
      toast.success('Договор принят');
    },
    onError: (e) => toast.error(e),
  });
  const d = q.data;

  return (
    <>
      <PageHeader
        eyebrow="Партнёр страны"
        title={d ? `${d.name} · ${d.countryName}` : 'Кабинет партнёра'}
        subtitle="Ваша страна, ваша команда и ваши цели. Все оплаты идут в LawBid; ваша доля считается 1-го числа за прошлый месяц."
      />
      <ErrorNote text={q.error ? errorText(q.error) : null} />
      {d ? (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={PARTNER_STATUS[d.status]?.tone ?? 'neutral'} dot>
              {PARTNER_STATUS[d.status]?.label ?? d.status}
            </Badge>
            <Badge tone="gold">{d.sharePercent}% от чистого дохода страны</Badge>
            <Badge tone={d.payoutsEnabled ? 'success' : 'neutral'}>
              {d.payoutsEnabled ? 'выплаты включены' : 'выплаты пока выключены'}
            </Badge>
            {d.contractEndsAt ? <Badge tone="neutral">договор до {formatDateTime(d.contractEndsAt).split(',')[0]}</Badge> : null}
          </div>

          {d.contractPending ? (
            <div className="mt-4 rounded-[var(--radius-lg)] border border-gold/50 bg-surface p-4 shadow-card">
              <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-heading">
                <Handshake size={18} /> Договор, версия {d.contract.version}
              </div>
              <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded-[var(--radius-md)] bg-surface-2 p-3 font-sans text-xs leading-relaxed text-ink">
                {d.contract.text}
              </pre>
              {d.lead ? (
                <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                  <label className="flex items-start gap-2 text-sm text-ink">
                    <input
                      type="checkbox"
                      className="mt-0.5 size-4 accent-[var(--color-gold,#C9A24A)]"
                      checked={agree}
                      onChange={(e) => setAgree(e.target.checked)}
                    />
                    Я прочитал договор и принимаю его от имени {d.name}
                  </label>
                  <Button disabled={!agree} loading={accept.isPending} onClick={() => accept.mutate(d.contract.version)}>
                    <CheckCircle size={16} weight="light" />
                    Принять договор
                  </Button>
                </div>
              ) : (
                <p className="mt-3 text-xs text-muted">Договор принимает сам партнёр.</p>
              )}
            </div>
          ) : null}

          <SectionTitle
            action={
              d.lead ? (
                <Link href="/admins" className="text-xs text-gold-600 hover:underline">
                  Управлять командой
                </Link>
              ) : null
            }
          >
            Команда
          </SectionTitle>
          <p className="flex items-center gap-2 text-sm text-ink">
            <UsersThree size={16} /> {d.teamSize} из {d.maxAdmins} сотрудников
          </p>

          <SectionTitle>Цели</SectionTitle>
          <Goals goals={d.goals} />

          {d.canSeeReport ? (
            <>
              <SectionTitle>Этот месяц</SectionTitle>
              <MonthLine rows={d.currentMonth} />
              <SectionTitle>Начисления по месяцам</SectionTitle>
              <Settlements rows={d.settlements} />
            </>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
