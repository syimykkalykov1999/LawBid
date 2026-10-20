'use client';

import { MagnifyingGlass, Plus, Trash, UploadSimple } from '@phosphor-icons/react';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { LoadMore } from '@/components/billing/shared';
import { ErrorNote } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Badge, Card } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/empty';
import { Field, Input, Select, Textarea } from '@/components/ui/input';
import { Table, TableEmpty, Td, Th } from '@/components/ui/table';
import { Tabs } from '@/components/ui/tabs';
import { useToast } from '@/components/ui/toast';
import { api, errorText } from '@/lib/api/client';
import type { components } from '@/lib/api/schema';
import { useMe } from '@/lib/hooks';
import { can } from '@/lib/rbac';
import { formatDateTime } from '@/lib/utils';

type Group = components['schemas']['SynonymGroupDto'];
type Term = components['schemas']['SynonymTermDto'];
type Stat = components['schemas']['SearchQueryStatDto'];
type Tab = 'words' | 'empty' | 'top' | 'learned' | 'check';

const SCOPE: Record<string, string> = { people: 'люди', cases: 'кейсы', posts: 'посты', practices: 'темы' };

/** «ru: развод» per line ⇄ [{lang, term}]. */
export function parseTerms(text: string, fallbackLang = 'ru'): Term[] {
  const out: Term[] = [];
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    const m = /^([a-z]{2,3}(?:-[a-z0-9]{2,8})?)\s*:\s*(.+)$/i.exec(line);
    out.push(m ? { lang: m[1].toLowerCase(), term: m[2].trim() } : { lang: fallbackLang, term: line });
  }
  return out;
}

export function termsText(terms: Term[]): string {
  return terms.map((t) => `${t.lang}: ${t.term}`).join('\n');
}

export function SearchAdmin() {
  const [tab, setTab] = useState<Tab>('words');
  return (
    <>
      <Overview />
      <div className="mb-5">
        <Tabs
          value={tab}
          onChange={setTab}
          items={[
            { value: 'words', label: 'Слова и темы' },
            { value: 'empty', label: 'Не нашлось' },
            { value: 'top', label: 'Что ищут' },
            { value: 'learned', label: 'Чему научился' },
            { value: 'check', label: 'Проверка' },
          ]}
        />
      </div>
      {tab === 'words' ? <WordsPanel /> : null}
      {tab === 'empty' ? <QueriesPanel kind="no-results" /> : null}
      {tab === 'top' ? <QueriesPanel kind="top" /> : null}
      {tab === 'learned' ? <LearnedPanel /> : null}
      {tab === 'check' ? <CheckPanel /> : null}
    </>
  );
}

function Overview() {
  const q = useQuery({
    queryKey: ['search-overview'],
    queryFn: async () => (await api.GET('/admin/search/overview', { params: { query: { days: 7 } } })).data!.data,
  });
  const o = q.data;
  const cell = (label: string, value: number | undefined) => (
    <Card className="px-4 py-3">
      <div className="text-xs text-muted">{label}</div>
      <div className="text-2xl font-semibold tabular-nums text-ink">{value ?? '—'}</div>
    </Card>
  );
  return (
    <div className="mb-5 grid gap-3 sm:grid-cols-3">
      {cell('Запросов за 7 дней', o?.queries)}
      {cell('Из них ничего не нашлось', o?.noResults)}
      {cell('Открыли результат', o?.clicks)}
    </div>
  );
}

