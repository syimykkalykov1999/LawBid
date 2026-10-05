'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/card';
import { Table, TableEmpty, Td, Th } from '@/components/ui/table';
import { useToast } from '@/components/ui/toast';
import { api, errorText } from '@/lib/api/client';
import { REASON_RU, RESULT_RU } from '@/lib/registry-labels';
import { formatDateTime } from '@/lib/utils';

/**
 * Owner 2026-10-05 — Проверка → "Сверка с реестром": licenses approved on
 * the sworn statement that the state registry did not confirm. They stay
 * verified; the admin re-runs the lookup, keeps the license (removes the
 * mark) or opens the request to ask for documents / suspend.
 */
export function RegistryFlags() {
  const qc = useQueryClient();
  const toast = useToast();
  const q = useQuery({
    queryKey: ['registry-flags'],
    queryFn: async () => (await api.GET('/admin/verification/registry-flags')).data!.data,
  });
  const refresh = () => void qc.invalidateQueries({ queryKey: ['registry-flags'] });
  const rerun = useMutation({
    mutationFn: async (licenseId: string) =>
      (
        await api.POST('/admin/verification/licenses/{licenseId}/registry-check', {
          params: { path: { licenseId } },
        })
      ).data!.data,
    onSuccess: (r) => {
      const reason = typeof r.details.reason === 'string' ? ` — ${REASON_RU[r.details.reason] ?? r.details.reason}` : '';
      if (r.result === 'pass') toast.success('Реестр подтвердил — отметка снята');
      else toast.error(`${RESULT_RU[r.result]?.text ?? r.result}${reason}`);
      refresh();
    },
    onError: (e) => toast.error(e),
  });
  const clear = useMutation({
    mutationFn: (licenseId: string) =>
      api.POST('/admin/verification/licenses/{licenseId}/registry-flag/clear', { params: { path: { licenseId } } }),
    onSuccess: () => {
      toast.success('Отметка снята, лицензия остаётся подтверждённой');
      refresh();
    },
    onError: (e) => toast.error(e),
  });
  const rows = q.data ?? [];
  return (
    <>
      <p className="mb-3 max-w-3xl text-sm text-muted">
        Адвокаты, одобренные по присяге, чью лицензию реестр штата не подтвердил. Значок у них остаётся. Проверьте по
        ссылке коллегии: если всё в порядке — «Снять отметку»; если нет — откройте заявку и запросите документы или
        приостановите профиль.
      </p>
      {q.error ? <p className="mb-3 text-sm text-danger">{errorText(q.error)}</p> : null}
      <Table>
        <thead>
          <tr>
            <Th>Адвокат</Th>
            <Th>Лицензия</Th>
            <Th>Что не так</Th>
            <Th>В реестре</Th>
            <Th>Когда</Th>
            <Th />
          </tr>
        </thead>
        <tbody>
          {q.isPending ? (
            <TableEmpty colSpan={6} loading />
          ) : rows.length === 0 ? (
            <TableEmpty colSpan={6}>Расхождений с реестрами нет.</TableEmpty>
          ) : (
            rows.map(({ attorney, license: l, latestRequestId }) => {
              const r = (l.autoCheckResult ?? {}) as Record<string, unknown>;
              return (
                <tr key={l.id}>
                  <Td>
                    {latestRequestId ? (
                      <Link href={`/verification/${latestRequestId}`} className="font-medium text-heading hover:underline">
                        {[attorney.firstName, attorney.lastName].filter(Boolean).join(' ') || `@${attorney.username}`}
                      </Link>
                    ) : (
                      <span className="font-medium text-heading">
                        {[attorney.firstName, attorney.lastName].filter(Boolean).join(' ')}
                      </span>
                    )}
                    <div className="text-xs text-faint">@{attorney.username}</div>
                  </Td>
                  <Td className="font-mono text-xs">
                    {l.stateCode} {l.barNumber}
                    {l.lookupUrl ? (
                      <a href={l.lookupUrl} target="_blank" rel="noreferrer" className="mt-1 block font-sans text-primary underline">
                        Открыть в коллегии штата
                      </a>
                    ) : null}
                  </Td>
                  <Td>
                    <Badge tone="warning" dot>
                      {l.registryFlag ? (REASON_RU[l.registryFlag] ?? l.registryFlag) : '—'}
                    </Badge>
                  </Td>
                  <Td className="text-xs">
                    {typeof r.name === 'string' && r.name ? <div>{r.name}</div> : null}
                    {typeof r.registryStatus === 'string' ? <div className="text-muted">{r.registryStatus}</div> : null}
                  </Td>
                  <Td className="whitespace-nowrap text-muted">{formatDateTime(l.registryFlaggedAt)}</Td>
                  <Td>
                    <div className="flex justify-end gap-2">
                      <Button size="sm" variant="ghost" loading={rerun.isPending && rerun.variables === l.id} onClick={() => rerun.mutate(l.id)}>
                        Проверить снова
                      </Button>
                      <Button size="sm" variant="outline" disabled={clear.isPending} onClick={() => clear.mutate(l.id)}>
                        Снять отметку
                      </Button>
                    </div>
                  </Td>
                </tr>
              );
            })
          )}
        </tbody>
      </Table>
    </>
  );
}
