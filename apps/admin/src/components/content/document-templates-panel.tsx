'use client';

import { DownloadSimple, Eye, EyeSlash, FileText, MagnifyingGlass, Plus, Trash, UploadSimple } from '@phosphor-icons/react';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { LoadMore } from '@/components/billing/shared';
import { BulkBar, PageSelectBox, RowSelectBox, useSelection } from '@/components/bulk/bulk-controls';
import { growthError } from '@/components/growth/errors';
import { useConfirm } from '@/components/legacy/confirm';
import { formatBytes, sha256Hex, sleep } from '@/components/media/media-utils';
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
import { collectIds, count, type Noun, resultText, runInBatches } from '@/lib/bulk';
import { useMe } from '@/lib/hooks';
import { can } from '@/lib/rbac';
import { US_STATES } from '@/lib/us-states';
import { formatDateTime } from '@/lib/utils';

type Template = components['schemas']['AdminDocumentTemplateDto'];
type Mime = components['schemas']['AdminTemplateUploadDto']['mime'];
type Audience = components['schemas']['TemplateAudience'];
type Status = 'all' | 'published' | 'drafts';

const TEMPLATES: Noun = ['шаблон', 'шаблона', 'шаблонов'];
const MIMES: Mime[] = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
];
const ACCEPT = '.pdf,.docx,.doc,' + MIMES.join(',');
const POLL_MS = 2000;
const POLL_TRIES = 30;

/** Languages a template can be written in (the app filters by them). */
const LANGUAGES: { code: string; name: string }[] = [
  { code: 'en', name: 'English' },
  { code: 'es', name: 'Español' },
  { code: 'ru', name: 'Русский' },
  { code: 'zh', name: '中文' },
  { code: 'vi', name: 'Tiếng Việt' },
  { code: 'ko', name: '한국어' },
  { code: 'tl', name: 'Tagalog' },
  { code: 'ar', name: 'العربية' },
  { code: 'fr', name: 'Français' },
  { code: 'ht', name: 'Kreyòl' },
  { code: 'pt', name: 'Português' },
  { code: 'pl', name: 'Polski' },
  { code: 'uk', name: 'Українська' },
];

function mimeOf(f: File): Mime | null {
  if ((MIMES as string[]).includes(f.type)) return f.type as Mime;
  const ext = f.name.toLowerCase().split('.').pop();
  if (ext === 'pdf') return 'application/pdf';
  if (ext === 'docx') return MIMES[1];
  if (ext === 'doc') return 'application/msword';
  return null;
}

const typeLabel = (mime: string) => (mime === 'application/pdf' ? 'PDF' : 'Word');

/**
 * Owner 2026-10-05: the document templates library — list with search,
 * draft / published tabs and bulk publish / unpublish / delete; a dialog
 * to upload (presign → S3 → confirm → antivirus scan) and describe a
 * template, or edit one (any field, replace the file).
 */