function WordsPanel() {
  const { data: me } = useMe();
  const canWrite = can(me, 'content', 'manage');
  const [draft, setDraft] = useState('');
  const [q, setQ] = useState('');
  const [lang, setLang] = useState('');
  const [editing, setEditing] = useState<Group | 'new' | null>(null);
  const [importing, setImporting] = useState(false);
  const qc = useQueryClient();

  const list = useInfiniteQuery({
    queryKey: ['search-synonyms', q, lang],
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }) =>
      (
        await api.GET('/admin/search/synonyms', {
          params: { query: { cursor: pageParam, q: q || undefined, lang: lang || undefined } },
        })
      ).data!,
    getNextPageParam: (last) => last.meta?.nextCursor ?? undefined,
  });
  const rows = list.data?.pages.flatMap((p) => p.data) ?? [];
  const meta = list.data?.pages[0]?.meta as { total?: number; terms?: number } | undefined;
  const refresh = () => void qc.invalidateQueries({ queryKey: ['search-synonyms'] });

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <form
          className="relative"
          onSubmit={(e) => {
            e.preventDefault();
            setQ(draft.trim().toLowerCase());
          }}
        >
          <MagnifyingGlass size={16} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-faint" />
          <Input className="w-full pl-9 sm:w-72" placeholder="Слово или название группы, Enter" value={draft} onChange={(e) => setDraft(e.target.value)} />
        </form>
        <Input className="w-28" placeholder="Язык: ru" value={lang} onChange={(e) => setLang(e.target.value.trim().toLowerCase())} />
        <span className="text-sm text-muted">
          Групп: {meta?.total ?? '—'} · слов и фраз: {meta?.terms ?? '—'}
        </span>
        {canWrite ? (
          <div className="ml-auto flex gap-2">
            <Button variant="outline" onClick={() => setImporting(true)}>
              <UploadSimple size={16} /> Загрузить файл
            </Button>
            <Button variant="gold" onClick={() => setEditing('new')}>
              <Plus size={16} /> Новая группа
            </Button>
          </div>
        ) : null}
      </div>
      <ErrorNote text={list.error ? errorText(list.error) : null} />
      {!list.isPending && !list.error && rows.length === 0 ? (
        <EmptyState icon={MagnifyingGlass} title="Групп нет" text={q ? 'Ничего не нашлось.' : 'Добавьте первую группу слов.'} />
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Группа</Th>
              <Th>Тема</Th>
              <Th>Слова и фразы</Th>
              <Th>Статус</Th>
            </tr>
          </thead>
          <tbody>
            {list.isPending ? (
              <TableEmpty colSpan={4} loading />
            ) : (
              rows.map((g) => (
                <tr key={g.id} className="cursor-pointer" onClick={() => setEditing(g)}>
                  <Td className="font-medium text-ink">{g.key}</Td>
                  <Td className="font-mono text-xs text-muted">{g.practiceCode ?? '—'}</Td>
                  <Td className="max-w-[34rem] text-xs text-muted">
                    {g.terms.slice(0, 10).map((t) => `${t.lang}: ${t.term}`).join(' · ')}
                    {g.terms.length > 10 ? ` · ещё ${g.terms.length - 10}` : ''}
                  </Td>
                  <Td>
                    <Badge tone={g.enabled ? 'success' : 'warning'} dot>
                      {g.enabled ? 'работает' : 'выключена'}
                    </Badge>
                  </Td>
                </tr>
              ))
            )}
          </tbody>
        </Table>
      )}
      <LoadMore q={list} />
      {editing ? (
        <GroupDialog
          group={editing === 'new' ? null : editing}
          canWrite={canWrite}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            refresh();
          }}
        />
      ) : null}
      {importing ? (
        <ImportDialog
          onClose={() => setImporting(false)}
          onDone={() => {
            setImporting(false);
            refresh();
          }}
        />
      ) : null}
    </>
  );
}

