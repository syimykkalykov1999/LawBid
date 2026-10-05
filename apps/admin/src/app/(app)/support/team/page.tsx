'use client';

import { UsersThree } from '@phosphor-icons/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { ErrorNote, PageHeader, SectionTitle } from '@/components/page-header';
import { canWriteSupport, minutesText, type SupportAgent } from '@/components/support/support-labels';
import { SupportNav } from '@/components/support/support-nav';
import { Badge, Card } from '@/components/ui/card';
import { EmptyState, Skeleton } from '@/components/ui/empty';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Table, Td, Th } from '@/components/ui/table';
import { Tabs } from '@/components/ui/tabs';
import { useToast } from '@/components/ui/toast';
import { api, errorText } from '@/lib/api/client';
import { livePoll } from '@/lib/live';
import { useMe } from '@/lib/hooks';

type Days = '7' | '30' | '90';

/** Who is on shift (new tickets go to them) and what each person did. */
export default function SupportTeamPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const { data: me } = useMe();
  const canWrite = canWriteSupport(me);
  const [days, setDays] = useState<Days>('30');
  const range = useMemo(() => {
    const to = new Date();
    return { from: new Date(to.getTime() - Number(days) * 86_400_000).toISOString(), to: to.toISOString() };
  }, [days]);

  const agents = useQuery({
    queryKey: ['support-agents'],
    queryFn: async () => (await api.GET('/admin/support/agents')).data!.data,
    refetchInterval: livePoll(),
  });
  const stats = useQuery({
    queryKey: ['support-staff-stats', days],
    queryFn: async () => (await api.GET('/admin/support/staff-stats', { params: { query: range } })).data!.data,
  });
  const set = useMutation({
    mutationFn: async (v: { a: SupportAgent; onShift?: boolean; maxOpen?: number }) =>
      api.PUT('/admin/support/agents/{adminId}', {
        params: { path: { adminId: v.a.adminId } },
        body: { onShift: v.onShift, maxOpen: v.maxOpen },
      }),
    onSuccess: (_r, v) => {
      if (v.onShift !== undefined) toast.success(v.onShift ? `${v.a.name}: на смене` : `${v.a.name}: смена закончена`);
      else toast.success('Лимит сохранён');
      void qc.invalidateQueries({ queryKey: ['support-agents'] });
      void qc.invalidateQueries({ queryKey: ['workspace'] });
    },
    onError: (e) => toast.error(e),
  });

  return (
    <>
      <PageHeader
        eyebrow="Связь · Поддержка"
        title="Команда поддержки"
        subtitle="Новые обращения сами уходят тому, кто на смене и меньше всего занят. Если на смене никого нет, обращение ждёт в общей очереди."
      />
      <SupportNav />

      <SectionTitle>Смены</SectionTitle>
      <ErrorNote text={agents.error ? errorText(agents.error) : null} />
      <Card className="overflow-hidden">
        {agents.isPending ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-10" />
            ))}
          </div>
        ) : (agents.data ?? []).length === 0 ? (
          <EmptyState
            className="m-4 border-none"
            icon={UsersThree}
            title="В поддержке пока никого"
            text="Дайте сотруднику право «Поддержка: управление» в разделе «Сотрудники»."
          />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <thead>
                <tr>
                  <Th>Сотрудник</Th>
                  <Th>На смене</Th>
                  <Th className="text-right">Открыто сейчас</Th>
                  <Th className="text-right">Берёт не больше</Th>
                </tr>
              </thead>
              <tbody>
                {(agents.data ?? []).map((a) => (
                  <tr key={a.adminId}>
                    <Td className="min-w-40 break-words">
                      {a.name}
                      {a.adminId === me?.id ? <span className="ml-1.5 text-xs text-faint">(вы)</span> : null}
                    </Td>
                    <Td>
                      <Switch
                        checked={a.onShift}
                        disabled={!canWrite || set.isPending}
                        label={`Смена: ${a.name}`}
                        onChange={(v) => set.mutate({ a, onShift: v })}
                      />
                    </Td>
                    <Td className="text-right tabular-nums">
                      {a.openTickets >= a.maxOpen ? <Badge tone="warning">{a.openTickets}</Badge> : a.openTickets}
                    </Td>
                    <Td className="text-right">
                      <Input
                        type="number"
                        min={1}
                        max={500}
                        defaultValue={a.maxOpen}
                        disabled={!canWrite}
                        aria-label={`Лимит открытых: ${a.name}`}
                        className="ml-auto h-8 w-20 text-right"
                        onBlur={(e) => {
                          const n = Number(e.target.value);
                          if (Number.isInteger(n) && n >= 1 && n <= 500 && n !== a.maxOpen) set.mutate({ a, maxOpen: n });
                        }}
                      />
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </div>
        )}
      </Card>

      <div className="mt-8">
        <SectionTitle
          action={
            <Tabs<Days>
              size="sm"
              value={days}
              onChange={setDays}
              items={[
                { value: '7', label: '7 дней' },
                { value: '30', label: '30 дней' },
                { value: '90', label: '90 дней' },
              ]}
            />
          }
        >
          Работа сотрудников
        </SectionTitle>
      </div>
      <ErrorNote text={stats.error ? errorText(stats.error) : null} />
      <Card className="overflow-hidden">
        {stats.isPending ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-10" />
            ))}
          </div>
        ) : (stats.data ?? []).length === 0 ? (
          <EmptyState className="m-4 border-none" icon={UsersThree} title="За этот период ответов нет" />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <thead>
                <tr>
                  <Th>Сотрудник</Th>
                  <Th className="text-right">Ответов</Th>
                  <Th className="text-right">Первых ответов</Th>
                  <Th className="text-right">Время первого ответа</Th>
                  <Th className="text-right">Решено</Th>
                  <Th className="text-right">Просрочено</Th>
                </tr>
              </thead>
              <tbody>
                {(stats.data ?? []).map((s) => (
                  <tr key={s.adminId}>
                    <Td className="min-w-40 break-words">
                      {s.name}
                      {s.onShift ? (
                        <Badge tone="success" className="ml-2">
                          на смене
                        </Badge>
                      ) : null}
                    </Td>
                    <Td className="text-right tabular-nums">{s.replies}</Td>
                    <Td className="text-right tabular-nums">{s.firstResponses}</Td>
                    <Td className="text-right tabular-nums">{minutesText(s.medianFirstResponseMinutes)}</Td>
                    <Td className="text-right tabular-nums">{s.resolved}</Td>
                    <Td className="text-right tabular-nums">
                      {s.slaBreaches > 0 ? <Badge tone="danger">{s.slaBreaches}</Badge> : 0}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </div>
        )}
      </Card>
      <p className="mt-2 text-xs text-faint">Время первого ответа — медиана. Просрочено — ответ опоздал, пока обращение было у сотрудника.</p>
    </>
  );
}
