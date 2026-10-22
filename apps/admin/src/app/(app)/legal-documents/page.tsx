'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useConfirm } from '@/components/legacy/confirm';
import { ErrorNote, PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Badge, Card, CardContent, CardHeader, CardTitle, type Tone } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { Input, Label, Textarea } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Table, TableEmpty, Td, Th } from '@/components/ui/table';
import { Tabs } from '@/components/ui/tabs';
import { useToast } from '@/components/ui/toast';
import { api, errorText } from '@/lib/api/client';
import type { components } from '@/lib/api/schema';
import { useMe } from '@/lib/hooks';
import { label, LEGAL_DOC_TYPE } from '@/lib/labels';
import { formatDateTime } from '@/lib/utils';

type Row = components['schemas']['AdminLegalDocumentRowDto'];
type LocaleState = components['schemas']['AdminLegalLocaleStateDto'];
type Version = components['schemas']['AdminLegalVersionDto'];
type DocType = Row['docType'];
// Owner 2026-10-22 (audit #4 §4): the ten legal languages of the API.
const LOCALES = ['ru', 'en', 'es', 'fr', 'de', 'it', 'pt', 'nl', 'pl', 'uk'] as const;
type Locale = (typeof LOCALES)[number];

const LOCALE_LABEL: Record<Locale, string> = {
  ru: 'Русский',
  en: 'English',
  es: 'Español',
  fr: 'Français',
  de: 'Deutsch',
  it: 'Italiano',
  pt: 'Português',
  nl: 'Nederlands',
  pl: 'Polski',
  uk: 'Українська',
};

const STATE_BADGE: Record<LocaleState['state'], { tone: Tone; text: string }> = {
  none: { tone: 'neutral', text: 'нет текста' },
  draft: { tone: 'gold', text: 'черновик' },
  published: { tone: 'success', text: 'опубликован' },
  published_draft: { tone: 'info', text: 'есть правки' },
};

/** Owner 2026-10-05 (legal): one place to edit every legal document. The texts
 * are drafts for review by a licensed US attorney; this page is not legal advice. */
export default function LegalDocumentsPage() {
  const [openType, setOpenType] = useState<DocType | null>(null);
  const q = useQuery({
    queryKey: ['legal-documents'],
    queryFn: async () => (await api.GET('/admin/legal/documents')).data!.data,
  });
  const rows = q.data ?? [];

  return (
    <>
      <PageHeader
        eyebrow="Система"
        title="Юридические документы"
        subtitle="Все юридические тексты приложения и сайта: правка черновика, публикация, история и откат."
      />
      <Card className="mb-4">
        <CardContent className="space-y-1 pt-5 text-sm text-muted">
          <p>
            Тексты — черновики для проверки лицензированным юристом США; они не заменяют юридическую консультацию. Перед
            публикацией дайте юристу прочитать новую версию.
          </p>
          <p>
            Правка сохраняется как черновик и никому не видна, пока документ не опубликован. Публиковать может только
            главный администратор. Каждая публикация получает номер по дате, например 2026-10-05.1.
          </p>
          <p>
            Тексты дисклеймеров и контакты для жалоб DMCA лежат в отдельном разделе:{' '}
            <Link href="/legal-settings" className="text-gold-600 hover:underline">
              Право и жалобы
            </Link>
            .
          </p>
        </CardContent>
      </Card>
      <ErrorNote text={q.error ? errorText(q.error) : null} />
      <Table>
        <thead>
          <tr>
            <Th>Документ</Th>
            {LOCALES.map((l) => (
              <Th key={l} title={LOCALE_LABEL[l]}>
                {l.toUpperCase()}
              </Th>
            ))}
            <Th />
          </tr>
        </thead>
        <tbody>
          {q.isPending ? <TableEmpty colSpan={LOCALES.length + 2} loading /> : null}
          {rows.map((r) => (
            <tr key={r.docType} className={openType === r.docType ? 'bg-accent-soft' : undefined}>
              <Td className="text-ink">
                <span title={r.docType}>{label(LEGAL_DOC_TYPE, r.docType)}</span>
              </Td>
              {LOCALES.map((loc) => (
                <Td key={loc}>
                  <LocaleCell state={r.locales.find((l) => l.locale === loc)} />
                </Td>
              ))}
              <Td>
                <div className="flex justify-end">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setOpenType(openType === r.docType ? null : r.docType)}
                  >
                    {openType === r.docType ? 'Закрыть' : 'Открыть'}
                  </Button>
                </div>
              </Td>
            </tr>
          ))}
        </tbody>
      </Table>
      {openType ? <Editor key={openType} docType={openType} onClose={() => setOpenType(null)} /> : null}
    </>
  );
}

