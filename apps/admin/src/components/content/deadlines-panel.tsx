'use client';

import { CalendarPlus, Plus, Trash } from '@phosphor-icons/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { growthError } from '@/components/growth/errors';
import { useConfirm } from '@/components/legacy/confirm';
import { ErrorNote } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/empty';
import { Field, Input, Select, Textarea } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Table, TableEmpty, Td, Th } from '@/components/ui/table';
import { Tabs } from '@/components/ui/tabs';
import { useToast } from '@/components/ui/toast';
import { api, errorText } from '@/lib/api/client';
import type { components } from '@/lib/api/schema';
import { useMe } from '@/lib/hooks';
import { can } from '@/lib/rbac';
import { US_STATES } from '@/lib/us-states';

type Rule = components['schemas']['AdminDeadlineRuleDto'];
type Holiday = components['schemas']['AdminHolidayDto'];
type Kind = Rule['kind'];
type Unit = Rule['unit'];
type DayType = Rule['dayType'];
type Direction = Rule['direction'];
type View = 'rules' | 'holidays';

const KIND: Record<Kind, string> = { court_deadline: 'Срок суда', statute_of_limitations: 'Давность' };
const UNIT: Record<Unit, string> = { day: 'дн.', month: 'мес.', year: 'г.' };
const JURISDICTIONS = [{ code: 'US', name: 'США (федеральные суды)' }, ...US_STATES.map((s) => ({ code: s.code, name: s.name }))];

/** The panel: rules and court holidays, both edited here and counted by the app. */
export function DeadlinesPanel() {
  const [view, setView] = useState<View>('rules');
  return (
    <>
      <div className="mb-4">
        <Tabs
          value={view}
          onChange={setView}
          items={[
            { value: 'rules', label: 'Правила' },
            { value: 'holidays', label: 'Выходные суда' },
          ]}
        />
      </div>
      {view === 'rules' ? <RulesView /> : <HolidaysView />}
    </>
  );
}

function RulesView() {
  const { data: me } = useMe();
  const canWrite = can(me, 'content', 'manage');
  const qc = useQueryClient();
  const [open, setOpen] = useState<Rule | 'new' | null>(null);
  const [kind, setKind] = useState<Kind | 'all'>('all');
  const list = useQuery({
    queryKey: ['admin-deadline-rules'],
    queryFn: async () => (await api.GET('/admin/deadlines/rules')).data!.data,
  });
  const rows = (list.data ?? []).filter((r) => kind === 'all' || r.kind === kind);
  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Select className="w-52" value={kind} onChange={(e) => setKind(e.target.value as Kind | 'all')} aria-label="Вид">
          <option value="all">Все виды</option>
          <option value="court_deadline">Сроки судов</option>
          <option value="statute_of_limitations">Давность</option>
        </Select>
        {canWrite ? (
          <Button className="ml-auto" variant="gold" onClick={() => setOpen('new')}>
            <Plus size={16} /> Новое правило
          </Button>
        ) : null}
      </div>
      <ErrorNote text={list.error ? errorText(list.error) : null} />
      {!list.isPending && !list.error && rows.length === 0 ? (
        <EmptyState icon={CalendarPlus} title="Правил нет" text="Добавьте правило: сколько дней, месяцев или лет и от какого события." />
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Правило</Th>
              <Th>Где</Th>
              <Th>Вид</Th>
              <Th>Срок</Th>
              <Th>Источник</Th>
              <Th>Статус</Th>
            </tr>
          </thead>
          <tbody>
            {list.isPending ? (
              <TableEmpty colSpan={6} loading />
            ) : (
              rows.map((r) => (
                <tr key={r.id} className="cursor-pointer" onClick={() => setOpen(r)}>
                  <Td>
                    <div className="font-medium text-ink">{r.labels.ru ?? r.labels.en}</div>
                    <div className="text-[11px] text-faint">{r.code}{r.practiceCode ? ` · ${r.practiceCode}` : ''}</div>
                  </Td>
                  <Td className="text-muted">{r.jurisdiction}</Td>
                  <Td>
                    <Badge tone={r.kind === 'court_deadline' ? 'info' : 'neutral'}>{KIND[r.kind]}</Badge>
                  </Td>
                  <Td className="whitespace-nowrap tabular-nums">
                    {r.direction === 'before' ? 'за ' : ''}
                    {r.amount} {UNIT[r.unit]}
                    {r.unit === 'day' ? (r.dayType === 'business' ? ' рабочих' : ' календарных') : ''}
                  </Td>
                  <Td className="text-xs text-muted">{r.citation ?? '—'}</Td>
                  <Td>
                    <div className="flex flex-wrap gap-1">
                      <Badge tone={r.verified ? 'success' : 'warning'} dot>
                        {r.verified ? 'проверено' : 'не проверено'}
                      </Badge>
                      {!r.isActive ? <Badge tone="neutral">выключено</Badge> : null}
                    </div>
                  </Td>
                </tr>
              ))
            )}
          </tbody>
        </Table>
      )}
      {open ? (
        <RuleDialog
          rule={open === 'new' ? null : open}
          canWrite={canWrite}
          onClose={() => setOpen(null)}
          onSaved={() => {
            setOpen(null);
            void qc.invalidateQueries({ queryKey: ['admin-deadline-rules'] });
          }}
        />
      ) : null}
    </>
  );
}

