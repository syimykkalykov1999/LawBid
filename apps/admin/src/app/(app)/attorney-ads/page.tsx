'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { StepUpDialog } from '@/components/step-up-dialog';
import { ErrorNote, PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Badge, Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/empty';
import { Field, Input, Select } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Table, TableEmpty, Td, Th } from '@/components/ui/table';
import { useToast } from '@/components/ui/toast';
import { ApiError, api, errorText } from '@/lib/api/client';
import type { components } from '@/lib/api/schema';
import { useMe } from '@/lib/hooks';
import { formatDateTime } from '@/lib/utils';

type Settings = components['schemas']['AttorneyAdsSettingsDto'];
type Rules = components['schemas']['StateAdRulesDto'];
type Mode = Rules['mode'];

const MODES: Record<Mode, string> = {
  off: 'Выключено',
  warn: 'Предупреждать (не мешать)',
  block: 'Не сохранять грубые нарушения',
};

/** Owner 2026-10-28: Реклама адвокатов. Per-state rules for what attorneys
 * write about themselves, the ad archive, flags for bid packs / referral
 * rewards. Everything is off or allowed until switched here. */
export default function AttorneyAdsPage() {
  const { data: me } = useMe();
  const q = useQuery({
    queryKey: ['attorney-ads-settings'],
    queryFn: async () => (await api.GET('/admin/attorney-ads/settings')).data!.data,
  });
  return (
    <>
      <PageHeader
        title="Реклама адвокатов"
        subtitle="Правила для текстов, которые адвокаты пишут о себе: проверка, оговорки, архив копий. Включайте по штатам после согласования с юристом (см. docs/runbooks/ATTORNEY_ADS.md)."
      />
      {q.isPending ? <Skeleton className="h-72 rounded-[var(--radius-lg)]" /> : null}
      {q.data ? <Form key={JSON.stringify(q.data)} initial={q.data} canEdit={me?.role === 'super_admin'} /> : null}
      {!q.data && !q.isPending ? <ErrorNote text={errorText(q.error)} /> : null}
      <Archive />
    </>
  );
}

function RuleRow({
  code,
  rules,
  disabled,
  onChange,
  onRemove,
}: {
  code: string;
  rules: Rules;
  disabled: boolean;
  onChange: (r: Rules) => void;
  onRemove?: () => void;
}) {
  return (
    <tr>
      <Td className="font-medium">{code}</Td>
      <Td>
        <Select value={rules.mode} disabled={disabled} onChange={(e) => onChange({ ...rules, mode: e.target.value as Mode })}>
          {(Object.keys(MODES) as Mode[]).map((m) => (
            <option key={m} value={m}>{MODES[m]}</option>
          ))}
        </Select>
      </Td>
      <Td><Switch checked={rules.archive} disabled={disabled} label="Архив" onChange={(v) => onChange({ ...rules, archive: v })} /></Td>
      <Td>
        <Input type="number" min={1} max={10} className="w-20" value={rules.retentionYears} disabled={disabled} onChange={(e) => onChange({ ...rules, retentionYears: Math.min(10, Math.max(1, Number(e.target.value) || 1)) })} />
      </Td>
      <Td><Switch checked={rules.disclaimers} disabled={disabled} label="Оговорка" onChange={(v) => onChange({ ...rules, disclaimers: v })} /></Td>
      <Td><Switch checked={rules.bidPacksAllowed} disabled={disabled} label="Пакеты офферов" onChange={(v) => onChange({ ...rules, bidPacksAllowed: v })} /></Td>
      <Td><Switch checked={rules.referralRewardsAllowed} disabled={disabled} label="Реферальные награды" onChange={(v) => onChange({ ...rules, referralRewardsAllowed: v })} /></Td>
      <Td>{onRemove && !disabled ? <Button variant="ghost" onClick={onRemove}>Убрать</Button> : null}</Td>
    </tr>
  );
}