function GroupDialog({
  group,
  canWrite,
  onClose,
  onSaved,
}: {
  group: Group | null;
  canWrite: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [key, setKey] = useState(group?.key ?? '');
  const [practice, setPractice] = useState(group?.practiceCode ?? '');
  const [enabled, setEnabled] = useState(group?.enabled ?? true);
  const [text, setText] = useState(group ? termsText(group.terms) : '');

  const save = useMutation({
    mutationFn: async () => {
      const terms = parseTerms(text);
      if (group) {
        return (
          await api.PATCH('/admin/search/synonyms/{id}', {
            params: { path: { id: group.id } },
            body: { practiceCode: practice.trim() || null, enabled, terms },
          })
        ).data!.data;
      }
      return (
        await api.POST('/admin/search/synonyms', {
          body: { key: key.trim(), practiceCode: practice.trim() || undefined, terms },
        })
      ).data!.data;
    },
    onSuccess: () => {
      toast.success('Сохранено. Поиск уже работает по-новому.');
      onSaved();
    },
    onError: (e) => toast.error(e),
  });
  const del = useMutation({
    mutationFn: async () => {
      await api.DELETE('/admin/search/synonyms/{id}', { params: { path: { id: group!.id } } });
    },
    onSuccess: () => {
      toast.success('Группа удалена.');
      onSaved();
    },
    onError: (e) => toast.error(e),
  });
  const ok = (group || /^[a-z0-9][a-z0-9._-]{1,118}$/.test(key.trim())) && parseTerms(text).length > 0;

  return (
    <Dialog
      open
      wide
      onClose={onClose}
      eyebrow="Поиск"
      title={group ? `Группа «${group.key}»` : 'Новая группа слов'}
      description="Все слова и фразы группы значат одно и то же. Поиск по любому из них находит кейсы, посты и адвокатов этой темы."
    >
      <div className="space-y-4">
        {group ? null : (
          <Field label="Название" hint="Латиницей, коротко: divorce, green-card">
            <Input value={key} onChange={(e) => setKey(e.target.value)} />
          </Field>
        )}
        <Field label="Тема" hint="Код темы из «Квалификаций», например family_law.divorce. Пусто — слова просто считаются похожими.">
          <Input value={practice} onChange={(e) => setPractice(e.target.value)} placeholder="family_law.divorce" disabled={!canWrite} />
        </Field>
        <Field label="Слова и фразы" hint="По одной на строку, вида «язык: фраза». Без языка — русский. Бытовые фразы тоже: «ru: муж бьёт».">
          <Textarea className="min-h-56 font-mono text-[13px]" value={text} onChange={(e) => setText(e.target.value)} disabled={!canWrite} />
        </Field>
        {group ? (
          <label className="flex items-center gap-2 text-sm text-ink">
            <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} disabled={!canWrite} />
            Группа работает
          </label>
        ) : null}
        {canWrite ? (
          <div className="flex items-center justify-between gap-2">
            {group ? (
              <Button variant="danger-soft" loading={del.isPending} onClick={() => del.mutate()}>
                <Trash size={16} /> Удалить
              </Button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button variant="ghost" onClick={onClose}>
                Отмена
              </Button>
              <Button variant="gold" disabled={!ok} loading={save.isPending} onClick={() => save.mutate()}>
                Сохранить
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    </Dialog>
  );
}

function ImportDialog({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [text, setText] = useState('');
  const run = useMutation({
    mutationFn: async () => {
      const parsed = JSON.parse(text) as { groups?: unknown } | unknown[];
      const groups = Array.isArray(parsed) ? parsed : parsed.groups;
      return (await api.POST('/admin/search/synonyms/import', { body: { groups: groups as never } })).data!.data;
    },
    onSuccess: (r) => {
      toast.success(
        `Групп новых: ${r.groupsCreated}, дополнено: ${r.groupsUpdated}, фраз добавлено: ${r.termsAdded}.` +
          (r.unknownPractices.length ? ` Нет таких тем: ${r.unknownPractices.join(', ')}.` : ''),
      );
      onDone();
    },
    onError: (e) => toast.error(e instanceof SyntaxError ? 'Это не похоже на файл словаря (JSON).' : e),
  });
  return (
    <Dialog
      open
      wide
      onClose={onClose}
      eyebrow="Поиск"
      title="Загрузить словарь"
      description='Вставьте содержимое файла: {"groups":[{"key":"divorce","practice":"family_law.divorce","terms":{"en":["divorce"],"ru":["развод"]}}]}. Новые фразы добавятся, старые не удаляются.'
    >
      <div className="space-y-4">
        <Textarea className="min-h-64 font-mono text-[12px]" value={text} onChange={(e) => setText(e.target.value)} />
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Отмена
          </Button>
          <Button variant="gold" disabled={!text.trim()} loading={run.isPending} onClick={() => run.mutate()}>
            Загрузить
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

function QueriesPanel({ kind }: { kind: 'no-results' | 'top' }) {
  const { data: me } = useMe();
  const canWrite = can(me, 'content', 'manage');
  const [days, setDays] = useState('7');
  const [adding, setAdding] = useState<string | null>(null);
  const q = useQuery({
    queryKey: ['search-queries', kind, days],
    queryFn: async () =>
      (
        await api.GET(kind === 'no-results' ? '/admin/search/no-results' : '/admin/search/top', {
          params: { query: { days: Number(days) } },
        })
      ).data!.data as Stat[],
  });
  const rows = q.data ?? [];
  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Tabs
          size="sm"
          value={days}
          onChange={setDays}
          items={[
            { value: '1', label: 'Сутки' },
            { value: '7', label: '7 дней' },
            { value: '30', label: '30 дней' },
          ]}
        />
        <span className="text-sm text-muted">
          {kind === 'no-results'
            ? 'Что искали и ничего не нашли. Добавьте такие слова в группу — следующий поиск найдёт.'
            : 'Самые частые запросы.'}
        </span>
      </div>
      <ErrorNote text={q.error ? errorText(q.error) : null} />
      <Table>
        <thead>
          <tr>
            <Th>Запрос</Th>
            <Th className="text-right">Раз</Th>
            <Th className="text-right">Людей</Th>
            <Th>Где искали</Th>
            <Th>Последний раз</Th>
            {kind === 'no-results' && canWrite ? <Th /> : null}
          </tr>
        </thead>
        <tbody>
          {q.isPending ? (
            <TableEmpty colSpan={6} loading />
          ) : rows.length === 0 ? (
            <TableEmpty colSpan={6}>{kind === 'no-results' ? 'Всё находилось. Пока пусто.' : 'Запросов пока нет.'}</TableEmpty>
          ) : (
            rows.map((r) => (
              <tr key={r.q}>
                <Td className="font-medium text-ink">{r.q}</Td>
                <Td className="text-right tabular-nums">{r.count}</Td>
                <Td className="text-right tabular-nums">{r.people}</Td>
                <Td className="text-xs text-muted">{r.scopes.map((s) => SCOPE[s] ?? s).join(', ')}</Td>
                <Td className="whitespace-nowrap text-xs text-muted">{formatDateTime(r.lastAt)}</Td>
                {kind === 'no-results' && canWrite ? (
                  <Td className="text-right">
                    <Button size="sm" variant="soft" onClick={() => setAdding(r.q)}>
                      В группу
                    </Button>
                  </Td>
                ) : null}
              </tr>
            ))
          )}
        </tbody>
      </Table>
      {adding ? <AddToGroupDialog phrase={adding} onClose={() => setAdding(null)} /> : null}
    </>
  );
}

function AddToGroupDialog({ phrase, onClose }: { phrase: string; onClose: () => void }) {
  const toast = useToast();
  const qc = useQueryClient();
  const [lang, setLang] = useState('ru');
  const [find, setFind] = useState('');
  const [groupId, setGroupId] = useState('');
  const groups = useQuery({
    queryKey: ['search-synonyms-pick', find],
    queryFn: async () => (await api.GET('/admin/search/synonyms', { params: { query: { q: find || undefined } } })).data!.data,
  });
  const add = useMutation({
    mutationFn: async () =>
      (
        await api.POST('/admin/search/synonyms/{id}/terms', {
          params: { path: { id: groupId } },
          body: { lang, term: phrase },
        })
      ).data!.data,
    onSuccess: (g) => {
      toast.success(`Добавлено в «${g.key}». Поиск уже знает это слово.`);
      void qc.invalidateQueries({ queryKey: ['search-synonyms'] });
      onClose();
    },
    onError: (e) => toast.error(e),
  });
  return (
    <Dialog open onClose={onClose} eyebrow="Поиск" title={`«${phrase}» в группу`} description="Выберите группу, в которой это слово значит то же самое.">
      <div className="space-y-4">
        <Field label="Язык фразы">
          <Input value={lang} onChange={(e) => setLang(e.target.value.trim().toLowerCase())} className="w-28" />
        </Field>
        <Field label="Найти группу">
          <Input value={find} onChange={(e) => setFind(e.target.value.trim().toLowerCase())} placeholder="divorce, развод…" />
        </Field>
        <Select value={groupId} onChange={(e) => setGroupId(e.target.value)}>
          <option value="">— выберите —</option>
          {(groups.data ?? []).map((g) => (
            <option key={g.id} value={g.id}>
              {g.key} · {g.practiceCode ?? 'без темы'}
            </option>
          ))}
        </Select>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Отмена
          </Button>
          <Button variant="gold" disabled={!groupId || lang.length < 2} loading={add.isPending} onClick={() => add.mutate()}>
            Добавить
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

function LearnedPanel() {
  const q = useQuery({
    queryKey: ['search-learned'],
    queryFn: async () => (await api.GET('/admin/search/learned')).data!.data,
  });
  const rows = q.data ?? [];
  return (
    <>
      <p className="mb-4 text-sm text-muted">
        Каждую ночь поиск смотрит, какие темы люди открывают после запроса, и запоминает связь, если так сделали несколько разных людей (число — в «Настройках»: search.learn_min_users).
      </p>
      <ErrorNote text={q.error ? errorText(q.error) : null} />
      <Table>
        <thead>
          <tr>
            <Th>Запрос</Th>
            <Th>Тема</Th>
            <Th className="text-right">Людей</Th>
          </tr>
        </thead>
        <tbody>
          {q.isPending ? (
            <TableEmpty colSpan={3} loading />
          ) : rows.length === 0 ? (
            <TableEmpty colSpan={3}>Пока ничему не научился: нужны открытые результаты после запросов.</TableEmpty>
          ) : (
            rows.map((r) => (
              <tr key={`${r.q}|${r.practiceCode}`}>
                <Td className="font-medium text-ink">{r.q}</Td>
                <Td className="font-mono text-xs text-muted">{r.practiceCode}</Td>
                <Td className="text-right tabular-nums">{r.score}</Td>
              </tr>
            ))
          )}
        </tbody>
      </Table>
    </>
  );
}

function CheckPanel() {
  const [text, setText] = useState('');
  const check = useMutation({
    mutationFn: async () =>
      (await api.GET('/admin/search/synonyms/test', { params: { query: { q: text.trim() } } })).data!.data,
  });
  const r = check.data;
  return (
    <div className="max-w-2xl space-y-4">
      <p className="text-sm text-muted">Введите запрос так, как его напишет человек, и увидите, какие группы и темы поиск поймёт.</p>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (text.trim().length >= 2) check.mutate();
        }}
      >
        <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="муж бьёт меня" />
        <Button variant="gold" loading={check.isPending} disabled={text.trim().length < 2}>
          Проверить
        </Button>
      </form>
      <ErrorNote text={check.error ? errorText(check.error) : null} />
      {r ? (
        <Card className="space-y-2 p-4 text-sm">
          <div>
            <span className="text-muted">Группы: </span>
            {r.groupKeys.length ? r.groupKeys.join(', ') : 'не нашлось — поиск пойдёт только по словам'}
          </div>
          <div>
            <span className="text-muted">Темы: </span>
            {r.practiceCodes.length ? r.practiceCodes.join(', ') : '—'}
          </div>
        </Card>
      ) : null}
    </div>
  );
}
