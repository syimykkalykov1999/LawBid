'use client';

import { GlobeHemisphereWest, MagnifyingGlass, MapPin, Plus } from '@phosphor-icons/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useConfirm } from '@/components/legacy/confirm';
import { MotionRow } from '@/components/legacy/fade-in';
import { ErrorNote, PageHeader } from '@/components/page-header';
import { Button, buttonVariants } from '@/components/ui/button';
import { Badge, Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { Field, Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Table, TableEmpty, Td, Th } from '@/components/ui/table';
import { Tabs } from '@/components/ui/tabs';
import { useToast } from '@/components/ui/toast';
import { api, errorText } from '@/lib/api/client';
import type { components } from '@/lib/api/schema';

type Country = components['schemas']['CountryAdminDto'];
type Filter = 'on' | 'ready' | 'all';

const REGION_WORD: Record<string, string> = {
  state: 'штаты',
  province: 'провинции',
  region: 'регионы',
};

/**
 * Owner 2026-10-05: where the app works. One switch per country, like
 * languages in Локализация; switching a country on opens sign-up, cases and
 * licenses there (with its phone code and regions) and e-mails the people
 * who asked to be told. The owner also has a master switch.
 */
export default function CountriesPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const { confirm, dialog } = useConfirm();
  const [filter, setFilter] = useState<Filter>('on');
  const [q, setQ] = useState('');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [regionsOf, setRegionsOf] = useState<Country | null>(null);

  const list = useQuery({
    queryKey: ['countries'],
    queryFn: async () => (await api.GET('/admin/countries')).data!.data,
  });
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['countries'] });
    void qc.invalidateQueries({ queryKey: ['me'] });
  };

  const toggle = useMutation({
    mutationFn: async (c: Country) => {
      const on = !c.isEnabled;
      const ok = await confirm({
        title: on ? `Включить ${c.name}?` : `Выключить ${c.name}?`,
        description: on
          ? `Люди из этой страны смогут зарегистрироваться (код +${c.callingCode}), создавать кейсы и подтверждать лицензии.${c.waiting ? ` Ждут открытия: ${c.waiting}.` : ''}`
          : 'Новые регистрации, кейсы и лицензии в этой стране закроются. Уже зарегистрированные останутся и продолжат работать.',
        confirm: on ? 'Включить' : 'Выключить',
        danger: !on,
      });
      if (!ok) return null;
      await api.PATCH('/admin/countries/{code}', { params: { path: { code: c.code } }, body: { isEnabled: on } });
      return { c, on };
    },
    onSuccess: (r) => {
      if (!r) return;
      toast.success(`${r.c.name}: ${r.on ? 'включена' : 'выключена'}`);
      refresh();
    },
    onError: (e) => toast.error(e),
  });

  const bulk = useMutation({
    mutationFn: async (v: { enabled: boolean; codes?: string[] }) => {
      const what = v.codes ? `выбранные (${v.codes.length})` : 'все страны';
      const ok = await confirm({
        title: v.enabled ? `Включить ${what}?` : `Выключить ${what}?`,
        description: v.enabled
          ? 'Страны без регионов останутся выключенными: сначала добавьте им регионы.'
          : 'Новые регистрации, кейсы и лицензии в этих странах закроются. Уже зарегистрированные останутся.',
        confirm: v.enabled ? 'Включить' : 'Выключить',
        danger: !v.enabled,
      });
      if (!ok) return null;
      return (await api.POST('/admin/countries/bulk', { body: v })).data!.data;
    },
    onSuccess: (r) => {
      if (!r) return;
      const skipped = r.skipped.length ? ` Без регионов, не включены: ${r.skipped.length}.` : '';
      toast.success(`Изменено стран: ${r.changed.length}.${skipped}`);
      setPicked(new Set());
      refresh();
    },
    onError: (e) => toast.error(e),
  });

  const notify = useMutation({
    mutationFn: async (notifyWaitlist: boolean) => {
      await api.PUT('/admin/countries/settings', { body: { notifyWaitlist } });
      return notifyWaitlist;
    },
    onSuccess: (v) => {
      toast.success(v ? 'Письма ожидающим: автоматически' : 'Письма ожидающим выключены');
      refresh();
    },
    onError: (e) => toast.error(e),
  });

  const data = list.data;
  const all = useMemo(() => data?.countries ?? [], [data]);
  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return all.filter((c) => {
      if (filter === 'on' && !c.isEnabled) return false;
      if (filter === 'ready' && !c.ready) return false;
      if (!needle) return true;
      return (
        c.name.toLowerCase().includes(needle) ||
        c.code.toLowerCase() === needle ||
        c.callingCode.startsWith(needle.replace(/^\+/, ''))
      );
    });
  }, [all, filter, q]);
  const enabled = all.filter((c) => c.isEnabled).length;
  const canBulk = data?.canBulk === true;
  const pick = (code: string, on: boolean) =>
    setPicked((s) => {
      const next = new Set(s);
      if (on) next.add(code);
      else next.delete(code);
      return next;
    });
  const cols = canBulk ? 7 : 6;

  return (
    <>
      {dialog}
      <PageHeader
        eyebrow="Система · Локализация"
        title="Страны"
        subtitle="Где работает приложение. Включили страну: в ней открылись регистрация с её телефонным кодом, регионы, кейсы и лицензии. Выключили: новые не появятся, уже зарегистрированные остаются."
        actions={
          <Link href="/i18n" className={buttonVariants({ variant: 'outline' })}>
            Языки и переводы
          </Link>
        }
      />
      <ErrorNote text={list.error ? errorText(list.error) : null} />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="min-w-0 space-y-3 lg:col-span-2">
          <div className="flex flex-wrap items-center gap-2">
            <Tabs<Filter>
              value={filter}
              onChange={setFilter}
              items={[
                { value: 'on', label: 'Включены', count: enabled },
                { value: 'ready', label: 'Готовы' },
                { value: 'all', label: 'Все' },
              ]}
            />
            <label className="relative min-w-40 flex-1">
              <MagnifyingGlass size={16} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-faint" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Страна, код или +1" className="pl-9" />
            </label>
          </div>
          <Table>
            <thead>
              <tr>
                {canBulk ? <Th className="w-8" /> : null}
                <Th>Страна</Th>
                <Th>Код</Th>
                <Th>Регионы</Th>
                <Th>Люди</Th>
                <Th>Ждут</Th>
                <Th className="text-right">Работает</Th>
              </tr>
            </thead>
            <tbody>
              {list.isPending ? <TableEmpty colSpan={cols} loading /> : null}
              {!list.isPending && !list.error && rows.length === 0 ? (
                <TableEmpty colSpan={cols}>Ничего не нашлось.</TableEmpty>
              ) : null}
              {rows.map((c, i) => (
                <MotionRow key={c.code} i={Math.min(i, 20)}>
                  {canBulk ? (
                    <Td>
                      <input
                        type="checkbox"
                        aria-label={`Выбрать ${c.name}`}
                        checked={picked.has(c.code)}
                        onChange={(e) => pick(c.code, e.target.checked)}
                        className="h-4 w-4 accent-gold-500"
                      />
                    </Td>
                  ) : null}
                  <Td className="max-w-56">
                    <div className="truncate text-ink" title={c.name}>
                      {c.name}
                    </div>
                    <div className="truncate text-xs text-faint">
                      {c.currency} · {c.language}
                      {c.stripeSupported ? '' : ' · без оплат в приложении'}
                    </div>
                  </Td>
                  <Td className="font-mono text-xs whitespace-nowrap">
                    {c.code} · +{c.callingCode}
                  </Td>
                  <Td>
                    <button
                      type="button"
                      onClick={() => setRegionsOf(c)}
                      className="inline-flex items-center gap-1 rounded-lg px-1.5 py-0.5 text-sm whitespace-nowrap text-gold-600 hover:bg-surface-2"
                    >
                      <MapPin size={14} />
                      {c.regions > 0 ? c.regions : 'добавить'}
                    </button>
                  </Td>
                  <Td className="text-xs whitespace-nowrap tabular-nums text-muted">
                    {c.clients + c.attorneys > 0 ? `${c.attorneys} адв. · ${c.clients} кл.` : '—'}
                  </Td>
                  <Td className="tabular-nums">{c.waiting || '—'}</Td>
                  <Td>
                    <div className="flex items-center justify-end gap-2">
                      {!c.ready && !c.isEnabled ? (
                        <Badge tone="warning" className="hidden sm:inline-flex">
                          нет регионов
                        </Badge>
                      ) : null}
                      <Switch
                        checked={c.isEnabled}
                        disabled={toggle.isPending || (!c.ready && !c.isEnabled)}
                        label={c.isEnabled ? `Выключить ${c.name}` : `Включить ${c.name}`}
                        onChange={() => toggle.mutate(c)}
                      />
                    </div>
                  </Td>
                </MotionRow>
              ))}
            </tbody>
          </Table>
        </div>

        <div className="space-y-4">
          {canBulk ? (
            <Card>
              <CardHeader>
                <CardTitle>Общий переключатель</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm text-muted">
                <p>Только для владельца. Включает или выключает сразу много стран; страны без регионов пропускаются.</p>
                {picked.size > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    <Button onClick={() => bulk.mutate({ enabled: true, codes: [...picked] })} disabled={bulk.isPending}>
                      Включить выбранные ({picked.size})
                    </Button>
                    <Button variant="outline" onClick={() => bulk.mutate({ enabled: false, codes: [...picked] })} disabled={bulk.isPending}>
                      Выключить выбранные
                    </Button>
                    <Button variant="ghost" onClick={() => setPicked(new Set())}>
                      Снять выбор
                    </Button>
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    <Button onClick={() => bulk.mutate({ enabled: true })} disabled={bulk.isPending}>
                      Включить все готовые
                    </Button>
                    <Button variant="outline" onClick={() => bulk.mutate({ enabled: false })} disabled={bulk.isPending}>
                      Выключить все
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ) : null}
          <Card>
            <CardHeader>
              <CardTitle>Автоматически</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted">
              <div className="flex items-start justify-between gap-3">
                <p className="min-w-0">
                  Письмо всем, кто ждал открытия своей страны, уходит само в момент включения, на их языке.
                </p>
                <Switch
                  checked={data?.notifyWaitlist ?? true}
                  disabled={!data || notify.isPending}
                  label="Письма ожидающим"
                  onChange={(v) => notify.mutate(v)}
                />
              </div>
              <p>
                Страны сотрудникам назначаются в «Админы и права»: сотрудник видит людей, кейсы и очереди только своих стран. Вкладка страны выбирается вверху справа.
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-start gap-3 pt-5 text-sm text-muted">
              <GlobeHemisphereWest size={20} className="mt-0.5 shrink-0 text-gold-600" />
              <p>
                Регионы США, Канады и Мексики уже заполнены. Для другой страны сначала добавьте её регионы (кнопка в колонке «Регионы»), потом включайте.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>

      <RegionsDialog country={regionsOf} onClose={() => setRegionsOf(null)} onChanged={refresh} />
    </>
  );
}