function Form({ initial, canEdit }: { initial: Settings; canEdit: boolean }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [defaults, setDefaults] = useState<Rules>(initial.defaults);
  const [states, setStates] = useState<Record<string, Rules>>(
    Object.fromEntries(Object.entries(initial.states).map(([k, v]) => [k, { ...initial.defaults, ...(v as Partial<Rules>) }])),
  );
  const [paid, setPaid] = useState(initial.paidPlacementLabel);
  const [newCode, setNewCode] = useState('');
  const [stepUp, setStepUp] = useState(false);

  const save = useMutation({
    mutationFn: async () => {
      const r = await api.PUT('/admin/attorney-ads/settings', {
        body: { defaults: defaults as unknown as Record<string, unknown>, states, paidPlacementLabel: paid },
      });
      if (r.error) throw r.error;
      return r.data!.data;
    },
    onSuccess: (data) => {
      toast.success('Правила рекламы сохранены');
      qc.setQueryData(['attorney-ads-settings'], data);
    },
    onError: (e) => {
      if (e instanceof ApiError && e.code === 'ADMIN_STEP_UP_REQUIRED') setStepUp(true);
      else toast.error(errorText(e));
    },
  });

  const add = () => {
    const c = newCode.trim().toUpperCase();
    if (/^[A-Z]{2}$/.test(c) && !states[c]) setStates({ ...states, [c]: { ...defaults } });
    setNewCode('');
  };

  return (
    <Card className="mb-6 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-medium text-heading">Правила по штатам</h3>
        <Badge tone="neutral">штаты берутся из лицензий адвоката; при нескольких действует самое строгое</Badge>
      </div>
      <p className="mt-2 text-sm text-muted">
        Нью-Йорк с 1 июня 2026: метка «Attorney Advertising» и оговорка «Prior results…» больше не обязательны (но можно оставить). Ложные и вводящие в заблуждение утверждения запрещены везде.
      </p>
      <Table>
        <thead>
          <tr>
            <Th>Штат</Th><Th>Проверка текста</Th><Th>Архив копий</Th><Th>Лет хранить</Th><Th>Оговорка о результатах</Th><Th>Пакеты офферов</Th><Th>Реф. награды</Th><Th />
          </tr>
        </thead>
        <tbody>
          <RuleRow code="по умолч." rules={defaults} disabled={!canEdit} onChange={setDefaults} />
          {Object.entries(states).map(([code, r]) => (
            <RuleRow key={code} code={code} rules={r} disabled={!canEdit} onChange={(v) => setStates({ ...states, [code]: v })} onRemove={() => { const n = { ...states }; delete n[code]; setStates(n); }} />
          ))}
          {Object.keys(states).length === 0 ? <TableEmpty colSpan={8}>Свои правила штатов не заданы: везде «по умолчанию» (выключено).</TableEmpty> : null}
        </tbody>
      </Table>
      {canEdit ? (
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <Field label="Добавить штат (NY, NJ…)" htmlFor="aa-code">
            <Input id="aa-code" maxLength={2} value={newCode} onChange={(e) => setNewCode(e.target.value)} />
          </Field>
          <Button variant="ghost" onClick={add}>Добавить</Button>
        </div>
      ) : null}
      <div className="mt-4 flex items-center justify-between gap-3 rounded-[var(--radius-md)] border border-line p-3">
        <span className="text-sm text-ink">Платное размещение («Выше в поиске», активное продвижение) всегда с меткой «Attorney Advertising»</span>
        <Switch checked={paid} disabled={!canEdit} label="Метка платного размещения" onChange={setPaid} />
      </div>
      {canEdit ? (
        <div className="mt-4 flex justify-end">
          <Button variant="gold" disabled={save.isPending} onClick={() => save.mutate()}>Сохранить</Button>
        </div>
      ) : (
        <p className="mt-4 text-sm text-muted">Менять может только главный администратор (нужен код 2FA).</p>
      )}
      <StepUpDialog open={stepUp} description="Меняются правила рекламы адвокатов." onCancel={() => setStepUp(false)} onDone={() => { setStepUp(false); save.mutate(); }} />
    </Card>
  );
}

function Archive() {
  const q = useQuery({
    queryKey: ['attorney-ads-archive'],
    queryFn: async () => (await api.GET('/admin/attorney-ads/archive')).data!.data,
  });
  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-medium text-heading">Архив рекламы (последние версии)</h3>
        {/* A file download from a route handler, not an app page. */}
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a className="text-sm underline" href="/api/proxy/admin/attorney-ads/archive/export">Скачать CSV</a>
      </div>
      <Table>
        <thead>
          <tr><Th>Когда</Th><Th>Что</Th><Th>Штаты</Th><Th>Версия</Th><Th>Находки</Th><Th>Хранить до</Th><Th>Текст</Th></tr>
        </thead>
        <tbody>
          {(q.data ?? []).map((r) => (
            <tr key={r.id}>
              <Td>{formatDateTime(r.createdAt)}</Td>
              <Td>{r.kind}</Td>
              <Td>{r.stateCodes.join(', ')}</Td>
              <Td>{r.version}</Td>
              <Td>{r.findings.join(', ') || '—'}</Td>
              <Td>{formatDateTime(r.retainUntil)}</Td>
              <Td className="max-w-md truncate">{r.content}</Td>
            </tr>
          ))}
          {q.data && q.data.length === 0 ? <TableEmpty colSpan={7}>Копий пока нет (архив выключен или рекламы не было).</TableEmpty> : null}
        </tbody>
      </Table>
    </Card>
  );
}
