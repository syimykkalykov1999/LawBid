'use client';

import { ArrowDown, ArrowUp, FileText, Plus, Trash, WarningCircle } from '@phosphor-icons/react';
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
import { ApiError, api, errorText } from '@/lib/api/client';
import {
  EMPTY_FORM,
  FIELD_TYPES,
  FIELDS_MAX,
  FORM_LANGUAGES,
  type FieldType,
  type FormField,
  type FormState,
  type FormTemplate,
  type Prefill,
  PREFILLS,
  formErrors,
  formFromTemplate,
  keyFromLabel,
  languageList,
  languagesOf,
  mismatch,
  serverErrors,
  toPayload,
} from '@/lib/form-templates';
import { useMe } from '@/lib/hooks';
import { formatDateTime } from '@/lib/utils';

const QUERY_KEY = ['admin-form-templates'];
const langName = (code: string) => FORM_LANGUAGES.find((l) => l.code === code)?.name ?? code.toUpperCase();

/** Problems to show under the form: the API's own list, else its message. */
function saveProblems(e: unknown): string[] {
  if (e instanceof ApiError) {
    const list = serverErrors(e.details);
    if (list.length) return list;
    if (e.code === 'VALIDATION_ERROR') return [e.message];
  }
  return [growthError(e)];
}

/** Owner 2026-10-20 — Content → Document forms: a body with {{places}} per language plus the fields the attorney fills in. */
export function FormTemplatesPanel() {
  const { data: me } = useMe();
  const canWrite = me?.role === 'super_admin' || me?.role === 'moderator';
  const qc = useQueryClient();
  const [open, setOpen] = useState<FormTemplate | 'new' | null>(null);

  const list = useQuery({
    queryKey: QUERY_KEY,
    queryFn: async () => {
      const r = await api.GET('/admin/form-templates');
      if (r.error) throw r.error;
      return r.data.data;
    },
  });
  const areas = useAreas();
  const rows = [...(list.data ?? [])].sort((a, b) => a.position - b.position || a.slug.localeCompare(b.slug));

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-end gap-3">
        {canWrite ? (
          <Button variant="gold" onClick={() => setOpen('new')}>
            <Plus size={16} /> Новая форма
          </Button>
        ) : null}
      </div>
      <ErrorNote text={list.error ? errorText(list.error) : null} />
      {!list.isPending && !list.error && rows.length === 0 ? (
        <EmptyState icon={FileText} title="Форм нет" text="Создайте первую: текст с {{полями}} и список вопросов адвокату." />
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Форма</Th>
              <Th>Практика</Th>
              <Th>Языки</Th>
              <Th className="text-right">Полей</Th>
              <Th>Статус</Th>
              <Th>Изменена</Th>
            </tr>
          </thead>
          <tbody>
            {list.isPending ? (
              <TableEmpty colSpan={6} loading />
            ) : (
              rows.map((t) => (
                <tr key={t.id} className="cursor-pointer" onClick={() => setOpen(t)}>
                  <Td>
                    <div className="font-medium text-ink">{t.title.ru || t.title.en || t.slug}</div>
                    <div className="text-[11px] text-faint">{t.slug}</div>
                  </Td>
                  <Td className="text-muted">{t.practiceAreaId ? (areas.get(t.practiceAreaId) ?? '—') : 'Любая'}</Td>
                  <Td className="text-muted uppercase">{languageList(t).join(', ') || '—'}</Td>
                  <Td className="text-right tabular-nums">{t.fields.length}</Td>
                  <Td>
                    <Badge tone={t.published ? 'success' : 'warning'} dot>
                      {t.published ? 'опубликована' : 'черновик'}
                    </Badge>
                  </Td>
                  <Td className="whitespace-nowrap text-xs text-muted">{formatDateTime(t.updatedAt)}</Td>
                </tr>
              ))
            )}
          </tbody>
        </Table>
      )}
      {open ? (
        <FormTemplateDialog
          template={open === 'new' ? null : open}
          canWrite={canWrite}
          onClose={() => setOpen(null)}
          onSaved={() => {
            setOpen(null);
            void qc.invalidateQueries({ queryKey: QUERY_KEY });
          }}
        />
      ) : null}
    </>
  );
}

type Area = { id: string; label: string; active: boolean };