export function DocumentTemplatesPanel() {
  const { data: me } = useMe();
  const canWrite = can(me, 'content', 'manage');
  const qc = useQueryClient();
  const toast = useToast();
  const { confirm, dialog } = useConfirm();
  const [status, setStatus] = useState<Status>('all');
  const [draft, setDraft] = useState('');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<Template | 'new' | null>(null);
  const sel = useSelection(`${status}|${q}`);

  const fetchPage = async (cursor: string | undefined) =>
    (
      await api.GET('/admin/document-templates', {
        params: {
          query: {
            cursor,
            q: q || undefined,
            published: status === 'all' ? undefined : status === 'published',
          },
        },
      })
    ).data!;
  const list = useInfiniteQuery({
    queryKey: ['document-templates', status, q],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => fetchPage(pageParam),
    getNextPageParam: (last) => last.meta?.nextCursor ?? undefined,
  });
  const rows = list.data?.pages.flatMap((p) => p.data) ?? [];
  const refresh = () => void qc.invalidateQueries({ queryKey: ['document-templates'] });

  const bulk = useMutation({
    mutationFn: async (action: 'publish' | 'unpublish' | 'delete') => {
      const ids = [...sel.selected];
      const verb = action === 'publish' ? 'Опубликовать' : action === 'unpublish' ? 'Снять с публикации' : 'Удалить';
      const ok = await confirm({
        title: `${verb}: ${count(ids.length, TEMPLATES)}?`,
        description:
          action === 'delete'
            ? 'Шаблоны пропадут из приложения. Копии, которые пользователи уже прикрепили к делам и чатам, останутся.'
            : action === 'publish'
              ? 'Шаблоны появятся в приложении.'
              : 'Шаблоны пропадут из приложения и станут черновиками.',
        confirm: verb,
        danger: action === 'delete',
      });
      if (!ok) return null;
      const r = await runInBatches(ids, async (batch) => {
        const res = await api.POST('/admin/document-templates/bulk', { body: { ids: batch, action } });
        if (res.error || !res.data) throw res.error ?? new Error('Пустой ответ');
        return res.data.data;
      });
      const done = action === 'publish' ? 'Опубликовано' : action === 'unpublish' ? 'Снято' : 'Удалено';
      return resultText(r, done, TEMPLATES);
    },
    onSuccess: (text) => {
      if (!text) return;
      toast.success(text);
      sel.clear();
      refresh();
    },
    onError: (e) => toast.error(growthError(e)),
  });

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Tabs
          value={status}
          onChange={setStatus}
          items={[
            { value: 'all', label: 'Все' },
            { value: 'published', label: 'Опубликованы' },
            { value: 'drafts', label: 'Черновики' },
          ]}
        />
        <form
          className="relative ml-auto"
          onSubmit={(e) => {
            e.preventDefault();
            setQ(draft.trim());
          }}
        >
          <MagnifyingGlass size={16} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-faint" />
          <Input className="w-64 pl-9" placeholder="Название, Enter — искать" value={draft} onChange={(e) => setDraft(e.target.value)} />
        </form>
        {canWrite ? (
          <Button variant="gold" onClick={() => setOpen('new')}>
            <Plus size={16} /> Новый шаблон
          </Button>
        ) : null}
      </div>

      {dialog}
      {canWrite ? (
        <BulkBar
          selectedCount={sel.selected.size}
          noun={TEMPLATES}
          onClear={sel.clear}
          onSelectAll={async () => {
            const r = await collectIds(async (c) => {
              const p = await fetchPage(c);
              return { data: p.data, nextCursor: p.meta?.nextCursor };
            });
            sel.replace(r.ids);
            return r.capped;
          }}
        >
          <Button size="sm" variant="soft" disabled={bulk.isPending} onClick={() => bulk.mutate('publish')}>
            <Eye size={14} /> Опубликовать
          </Button>
          <Button size="sm" variant="soft" disabled={bulk.isPending} onClick={() => bulk.mutate('unpublish')}>
            <EyeSlash size={14} /> Снять
          </Button>
          <Button size="sm" variant="danger-soft" disabled={bulk.isPending} onClick={() => bulk.mutate('delete')}>
            <Trash size={14} /> Удалить
          </Button>
        </BulkBar>
      ) : null}
      <ErrorNote text={list.error ? errorText(list.error) : null} />
      {!list.isPending && !list.error && rows.length === 0 ? (
        <EmptyState icon={FileText} title="Шаблонов нет" text={q ? 'Ничего не нашлось.' : 'Загрузите первый шаблон: PDF или Word.'} />
      ) : (
        <Table>
          <thead>
            <tr>
              {canWrite ? (
                <Th className="w-10">
                  <PageSelectBox selected={sel.selected} ids={rows.map((t) => t.id)} onToggle={sel.togglePage} />
                </Th>
              ) : null}
              <Th>Шаблон</Th>
              <Th>Штат</Th>
              <Th>Язык</Th>
              <Th>Кому</Th>
              <Th className="text-right">Скачиваний</Th>
              <Th>Статус</Th>
              <Th>Изменён</Th>
            </tr>
          </thead>
          <tbody>
            {list.isPending ? (
              <TableEmpty colSpan={canWrite ? 8 : 7} loading />
            ) : (
              rows.map((t) => (
                <tr key={t.id} className="cursor-pointer" onClick={() => setOpen(t)}>
                  {canWrite ? (
                    <Td onClick={(e) => e.stopPropagation()}>
                      <RowSelectBox selected={sel.selected} id={t.id} onToggle={sel.toggle} />
                    </Td>
                  ) : null}
                  <Td>
                    <div className="font-medium text-ink">{t.title}</div>
                    <div className="text-[11px] text-faint">
                      {typeLabel(t.mime)} · {formatBytes(t.sizeBytes)} · {t.fileName}
                    </div>
                  </Td>
                  <Td className="text-muted">{t.state ?? 'Все'}</Td>
                  <Td className="text-muted uppercase">{t.language}</Td>
                  <Td>
                    <Badge tone={t.audience === 'lawyers' ? 'info' : 'neutral'}>{t.audience === 'lawyers' ? 'Адвокаты' : 'Все'}</Badge>
                  </Td>
                  <Td className="text-right tabular-nums">{t.downloadCount}</Td>
                  <Td>
                    <Badge tone={t.published ? 'success' : 'warning'} dot>
                      {t.published ? 'опубликован' : 'черновик'}
                    </Badge>
                  </Td>
                  <Td className="whitespace-nowrap text-xs text-muted">{formatDateTime(t.updatedAt)}</Td>
                </tr>
              ))
            )}
          </tbody>
        </Table>
      )}
      <LoadMore q={list} />

      {open ? (
        <TemplateDialog
          template={open === 'new' ? null : open}
          canWrite={canWrite}
          onClose={() => setOpen(null)}
          onSaved={() => {
            setOpen(null);
            refresh();
          }}
        />
      ) : null}
    </>
  );
}

