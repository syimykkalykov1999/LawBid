'use client';

import { CaretDown, PhoneCall } from '@phosphor-icons/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { StatusDot } from '@/components/status-dot';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/empty';
import { useToast } from '@/components/ui/toast';
import { api, errorText } from '@/lib/api/client';
import {
  carryingLine,
  checkLine,
  cloudflareStatus,
  ownStatus,
  stateOfTransport,
  TRANSPORT_HINT,
  TRANSPORT_OF_STATE,
  type CallsPath,
  type CallsPathCheck,
} from '@/lib/calls-transport';
import { COST_STATE_WORD, type CostRowStatus, type CostState } from '@/lib/launch';
import { formatDateTime } from '@/lib/utils';
import type { Guarded } from './integration-card';

const STATES: CostState[] = ['off', 'on', 'auto'];
const KEY = ['calls-path'];

function Row({
  name,
  testId,
  status,
  lastAt,
  check,
}: {
  name: string;
  testId: string;
  status: CostRowStatus;
  lastAt: string | null;
  check: CallsPathCheck | null;
}) {
  const line = checkLine(check);
  return (
    <div className="flex items-center gap-3 py-2" data-testid={`calls-row-${testId}`}>
      <StatusDot status={status} testId={`dot-calls-${testId}`} />
      <span className="flex-1 text-sm text-ink">{name}</span>
      {line ? (
        <span className={`text-sm ${check?.ok ? 'text-success' : 'text-danger'}`} data-testid={`calls-check-${testId}`}>
          {line}
        </span>
      ) : null}
      <span className="w-40 text-right text-xs text-muted">
        {lastAt ? `проверено ${formatDateTime(lastAt)}` : 'ещё не проверялось'}
      </span>
    </div>
  );
}

/**
 * Owner 2026-10-26 (calls failover): ONE card for everything that carries
 * calls — Cloudflare (TURN + SFU) and our own path (coturn + device to device). The
 * key cards of those four services sit inside as collapsible sections.
 */
export function CallsTransportCard({
  guarded,
  keyCards,
}: {
  guarded: Guarded;
  keyCards: Array<{ id: string; title: string; card: ReactNode }>;
}) {
  const qc = useQueryClient();
  const toast = useToast();
  const q = useQuery({
    queryKey: KEY,
    queryFn: async () => (await api.GET('/admin/system-health/calls-path')).data!.data as CallsPath,
  });
  const check = useMutation({
    mutationFn: async () => (await api.POST('/admin/system-health/calls-path/check')).data!.data as CallsPath,
    onSuccess: (r) => qc.setQueryData(KEY, r),
    onError: (e) => toast.error(e),
  });
  const r = q.data;
  const current = stateOfTransport(r?.transport);
  const pick = (st: CostState) =>
    guarded(
      async () => {
        await api.PUT('/admin/config/{key}', {
          params: { path: { key: 'calls.transport' } },
          // The contract types `value` as an opaque object; a string is valid here.
          body: { value: TRANSPORT_OF_STATE[st] } as never,
        });
        await qc.invalidateQueries({ queryKey: KEY });
      },
      { success: `Связь для звонков: ${COST_STATE_WORD[st]}` },
    );

  return (
    <Card className="p-5" data-testid="calls-transport-card">
      <div className="mb-3 flex items-center gap-2">
        <PhoneCall size={20} weight="light" />
        <h3 className="flex-1 text-base font-medium text-ink">Связь для звонков</h3>
        <div role="radiogroup" aria-label="Связь для звонков" className="inline-flex overflow-hidden rounded-xl border border-line">
          {STATES.map((st) => {
            const active = r ? current === st : false;
            const can = Boolean(r) && !active;
            return (
              <button
                key={st}
                type="button"
                role="radio"
                aria-checked={active}
                disabled={!can && !active}
                title={TRANSPORT_HINT[st]}
                data-testid={`state-calls-transport-${st}`}
                onClick={() => can && pick(st)}
                className={[
                  'h-9 px-3 text-sm transition-colors',
                  active ? 'bg-gold-600 text-white' : 'bg-surface text-ink',
                  can ? 'hover:bg-line/40' : 'cursor-default',
                ].join(' ')}
              >
                {COST_STATE_WORD[st]}
              </button>
            );
          })}
        </div>
      </div>
      {q.isPending ? (
        <Skeleton className="h-24" />
      ) : q.error ? (
        <p className="text-sm text-danger">{errorText(q.error)}</p>
      ) : r ? (
        <>
          <p className="mb-1 text-sm text-ink" data-testid="calls-carrying">
            {carryingLine(r)}
          </p>
          <div className="divide-y divide-line">
            <Row
              name="Cloudflare"
              testId="cloudflare"
              status={cloudflareStatus(r)}
              lastAt={r.cloudflare.lastProbeAt}
              check={r.cloudflare.check}
            />
            <Row
              name="Своя связь (coturn, напрямую между телефонами)"
              testId="own"
              status={ownStatus(r)}
              lastAt={r.own.lastProbeAt}
              check={r.own.check}
            />
          </div>
          <div className="mt-3 flex items-center gap-3">
            <Button variant="outline" onClick={() => check.mutate()} disabled={check.isPending}>
              {check.isPending ? 'Проверяю…' : 'Проверить'}
            </Button>
          </div>
        </>
      ) : null}
      <p className="mt-3 text-xs text-muted">
        Если Cloudflare сбоит, звонки сами переходят на свою связь и сами возвращаются — разговор при этом не
        обрывается.
      </p>
      <div className="mt-4 space-y-2">
        {keyCards.map((k) => (
          <details key={k.id} className="group rounded-xl border border-line" data-testid={`calls-keys-${k.id}`}>
            <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-sm text-ink">
              <CaretDown size={14} className="transition-transform group-open:rotate-180" />
              {k.title}
            </summary>
            <div className="p-2">{k.card}</div>
          </details>
        ))}
      </div>
    </Card>
  );
}