function RuleDialog({ rule, canWrite, onClose, onSaved }: { rule: Rule | null; canWrite: boolean; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const { confirm, dialog } = useConfirm();
  const [jurisdiction, setJurisdiction] = useState(rule?.jurisdiction ?? 'US');
  const [kind, setKind] = useState<Kind>(rule?.kind ?? 'court_deadline');
  const [code, setCode] = useState(rule?.code ?? '');
  const [en, setEn] = useState(rule?.labels.en ?? '');
  const [ru, setRu] = useState(rule?.labels.ru ?? '');
  const [amount, setAmount] = useState(String(rule?.amount ?? 21));
  const [unit, setUnit] = useState<Unit>(rule?.unit ?? 'day');
  const [dayType, setDayType] = useState<DayType>(rule?.dayType ?? 'calendar');
  const [direction, setDirection] = useState<Direction>(rule?.direction ?? 'after');
  const [practiceCode, setPracticeCode] = useState(rule?.practiceCode ?? '');
  const [citation, setCitation] = useState(rule?.citation ?? '');
  const [notesEn, setNotesEn] = useState(rule?.notes?.en ?? '');
  const [notesRu, setNotesRu] = useState(rule?.notes?.ru ?? '');
  const [sourceUrl, setSourceUrl] = useState(rule?.sourceUrl ?? '');
  const [verified, setVerified] = useState(rule?.verified ?? false);
  const [isActive, setIsActive] = useState(rule?.isActive ?? true);

  const n = Number(amount);
  const ok =
    en.trim().length >= 2 &&
    Number.isInteger(n) &&
    n >= 1 &&
    n <= 3650 &&
    (rule !== null || /^[a-z0-9_]{3,80}$/.test(code)) &&
    (kind !== 'statute_of_limitations' || practiceCode.trim() !== '');

  const labels = { en: en.trim(), ...(ru.trim() ? { ru: ru.trim() } : {}) };
  const notes = { ...(notesEn.trim() ? { en: notesEn.trim() } : {}), ...(notesRu.trim() ? { ru: notesRu.trim() } : {}) };

  const save = useMutation({
    mutationFn: async () => {
      const common = {
        kind,
        labels,
        amount: n,
        unit,
        dayType,
        direction,
        citation: citation.trim() || undefined,
        notes,
        sourceUrl: sourceUrl.trim() || undefined,
        verified,
        isActive,
      };
      if (rule) {
        const r = await api.PATCH('/admin/deadlines/rules/{id}', {
          params: { path: { id: rule.id } },
          body: { ...common, practiceCode: practiceCode.trim() || null, citation: citation.trim() || null, sourceUrl: sourceUrl.trim() || null },
        });
        if (r.error) throw r.error;
      } else {
        const r = await api.POST('/admin/deadlines/rules', {
          body: { ...common, jurisdiction, code, sort: 0, practiceCode: practiceCode.trim() || undefined },
        });
        if (r.error) throw r.error;
      }
    },
    onSuccess: () => {
      toast.success(rule ? 'Правило сохранено' : 'Правило добавлено');
      onSaved();
    },
    onError: (e) => toast.error(growthError(e)),
  });

  const remove = useMutation({
    mutationFn: async () => {
      if (!rule) return false;
      const yes = await confirm({
        title: 'Удалить правило?',
        description: 'Оно пропадёт из калькулятора. Чтобы только спрятать его, выключите правило.',
        confirm: 'Удалить',
        danger: true,
      });
      if (!yes) return false;
      const r = await api.DELETE('/admin/deadlines/rules/{id}', { params: { path: { id: rule.id } } });
      if (r.error) throw r.error;
      return true;
    },
    onSuccess: (done) => {
      if (!done) return;
      toast.success('Правило удалено');
      onSaved();
    },
    onError: (e) => toast.error(growthError(e)),
  });
  const busy = save.isPending || remove.isPending;

  return (
    <>
      <Dialog open onClose={onClose} wide eyebrow="Сроки" title={rule ? (rule.labels.ru ?? rule.labels.en) : 'Новое правило'}>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (ok && canWrite) save.mutate();
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Где действует" htmlFor="dl-j">
              <Select id="dl-j" value={jurisdiction} disabled={!canWrite || rule !== null} onChange={(e) => setJurisdiction(e.target.value)}>
                {JURISDICTIONS.map((j) => (
                  <option key={j.code} value={j.code}>
                    {j.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Вид" htmlFor="dl-k">
              <Select id="dl-k" value={kind} disabled={!canWrite} onChange={(e) => setKind(e.target.value as Kind)}>
                <option value="court_deadline">Срок суда</option>
                <option value="statute_of_limitations">Срок давности</option>
              </Select>
            </Field>
          </div>
          <Field label="Код" htmlFor="dl-code" hint={rule ? 'Код не меняется.' : 'Латиница, цифры, _ (например ny_cplr_3012_reply).'}>
            <Input id="dl-code" value={code} maxLength={80} disabled={!canWrite || rule !== null} onChange={(e) => setCode(e.target.value.toLowerCase())} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Название (English)" htmlFor="dl-en">
              <Input id="dl-en" value={en} maxLength={400} disabled={!canWrite} onChange={(e) => setEn(e.target.value)} />
            </Field>
            <Field label="Название (русский)" htmlFor="dl-ru" hint="Остальные языки показывают English.">
              <Input id="dl-ru" value={ru} maxLength={400} disabled={!canWrite} onChange={(e) => setRu(e.target.value)} />
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-4">
            <Field label="Сколько" htmlFor="dl-n">
              <Input id="dl-n" inputMode="numeric" value={amount} disabled={!canWrite} onChange={(e) => setAmount(e.target.value.replace(/\D/g, ''))} />
            </Field>
            <Field label="Единица" htmlFor="dl-u">
              <Select id="dl-u" value={unit} disabled={!canWrite} onChange={(e) => setUnit(e.target.value as Unit)}>
                <option value="day">дни</option>
                <option value="month">месяцы</option>
                <option value="year">годы</option>
              </Select>
            </Field>
            <Field label="Дни" htmlFor="dl-t" hint={unit === 'day' ? undefined : 'Только для дней.'}>
              <Select id="dl-t" value={dayType} disabled={!canWrite || unit !== 'day'} onChange={(e) => setDayType(e.target.value as DayType)}>
                <option value="calendar">календарные</option>
                <option value="business">рабочие</option>
              </Select>
            </Field>
            <Field label="Отсчёт" htmlFor="dl-d">
              <Select id="dl-d" value={direction} disabled={!canWrite} onChange={(e) => setDirection(e.target.value as Direction)}>
                <option value="after">после события</option>
                <option value="before">до события</option>
              </Select>
            </Field>
          </div>
          <Field
            label="Категория практики"
            htmlFor="dl-p"
            hint={kind === 'statute_of_limitations' ? 'Код категории (personal_injury…): по нему давность показывается в кейсе.' : 'Только для давности.'}
          >
            <Input id="dl-p" value={practiceCode} maxLength={80} disabled={!canWrite || kind !== 'statute_of_limitations'} onChange={(e) => setPracticeCode(e.target.value)} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Норма" htmlFor="dl-c" hint="FRCP 12(a)(1)(A)(i), N.Y. CPLR 214…">
              <Input id="dl-c" value={citation} maxLength={160} disabled={!canWrite} onChange={(e) => setCitation(e.target.value)} />
            </Field>
            <Field label="Ссылка на источник" htmlFor="dl-s">
              <Input id="dl-s" value={sourceUrl} maxLength={300} disabled={!canWrite} onChange={(e) => setSourceUrl(e.target.value)} />
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Пояснение (English)" htmlFor="dl-ne" hint="Показывается под результатом.">
              <Textarea id="dl-ne" rows={3} value={notesEn} disabled={!canWrite} onChange={(e) => setNotesEn(e.target.value)} />
            </Field>
            <Field label="Пояснение (русский)" htmlFor="dl-nr">
              <Textarea id="dl-nr" rows={3} value={notesRu} disabled={!canWrite} onChange={(e) => setNotesRu(e.target.value)} />
            </Field>
          </div>
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <Switch checked={verified} onChange={setVerified} disabled={!canWrite} label="Проверено" />
              <span className="text-sm text-ink">{verified ? 'Проверено по источнику' : 'Не проверено — приложение предупредит'}</span>
            </div>
            <div className="flex items-center gap-3">
              <Switch checked={isActive} onChange={setIsActive} disabled={!canWrite} label="Включено" />
              <span className="text-sm text-ink">{isActive ? 'Показывается в приложении' : 'Выключено — не видно в приложении'}</span>
            </div>
          </div>
          {canWrite ? (
            <div className="flex flex-wrap justify-between gap-2 border-t border-line pt-4">
              {rule ? (
                <Button type="button" variant="danger-soft" disabled={busy} onClick={() => remove.mutate()}>
                  <Trash size={16} /> Удалить
                </Button>
              ) : (
                <span />
              )}
              <div className="flex gap-2">
                <Button type="button" variant="ghost" onClick={onClose}>
                  Отмена
                </Button>
                <Button type="submit" variant="gold" loading={save.isPending} disabled={!ok || busy}>
                  {rule ? 'Сохранить' : 'Добавить'}
                </Button>
              </div>
            </div>
          ) : null}
        </form>
      </Dialog>
      {dialog}
    </>
  );
}

function HolidaysView() {
  const { data: me } = useMe();
  const canWrite = can(me, 'content', 'manage');
  const qc = useQueryClient();
  const toast = useToast();
  const { confirm, dialog } = useConfirm();
  const thisYear = new Date().getFullYear();
  const [jurisdiction, setJurisdiction] = useState('US');
  const [year, setYear] = useState(thisYear);
  const [date, setDate] = useState('');
  const [en, setEn] = useState('');
  const [ru, setRu] = useState('');

  const list = useQuery({
    queryKey: ['admin-deadline-holidays', jurisdiction, year],
    queryFn: async () => (await api.GET('/admin/deadlines/holidays', { params: { query: { jurisdiction, year } } })).data!.data,
  });
  const refresh = () => void qc.invalidateQueries({ queryKey: ['admin-deadline-holidays'] });

  const federal = useMutation({
    mutationFn: async () => {
      const r = await api.POST('/admin/deadlines/holidays/federal', { body: { year } });
      if (r.error || !r.data) throw r.error ?? new Error('Пустой ответ');
      return r.data.data;
    },
    onSuccess: (r) => {
      toast.success(r.created ? `Добавлено: ${r.created}` : 'Все федеральные дни этого года уже есть');
      refresh();
    },
    onError: (e) => toast.error(growthError(e)),
  });
  const add = useMutation({
    mutationFn: async () => {
      const r = await api.POST('/admin/deadlines/holidays', {
        body: { jurisdiction, date, names: { en: en.trim(), ...(ru.trim() ? { ru: ru.trim() } : {}) } },
      });
      if (r.error) throw r.error;
    },
    onSuccess: () => {
      toast.success('Выходной добавлен');
      setDate('');
      setEn('');
      setRu('');
      refresh();
    },
    onError: (e) => toast.error(growthError(e)),
  });
  const remove = useMutation({
    mutationFn: async (h: Holiday) => {
      const yes = await confirm({ title: `Удалить ${h.date}?`, description: h.names.ru ?? h.names.en, confirm: 'Удалить', danger: true });
      if (!yes) return;
      const r = await api.DELETE('/admin/deadlines/holidays/{id}', { params: { path: { id: h.id } } });
      if (r.error) throw r.error;
      refresh();
    },
    onError: (e) => toast.error(growthError(e)),
  });

  const rows = list.data ?? [];
  const years = Array.from({ length: 8 }, (_, i) => thisYear - 1 + i);
  return (
    <>
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <Field label="Где" htmlFor="hd-j">
          <Select id="hd-j" className="w-60" value={jurisdiction} onChange={(e) => setJurisdiction(e.target.value)}>
            {JURISDICTIONS.map((j) => (
              <option key={j.code} value={j.code}>
                {j.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Год" htmlFor="hd-y">
          <Select id="hd-y" className="w-28" value={year} onChange={(e) => setYear(Number(e.target.value))}>
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </Select>
        </Field>
        {canWrite && jurisdiction === 'US' ? (
          <Button variant="soft" loading={federal.isPending} onClick={() => federal.mutate()}>
            <CalendarPlus size={16} /> Добавить федеральные дни {year}
          </Button>
        ) : null}
      </div>
      <p className="mb-3 text-xs text-muted">
        Если для года нет выходных, калькулятор предупреждает «проверьте у суда». Суды штата берут федеральные дни плюс свои.
      </p>
      <ErrorNote text={list.error ? errorText(list.error) : null} />
      {!list.isPending && !list.error && rows.length === 0 ? (
        <EmptyState icon={CalendarPlus} title="Выходных нет" text="Для этого года и места ничего не заведено." />
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Дата</Th>
              <Th>Название</Th>
              {canWrite ? <Th className="w-12" /> : null}
            </tr>
          </thead>
          <tbody>
            {list.isPending ? (
              <TableEmpty colSpan={canWrite ? 3 : 2} loading />
            ) : (
              rows.map((h) => (
                <tr key={h.id}>
                  <Td className="whitespace-nowrap tabular-nums">{h.date}</Td>
                  <Td>
                    <span className="text-ink">{h.names.ru ?? h.names.en}</span>
                    {h.names.ru ? <span className="ml-2 text-xs text-faint">{h.names.en}</span> : null}
                  </Td>
                  {canWrite ? (
                    <Td>
                      <Button size="sm" variant="danger-soft" aria-label="Удалить" onClick={() => remove.mutate(h)}>
                        <Trash size={14} />
                      </Button>
                    </Td>
                  ) : null}
                </tr>
              ))
            )}
          </tbody>
        </Table>
      )}
      {canWrite ? (
        <form
          className="mt-4 flex flex-wrap items-end gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (/^\d{4}-\d{2}-\d{2}$/.test(date) && en.trim()) add.mutate();
          }}
        >
          <Field label="Дата" htmlFor="hd-d">
            <Input id="hd-d" type="date" className="w-44" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="Название (English)" htmlFor="hd-e">
            <Input id="hd-e" className="w-56" maxLength={400} value={en} onChange={(e) => setEn(e.target.value)} />
          </Field>
          <Field label="Название (русский)" htmlFor="hd-r">
            <Input id="hd-r" className="w-56" maxLength={400} value={ru} onChange={(e) => setRu(e.target.value)} />
          </Field>
          <Button type="submit" variant="gold" loading={add.isPending} disabled={!date || !en.trim()}>
            <Plus size={16} /> Добавить
          </Button>
        </form>
      ) : null}
      {dialog}
    </>
  );
}