function usePracticeAreas() {
  return useQuery({
    queryKey: ['admin-practice-areas'],
    queryFn: async () => (await api.GET('/admin/practice-areas')).data!.data,
  });
}

/** id → name, for the list column. */
function useAreas(): Map<string, string> {
  const q = usePracticeAreas();
  return new Map((q.data ?? []).map((a) => [a.id, a.nameEn]));
}

function FormTemplateDialog({
  template,
  canWrite,
  onClose,
  onSaved,
}: {
  template: FormTemplate | null;
  canWrite: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const { confirm, dialog } = useConfirm();
  const [form, setForm] = useState<FormState>(() => (template ? formFromTemplate(template) : EMPTY_FORM));
  const [lang, setLang] = useState('en');
  const [extra, setExtra] = useState<string[]>([]);
  const [problems, setProblems] = useState<string[]>([]);
  const isNew = template === null;

  const areasQuery = usePracticeAreas();
  const byCode = new Map((areasQuery.data ?? []).map((a) => [a.code, a]));
  const areaOptions: Area[] = (areasQuery.data ?? [])
    .filter((a) => a.isActive || a.id === form.practiceAreaId)
    .map((a) => ({
      id: a.id,
      active: a.isActive,
      label: a.parentCode ? `${byCode.get(a.parentCode)?.nameEn ?? a.parentCode} → ${a.nameEn}` : a.nameEn,
    }))
    .sort((a, b) => a.label.localeCompare(b.label));

  const langs = [...new Set([...languagesOf(form), ...extra])];
  const patch = (p: Partial<FormState>) => {
    setForm((f) => ({ ...f, ...p }));
    setProblems([]);
  };
  const setText = (k: 'title' | 'description' | 'body', v: string) => patch({ [k]: { ...form[k], [lang]: v } });
  const setField = (i: number, p: Partial<FormField>) => patch({ fields: form.fields.map((f, j) => (j === i ? { ...f, ...p } : f)) });
  const move = (i: number, d: -1 | 1) => {
    const next = [...form.fields];
    [next[i], next[i + d]] = [next[i + d], next[i]];
    patch({ fields: next });
  };
  const addField = () => {
    let n = form.fields.length + 1;
    while (form.fields.some((f) => f.key === `field_${n}`)) n += 1;
    patch({ fields: [...form.fields, { key: `field_${n}`, type: 'text', required: true, label: {}, prefill: null }] });
  };
  const insertPlace = (key: string) => setText('body', `${form.body[lang] ?? ''}{{${key}}}`);

  const mm = mismatch(form.body, form.fields);
  const local = formErrors(form, { isNew });

  const save = useMutation({
    mutationFn: async () => {
      const body = toPayload(form);
      if (template) {
        const r = await api.PATCH('/admin/form-templates/{id}', {
          params: { path: { id: template.id } },
          body: { ...body, practiceAreaId: form.practiceAreaId || null },
        });
        if (r.error) throw r.error;
      } else {
        const r = await api.POST('/admin/form-templates', {
          body: { ...body, slug: form.slug, practiceAreaId: form.practiceAreaId || undefined },
        });
        if (r.error) throw r.error;
      }
    },
    onSuccess: () => {
      toast.success(template ? 'Форма сохранена' : 'Форма добавлена');
      onSaved();
    },
    onError: (e) => setProblems(saveProblems(e)),
  });

  const remove = useMutation({
    mutationFn: async () => {
      if (!template) return false;
      const yes = await confirm({
        title: 'Удалить форму?',
        description: 'Она пропадёт из приложения. Документы, которые адвокаты уже собрали, останутся.',
        confirm: 'Удалить',
        danger: true,
      });
      if (!yes) return false;
      const r = await api.DELETE('/admin/form-templates/{id}', { params: { path: { id: template.id } } });
      if (r.error) throw r.error;
      return true;
    },
    onSuccess: (done) => {
      if (!done) return;
      toast.success('Форма удалена');
      onSaved();
    },
    onError: (e) => toast.error(growthError(e)),
  });

  const busy = save.isPending || remove.isPending;
  const off = !canWrite || busy;
  const shown = problems.length ? problems : [];

  return (
    <>
      <Dialog
        open
        onClose={onClose}
        wide
        eyebrow="Формы документов"
        title={template ? form.title.ru || form.title.en || template.slug : 'Новая форма'}
        description={template ? `Код ${template.slug} · изменена ${formatDateTime(template.updatedAt)}` : 'Текст документа с местами {{ключ}} и поля, которые заполнит адвокат.'}
      >
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (canWrite && local.length === 0) save.mutate();
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Код" htmlFor="ft-slug" hint={isNew ? 'Латиница и дефис, потом не меняется.' : 'Не меняется.'}>
              <Input id="ft-slug" value={form.slug} maxLength={64} disabled={off || !isNew} placeholder="power-of-attorney" onChange={(e) => patch({ slug: e.target.value.trim().toLowerCase() })} />
            </Field>
            <Field label="Практика" htmlFor="ft-area">
              <Select id="ft-area" value={form.practiceAreaId} disabled={off} onChange={(e) => patch({ practiceAreaId: e.target.value })}>
                <option value="">Любая</option>
                {areaOptions.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.label}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Tabs value={lang} onChange={setLang} size="sm" items={langs.map((l) => ({ value: l, label: l.toUpperCase() }))} />
            <Select
              aria-label="Добавить язык"
              className="h-8 w-40 text-xs"
              value=""
              disabled={off}
              onChange={(e) => {
                if (!e.target.value) return;
                setExtra((x) => [...x, e.target.value]);
                setLang(e.target.value);
              }}
            >
              <option value="">+ язык</option>
              {FORM_LANGUAGES.filter((l) => !langs.includes(l.code)).map((l) => (
                <option key={l.code} value={l.code}>
                  {l.name}
                </option>
              ))}
            </Select>
            <span className="text-xs text-muted">Сейчас: {langName(lang)}{lang === 'en' ? ' (обязателен)' : ''}</span>
          </div>

          <Field label="Название" htmlFor="ft-title">
            <Input id="ft-title" maxLength={160} value={form.title[lang] ?? ''} disabled={off} onChange={(e) => setText('title', e.target.value)} />
          </Field>
          <Field label="Описание" htmlFor="ft-desc" hint="Когда пригодится, что подготовить.">
            <Textarea id="ft-desc" rows={2} maxLength={2000} value={form.description[lang] ?? ''} disabled={off} onChange={(e) => setText('description', e.target.value)} />
          </Field>
          <Field label="Текст документа" htmlFor="ft-body" hint="Места для значений — {{ключ_поля}}. Пустой язык в приложении не показывается.">
            <Textarea id="ft-body" rows={9} className="font-mono text-[13px]" value={form.body[lang] ?? ''} disabled={off} onChange={(e) => setText('body', e.target.value)} />
          </Field>
          {form.fields.length > 0 && canWrite ? (
            <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted">
              Вставить:
              {form.fields.map((f) => (
                <button
                  key={f.key}
                  type="button"
                  disabled={off || !f.key}
                  onClick={() => insertPlace(f.key)}
                  className="rounded-full border border-line bg-surface-2 px-2 py-0.5 font-mono text-[11px] text-ink hover:bg-surface-3 disabled:opacity-50"
                >
                  {`{{${f.key}}}`}
                </button>
              ))}
            </div>
          ) : null}

          <div className="space-y-2 border-t border-line pt-4">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-heading">
                Поля <span className="font-normal text-muted">({form.fields.length}/{FIELDS_MAX})</span>
              </h3>
              <Button type="button" size="sm" variant="soft" disabled={off || form.fields.length >= FIELDS_MAX} onClick={addField}>
                <Plus size={14} /> Поле
              </Button>
            </div>
            {form.fields.length === 0 ? <p className="text-sm text-muted">Полей пока нет: документ будет без вопросов.</p> : null}
            {form.fields.map((f, i) => (
              <div key={i} className="space-y-2 rounded-xl border border-line p-3">
                <div className="grid gap-2 sm:grid-cols-[1fr_8rem_11rem]">
                  <Input aria-label="Ключ" className="font-mono text-[13px]" maxLength={40} placeholder="client_name" value={f.key} disabled={off} onChange={(e) => setField(i, { key: e.target.value.trim().toLowerCase() })} />
                  <Select aria-label="Тип" value={f.type} disabled={off} onChange={(e) => setField(i, { type: e.target.value as FieldType })}>
                    {FIELD_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </Select>
                  <Select aria-label="Подставить" value={f.prefill ?? ''} disabled={off} onChange={(e) => setField(i, { prefill: (e.target.value || null) as Prefill | null })}>
                    <option value="">Не подставлять</option>
                    {PREFILLS.map((p) => (
                      <option key={p.value} value={p.value}>
                        {p.label}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Input
                    aria-label={`Подпись (${lang.toUpperCase()})`}
                    className="min-w-48 flex-1"
                    maxLength={80}
                    placeholder={`Подпись (${lang.toUpperCase()})`}
                    value={f.label[lang] ?? ''}
                    disabled={off}
                    onChange={(e) => {
                      const v = e.target.value;
                      setField(i, { label: { ...f.label, [lang]: v }, ...(lang === 'en' && /^field_\d+$/.test(f.key) && keyFromLabel(v) && !form.fields.some((x) => x.key === keyFromLabel(v)) ? { key: keyFromLabel(v) } : {}) });
                    }}
                  />
                  <label className="flex items-center gap-2 text-xs text-ink">
                    <Switch checked={f.required} onChange={(v) => setField(i, { required: v })} disabled={off} label="Обязательное" />
                    Обязательное
                  </label>
                  <Button type="button" size="sm" variant="ghost" aria-label="Выше" disabled={off || i === 0} onClick={() => move(i, -1)}>
                    <ArrowUp size={14} />
                  </Button>
                  <Button type="button" size="sm" variant="ghost" aria-label="Ниже" disabled={off || i === form.fields.length - 1} onClick={() => move(i, 1)}>
                    <ArrowDown size={14} />
                  </Button>
                  <Button type="button" size="sm" variant="danger-soft" aria-label="Удалить поле" disabled={off} onClick={() => patch({ fields: form.fields.filter((_, j) => j !== i) })}>
                    <Trash size={14} />
                  </Button>
                </div>
              </div>
            ))}
          </div>

          {mm.missing.length > 0 || mm.unused.length > 0 ? (
            <div className="space-y-1 rounded-xl border border-line bg-surface-2 p-3 text-xs">
              {mm.missing.map((m) => (
                <p key={`${m.lang}-${m.key}`} className="flex items-center gap-1.5 text-danger">
                  <WarningCircle size={14} /> В тексте ({m.lang.toUpperCase()}) есть <code>{`{{${m.key}}}`}</code>, а поля нет — сохранить не получится.
                </p>
              ))}
              {mm.unused.length > 0 ? (
                <p className="text-muted">
                  Поля, которых нет ни в одном тексте: {mm.unused.map((k) => `{{${k}}}`).join(', ')}. Адвокат ответит на вопрос зря.
                </p>
              ) : null}
            </div>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
            <div className="flex items-center gap-3">
              <Switch checked={form.published} onChange={(v) => patch({ published: v })} disabled={off} label="Опубликована" />
              <span className="text-sm text-ink">{form.published ? 'Опубликована — видна адвокатам в кейсе' : 'Черновик — не видна в приложении'}</span>
            </div>
            <Field label="Порядок" htmlFor="ft-pos" className="w-28">
              <Input id="ft-pos" type="number" min={0} max={10000} value={form.position} disabled={off} onChange={(e) => patch({ position: Number.parseInt(e.target.value, 10) || 0 })} />
            </Field>
          </div>

          {shown.length > 0 ? (
            <ul role="alert" className="list-disc space-y-0.5 rounded-xl border border-danger/30 bg-danger/5 py-2.5 pr-3 pl-7 text-sm text-danger">
              {shown.map((p, i) => (
                <li key={i}>{p}</li>
              ))}
            </ul>
          ) : local.length > 0 && canWrite ? (
            <p className="text-xs text-muted">Чтобы сохранить: {local[0]}{local.length > 1 ? ` (и ещё ${local.length - 1})` : ''}</p>
          ) : null}

          {canWrite ? (
            <div className="flex flex-wrap justify-between gap-2 border-t border-line pt-4">
              {template ? (
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
                <Button type="submit" variant="gold" loading={save.isPending} disabled={busy || local.length > 0}>
                  {template ? 'Сохранить' : 'Добавить'}
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