/** Upload one file through presign → S3 → confirm → wait for a clean scan. */
async function uploadTemplate(file: File, mime: Mime, onStep: (text: string) => void): Promise<string> {
  onStep('Считаем контрольную сумму…');
  const sha256 = await sha256Hex(file);
  onStep('Готовим загрузку…');
  const presigned = (await api.POST('/admin/document-templates/uploads', { body: { mime, sizeBytes: file.size, sha256 } })).data!.data;
  onStep('Загружаем файл…');
  const form = new FormData();
  for (const [k, v] of Object.entries(presigned.upload.fields)) form.append(k, v);
  form.append('file', file); // S3 POST policy: the file goes last
  let res: Response;
  try {
    res = await fetch(presigned.upload.url, { method: 'POST', body: form });
  } catch {
    throw new Error('Не удалось отправить файл в хранилище (сеть или CORS).');
  }
  if (!res.ok) throw new Error(`Хранилище отклонило файл (HTTP ${res.status}).`);
  onStep('Проверка на вирусы…');
  for (let i = 0; i < POLL_TRIES; i++) {
    const f = (await api.POST('/admin/document-templates/uploads/{fileId}/confirm', { params: { path: { fileId: presigned.fileId } } })).data!.data;
    if (f.scanStatus === 'clean') return presigned.fileId;
    if (f.scanStatus === 'infected') throw new Error('Файл не прошёл проверку на вирусы.');
    if (f.scanStatus === 'failed') throw new Error('Проверка файла не удалась. Попробуйте другой файл.');
    await sleep(POLL_MS);
  }
  throw new Error('Проверка файла идёт дольше обычного. Сохраните шаблон чуть позже.');
}