function RegionsDialog({ country, onClose, onChanged }: { country: Country | null; onClose: () => void; onChanged: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [q, setQ] = useState('');
  const cc = country?.code ?? '';
  const regions = useQuery({
    queryKey: ['countries', cc, 'regions'],
    enabled: !!country,
    queryFn: async () => (await api.GET('/admin/countries/{code}/regions', { params: { path: { code: cc } } })).data!.data,
  });
  const reload = () => {
    void qc.invalidateQueries({ queryKey: ['countries', cc, 'regions'] });
    onChanged();
  };
  const add = useMutation({
    mutationFn: async () => {
      await api.POST('/admin/countries/{code}/regions', {
        params: { path: { code: cc } },
        body: { code: code.trim().toUpperCase(), name: name.trim() },
      });
    },
    onSuccess: () => {
      toast.success('Регион добавлен');
      setCode('');
      setName('');
      reload();
    },
    onError: (e) => toast.error(e),
  });
  const setActive = useMutation({
    mutationFn: async (v: { region: string; isActive: boolean }) => {
      await api.PATCH('/admin/countries/{code}/regions/{region}', {
        params: { path: { code: cc, region: v.region } },
        body: { isActive: v.isActive },
      });
    },
    onSuccess: reload,
    onError: (e) => toast.error(e),
  });
  const needle = q.trim().toLowerCase();
  const rows = (regions.data ?? []).filter(
    (r) => !needle || r.name.toLowerCase().includes(needle) || r.code.toLowerCase() === needle,
  );
  const word = REGION_WORD[country?.regionKind ?? 'region'] ?? 'регионы';

  return (
    <Dialog
      open={!!country}
      onClose={onClose}
      eyebrow="Страны"
      title={country ? `${country.name}: ${word}` : ''}
      description="Регионы, которые люди выбирают в профиле, кейсах и лицензиях. Выключенный регион пропадает из выбора."
      wide
    >
      <div className="space-y-4">
        <form
          className="grid gap-2 sm:grid-cols-[6rem_1fr_auto] sm:items-start"
          onSubmit={(e) => {
            e.preventDefault();
            add.mutate();
          }}
        >
          <Field label="Код" hint="2 знака">
            <Input value={code} onChange={(e) => setCode(e.target.value.slice(0, 2))} placeholder="ON" />
          </Field>
          <Field label="Название" hint="как в официальном списке">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ontario" />
          </Field>
          <Button type="submit" disabled={add.isPending || code.trim().length !== 2 || name.trim().length < 2} className="sm:mt-6">
            <Plus size={16} /> Добавить
          </Button>
        </form>
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Поиск региона" />
        <div className="max-h-[50vh] overflow-y-auto">
          <Table>
            <tbody>
              {regions.isPending ? <TableEmpty colSpan={3} loading /> : null}
              {!regions.isPending && rows.length === 0 ? <TableEmpty colSpan={3}>Регионов пока нет.</TableEmpty> : null}
              {rows.map((r) => (
                <tr key={r.code}>
                  <Td className="w-14 font-mono text-xs">{r.code}</Td>
                  <Td className="max-w-0 truncate text-ink" title={r.name}>
                    {r.name}
                    {r.isoCode ? <span className="ml-2 font-mono text-xs text-faint">{r.isoCode}</span> : null}
                  </Td>
                  <Td className="w-14 text-right">
                    <Switch
                      checked={r.isActive}
                      disabled={setActive.isPending}
                      label={r.name}
                      onChange={(v) => setActive.mutate({ region: r.code, isActive: v })}
                    />
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </div>
      </div>
    </Dialog>
  );
}