function LocaleCell({ state }: { state?: LocaleState }) {
  if (!state) return <Badge>нет текста</Badge>;
  const b = STATE_BADGE[state.state];
  return (
    <div className="space-y-0.5">
      <Badge tone={b.tone} dot>
        {b.text}
      </Badge>
      {state.currentVersion ? (
        <div className="font-mono text-xs text-muted">
          {state.currentVersion}
          {state.publishedAt ? ` · ${formatDateTime(state.publishedAt)}` : ''}
        </div>
      ) : null}
    </div>
  );
}

function Editor({ docType, onClose }: { docType: DocType; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const { data: me } = useMe();
  const isSuper = me?.role === 'super_admin';
  const { confirm, dialog } = useConfirm();
  const [locale, setLocale] = useState<Locale>('ru');
  const [text, setText] = useState('');
  const [note, setNote] = useState('');
  const [dirty, setDirty] = useState(false);
  const [preview, setPreview] = useState(false);
  const [publishing, setPublishing] = useState(false);

  const detail = useQuery({
    queryKey: ['legal-documents', docType],
    queryFn: async () =>
      (await api.GET('/admin/legal/documents/{type}', { params: { path: { type: docType } } })).data!.data,
  });
  const history = useQuery({
    queryKey: ['legal-documents', docType, locale, 'history'],
    queryFn: async () =>
      (await api.GET('/admin/legal/documents/{type}/{locale}/history', { params: { path: { type: docType, locale } } }))
        .data!.data,
  });

  const loc = detail.data?.locales.find((l) => l.locale === locale);
  const source = loc?.draft?.contentMd ?? loc?.current?.contentMd ?? '';

  // Load the text of the chosen language (the draft wins over the published one).
  useEffect(() => {
    if (!detail.data) return;
    setText(source);
    setDirty(false);
    setNote('');
  }, [detail.data, locale, source]);

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['legal-documents'] });
  };

  const saveDraft = useMutation({
    mutationFn: async () => {
      await api.PUT('/admin/legal/documents/{type}/{locale}/draft', {
        params: { path: { type: docType, locale } },
        body: { contentMd: text, ...(note.trim() ? { changeNote: note.trim() } : {}) },
      });
    },
    onSuccess: () => {
      toast.success('Черновик сохранён. Пользователи его не видят, пока вы не опубликуете.');
      setDirty(false);
      refresh();
    },
    onError: (e) => toast.error(e),
  });

  const discard = useMutation({
    mutationFn: async () => {
      const ok = await confirm({
        title: 'Удалить черновик?',
        description: 'Правки пропадут. Опубликованная версия не изменится.',
        confirm: 'Удалить черновик',
        danger: true,
      });
      if (!ok) return false;
      await api.DELETE('/admin/legal/documents/{type}/{locale}/draft', {
        params: { path: { type: docType, locale } },
      });
      return true;
    },
    onSuccess: (done) => {
      if (!done) return;
      toast.success('Черновик удалён');
      refresh();
    },
    onError: (e) => toast.error(e),
  });

  const rollback = useMutation({
    mutationFn: async (v: Version) => {
      const ok = await confirm({
        title: `Откатить к версии ${v.version}?`,
        description:
          'Будет создана новая версия с текстом выбранной. Старые версии не удаляются. Пользователям придётся принять её заново.',
        confirm: 'Откатить',
      });
      if (!ok) return false;
      await api.POST('/admin/legal/documents/version/{id}/rollback', {
        params: { path: { id: v.id } },
        body: { requiresReacceptance: true, changeNote: `Откат к версии ${v.version}` },
      });
      return true;
    },
    onSuccess: (done) => {
      if (!done) return;
      toast.success('Новая версия создана из старой');
      refresh();
    },
    onError: (e) => toast.error(e),
  });

  return (
    <Card className="mt-4">
      {dialog}
      <CardHeader className="flex flex-wrap items-center justify-between gap-2">
        <CardTitle>{label(LEGAL_DOC_TYPE, docType)}</CardTitle>
        <div className="flex flex-wrap items-center gap-2">
          <Tabs
            size="sm"
            value={locale}
            onChange={(v) => {
              if (dirty && !window.confirm('Несохранённые правки пропадут. Перейти на другой язык?')) return;
              setLocale(v);
            }}
            items={LOCALES.map((l) => ({ value: l, label: LOCALE_LABEL[l] }))}
          />
          <Button size="sm" variant="ghost" onClick={onClose}>
            Закрыть
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <ErrorNote text={detail.error ? errorText(detail.error) : null} />
        {loc?.current ? (
          <p className="text-sm text-muted">
            Сейчас у пользователей: версия <span className="font-mono">{loc.current.version}</span>
            {loc.current.publishedAt ? `, опубликована ${formatDateTime(loc.current.publishedAt)}` : ''}.
            {loc.draft ? ' Ниже — ваш черновик с правками.' : ''}
          </p>
        ) : (
          <p className="text-sm text-muted">Этот язык ещё не опубликован. Ниже — текст по умолчанию (черновик).</p>
        )}

        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <Label htmlFor="legal-md">Текст (Markdown)</Label>
            <Tabs
              size="sm"
              value={preview ? 'view' : 'edit'}
              onChange={(v) => setPreview(v === 'view')}
              items={[
                { value: 'edit', label: 'Правка' },
                { value: 'view', label: 'Просмотр' },
              ]}
            />
          </div>
          {preview ? (
            <div className="max-h-[32rem] overflow-auto rounded-xl border border-line bg-surface-2 p-4">
              <MarkdownPreview source={text} />
            </div>
          ) : (
            <Textarea
              id="legal-md"
              rows={18}
              className="font-mono text-xs"
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                setDirty(true);
              }}
            />
          )}
          <p className="text-xs text-muted">
            Заголовки — «## Раздел», списки — «- пункт», жирный — «**текст**», ссылки — «[текст](https://…)».
          </p>
        </div>

        <div className="space-y-1">
          <Label htmlFor="legal-note">Что изменилось (для истории, необязательно)</Label>
          <Input
            id="legal-note"
            maxLength={1000}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Например: уточнили раздел про возвраты"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            disabled={!dirty || !text.trim() || saveDraft.isPending}
            onClick={() => saveDraft.mutate()}
          >
            Сохранить черновик
          </Button>
          {loc?.draft ? (
            <Button variant="ghost" disabled={discard.isPending} onClick={() => discard.mutate()}>
              Удалить черновик
            </Button>
          ) : null}
          {isSuper ? (
            <Button
              variant="gold"
              disabled={dirty || !loc?.draft || publishing}
              title={dirty ? 'Сначала сохраните черновик' : undefined}
              onClick={() => setPublishing(true)}
            >
              Опубликовать
            </Button>
          ) : (
            <span className="text-xs text-muted">Публиковать может только главный администратор.</span>
          )}
        </div>
        {dirty ? <p className="text-xs text-muted">Есть несохранённые правки: сохраните черновик, чтобы опубликовать.</p> : null}

        <div>
          <h3 className="mb-2 text-sm font-semibold text-ink">История версий ({LOCALE_LABEL[locale]})</h3>
          <ErrorNote text={history.error ? errorText(history.error) : null} />
          <Table>
            <thead>
              <tr>
                <Th>Версия</Th>
                <Th>Опубликована</Th>
                <Th>Кто</Th>
                <Th>Заметка</Th>
                <Th>Повторное согласие</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {history.isPending ? <TableEmpty colSpan={6} loading /> : null}
              {!history.isPending && (history.data ?? []).length === 0 ? (
                <TableEmpty colSpan={6}>Опубликованных версий пока нет.</TableEmpty>
              ) : null}
              {(history.data ?? []).map((v) => (
                <tr key={v.id}>
                  <Td className="font-mono">
                    {v.version}{' '}
                    {v.isCurrent ? (
                      <Badge tone="success" dot>
                        текущая
                      </Badge>
                    ) : null}
                  </Td>
                  <Td>{v.publishedAt ? formatDateTime(v.publishedAt) : '—'}</Td>
                  <Td>{v.changedByName ?? '—'}</Td>
                  <Td className="max-w-xs break-words">{v.changeNote ?? (v.rollbackOfId ? 'Откат' : '—')}</Td>
                  <Td>{v.requiresReacceptance ? 'требовалось' : 'нет'}</Td>
                  <Td>
                    <div className="flex justify-end">
                      {isSuper && !v.isCurrent ? (
                        <Button size="sm" variant="ghost" disabled={rollback.isPending} onClick={() => rollback.mutate(v)}>
                          Откатить
                        </Button>
                      ) : null}
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </div>
      </CardContent>
      <PublishDialog
        open={publishing}
        title={`${label(LEGAL_DOC_TYPE, docType)} · ${LOCALE_LABEL[locale]}`}
        onClose={() => setPublishing(false)}
        onPublished={() => {
          setPublishing(false);
          toast.success('Документ опубликован');
          refresh();
        }}
        docType={docType}
        locale={locale}
        initialNote={note}
      />
    </Card>
  );
}

function PublishDialog({
  open,
  title,
  docType,
  locale,
  initialNote,
  onClose,
  onPublished,
}: {
  open: boolean;
  title: string;
  docType: DocType;
  locale: Locale;
  initialNote: string;
  onClose: () => void;
  onPublished: () => void;
}) {
  const toast = useToast();
  const [again, setAgain] = useState(true);
  const [note, setNote] = useState(initialNote);
  useEffect(() => {
    if (open) {
      setAgain(true);
      setNote(initialNote);
    }
    // Reset only when the dialog opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const publish = useMutation({
    mutationFn: async () => {
      await api.POST('/admin/legal/documents/{type}/{locale}/publish', {
        params: { path: { type: docType, locale } },
        body: { requiresReacceptance: again, ...(note.trim() ? { changeNote: note.trim() } : {}) },
      });
    },
    onSuccess: onPublished,
    onError: (e) => toast.error(e),
  });

  return (
    <Dialog
      open={open}
      onClose={onClose}
      eyebrow="Публикация"
      title={`Опубликовать: ${title}?`}
      description="Черновик станет текущей версией и сразу появится у пользователей. Старая версия останется в истории."
    >
      <div className="space-y-4 text-sm">
        <div className="flex items-start gap-3">
          <Switch checked={again} onChange={setAgain} label="Требовать повторного согласия" />
          <div>
            <div className="font-medium text-ink">Требовать повторного согласия</div>
            <p className="text-xs text-muted">
              Включите при существенных изменениях: все, кто принял прежнюю версию, увидят экран с просьбой принять
              новую и не смогут опубликовать кейс или сделать ставку, пока не примут. Для правки опечаток выключите.
            </p>
          </div>
        </div>
        <div className="space-y-1">
          <Label htmlFor="pub-note">Что изменилось</Label>
          <Input id="pub-note" maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
        <p className="text-xs text-muted">
          Убедитесь, что новый текст прочитал лицензированный юрист США: сервис не даёт юридических консультаций.
        </p>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Отмена
          </Button>
          <Button type="button" variant="gold" disabled={publish.isPending} onClick={() => publish.mutate()}>
            Опубликовать
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Small Markdown preview (headings, lists, bold, links). Plain React nodes only,
// so the text is never injected as HTML.

function inline(text: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  const re = /\*\*([^*]+)\*\*|\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    if (m[1] !== undefined) out.push(<strong key={i++}>{m[1]}</strong>);
    else
      out.push(
        <a key={i++} href={m[3]} target="_blank" rel="noreferrer" className="text-gold-600 hover:underline">
          {m[2]}
        </a>,
      );
    last = re.lastIndex;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

function MarkdownPreview({ source }: { source: string }) {
  const blocks: React.ReactNode[] = [];
  const lines = source.split('\n');
  let para: string[] = [];
  let list: string[] = [];
  const flushPara = () => {
    if (para.length) blocks.push(<p key={blocks.length} className="my-2 text-sm text-ink">{inline(para.join(' '))}</p>);
    para = [];
  };
  const flushList = () => {
    if (list.length)
      blocks.push(
        <ul key={blocks.length} className="my-2 list-disc space-y-1 pl-5 text-sm text-ink">
          {list.map((l, i) => (
            <li key={i}>{inline(l)}</li>
          ))}
        </ul>,
      );
    list = [];
  };
  for (const raw of lines) {
    const line = raw.trim();
    const h = /^(#{1,3})\s+(.*)$/.exec(line);
    const li = /^[-*]\s+(.*)$/.exec(line);
    if (h) {
      flushPara();
      flushList();
      const cls = h[1].length === 1 ? 'mt-3 text-xl font-semibold' : 'mt-3 text-base font-semibold';
      blocks.push(
        <div key={blocks.length} role="heading" aria-level={h[1].length} className={`${cls} text-ink`}>
          {inline(h[2])}
        </div>,
      );
    } else if (li) {
      flushPara();
      list.push(li[1]);
    } else if (!line) {
      flushPara();
      flushList();
    } else {
      flushList();
      para.push(line);
    }
  }
  flushPara();
  flushList();
  return <div>{blocks}</div>;
}