function TemplateDialog({
  template,
  canWrite,
  onClose,
  onSaved,
}: {
  template: Template | null;
  canWrite: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const { confirm, dialog } = useConfirm();
  const [key] = useState(() => crypto.randomUUID());
  const [file, setFile] = useState<File | null>(null);
  const [step, setStep] = useState<string | null>(null);
  const [title, setTitle] = useState(template?.title ?? '');
  const [description, setDescription] = useState(template?.description ?? '');
  const [fileName, setFileName] = useState(template?.fileName ?? '');
  const [practiceAreaId, setPracticeAreaId] = useState(template?.practiceAreaId ?? '');
  const [state, setState] = useState(template?.state ?? '');
  const [language, setLanguage] = useState(template?.language ?? 'en');
  const [audience, setAudience] = useState<Audience>(template?.audience ?? 'everyone');
  const [published, setPublished] = useState(template?.published ?? true);

  const areas = useQuery({
    queryKey: ['admin-practice-areas'],
    queryFn: async () => (await api.GET('/admin/practice-areas')).data!.data,
  });
  const byCode = new Map((areas.data ?? []).map((a) => [a.code, a]));
  const areaOptions = (areas.data ?? [])
    .filter((a) => a.isActive || a.id === practiceAreaId)
    .map((a) => ({ id: a.id, label: a.parentCode ? `${byCode.get(a.parentCode)?.nameEn ?? a.parentCode} → ${a.nameEn}` : a.nameEn }))
    .sort((a, b) => a.label.localeCompare(b.label));

  const mime = file ? mimeOf(file) : null;
  const ok = title.trim().length >= 2 && (template !== null || (file !== null && mime !== null));

  const save = useMutation({
    mutationFn: async () => {
      const fileId = file && mime ? await uploadTemplate(file, mime, setStep) : undefined;
      setStep('Сохраняем…');
      const fields = {
        title: title.trim(),
        description: description.trim(),
        fileName: fileName.trim() || undefined,
        practiceAreaId: practiceAreaId || null,
        state: state || null,
        language,
        audience,
        published,
      };
      if (template) {
        const r = await api.PATCH('/admin/document-templates/{id}', { params: { path: { id: template.id } }, body: { ...fields, fileId } });
        if (r.error) throw r.error;
      } else {
        const r = await api.POST('/admin/document-templates', {
          params: { header: { 'Idempotency-Key': key } },
          body: { ...fields, fileId: fileId! },
        });
        if (r.error) throw r.error;
      }
    },
    onSuccess: () => {
      toast.success(template ? 'Шаблон сохранён' : 'Шаблон добавлен');
      onSaved();
    },
    onError: (e) => {
      setStep(null);
      toast.error(e instanceof Error && !('code' in e) ? e.message : growthError(e));
    },
  });

  const remove = useMutation({
    mutationFn: async () => {
      if (!template) return false;
      const yes = await confirm({
        title: 'Удалить шаблон?',
        description: 'Он пропадёт из приложения. Копии, которые пользователи уже прикрепили, останутся.',
        confirm: 'Удалить',
        danger: true,
      });
      if (!yes) return false;
      const r = await api.DELETE('/admin/document-templates/{id}', { params: { path: { id: template.id } } });
      if (r.error) throw r.error;
      return true;
    },
    onSuccess: (done) => {
      if (!done) return;
      toast.success('Шаблон удалён');
      onSaved();
    },
    onError: (e) => toast.error(growthError(e)),
  });

  const busy = save.isPending || remove.isPending;

  return (
    <>
      <Dialog
        open
        onClose={onClose}
        wide
        eyebrow="Шаблоны документов"
        title={template ? template.title : 'Новый шаблон'}
        description={
          template ? (
            <span className="flex flex-wrap items-center gap-2">
              <span>
                {typeLabel(template.mime)} · {formatBytes(template.sizeBytes)}
              </span>
              <span className="inline-flex items-center gap-1">
                <DownloadSimple size={12} /> {template.downloadCount}
              </span>
              <span>· создан {formatDateTime(template.createdAt)}</span>
            </span>
          ) : (
            'PDF или Word. Файл проверяется на вирусы, затем шаблон появится в приложении.'
          )
        }
      >
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (ok && canWrite) save.mutate();
          }}
        >
          <Field
            label={template ? 'Заменить файл (необязательно)' : 'Файл'}
            htmlFor="tpl-file"
            hint={file && !mime ? 'Подходят только PDF, DOCX и DOC.' : file ? `${file.name} · ${formatBytes(file.size)}` : 'PDF, DOCX или DOC, размер — в Настройках (files.document_template_max_size_mb).'}
          >
            <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-dashed border-line-strong px-4 py-3 text-sm text-muted hover:bg-surface-2">
              <UploadSimple size={16} />
              {file ? file.name : 'Выбрать файл'}
              <input
                id="tpl-file"
                type="file"
                accept={ACCEPT}
                className="sr-only"
                disabled={!canWrite || busy}
                onChange={(e) => {
                  const f = e.target.files?.[0] ?? null;
                  setFile(f);
                  if (f && !title.trim()) setTitle(f.name.replace(/\.[A-Za-z0-9]{1,5}$/, ''));
                }}
              />
            </label>
          </Field>
          <Field label="Название" htmlFor="tpl-title">
            <Input id="tpl-title" maxLength={160} value={title} disabled={!canWrite} onChange={(e) => setTitle(e.target.value)} />
          </Field>
          <Field label="Описание" htmlFor="tpl-desc" hint="Когда пригодится, что заполнить.">
            <Textarea id="tpl-desc" rows={3} maxLength={2000} value={description} disabled={!canWrite} onChange={(e) => setDescription(e.target.value)} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Практика" htmlFor="tpl-area">
              <Select id="tpl-area" value={practiceAreaId} disabled={!canWrite} onChange={(e) => setPracticeAreaId(e.target.value)}>
                <option value="">Любая</option>
                {areaOptions.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Штат" htmlFor="tpl-state">
              <Select id="tpl-state" value={state} disabled={!canWrite} onChange={(e) => setState(e.target.value)}>
                <option value="">Все штаты</option>
                {US_STATES.map((s) => (
                  <option key={s.code} value={s.code}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Язык документа" htmlFor="tpl-lang">
              <Select id="tpl-lang" value={language} disabled={!canWrite} onChange={(e) => setLanguage(e.target.value)}>
                {LANGUAGES.map((l) => (
                  <option key={l.code} value={l.code}>
                    {l.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Кому виден" htmlFor="tpl-aud">
              <Select id="tpl-aud" value={audience} disabled={!canWrite} onChange={(e) => setAudience(e.target.value as Audience)}>
                <option value="everyone">Всем (бесплатно)</option>
                <option value="lawyers">Только адвокатам</option>
              </Select>
            </Field>
          </div>
          <Field label="Имя файла при скачивании" htmlFor="tpl-fname" hint="Пусто — по названию.">
            <Input id="tpl-fname" maxLength={200} value={fileName} disabled={!canWrite} onChange={(e) => setFileName(e.target.value)} />
          </Field>
          <div className="flex items-center gap-3">
            <Switch checked={published} onChange={setPublished} disabled={!canWrite} label="Опубликован" />
            <span className="text-sm text-ink">{published ? 'Опубликован — виден в приложении' : 'Черновик — не виден в приложении'}</span>
          </div>
          {step ? <p className="text-sm text-muted">{step}</p> : null}
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
                <Button type="submit" variant="gold" loading={save.isPending} disabled={!ok || busy}>
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
