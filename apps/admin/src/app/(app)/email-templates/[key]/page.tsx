'use client';

import {
  ArrowCounterClockwise, ArrowLeft, CaretDown, CopySimple, FloppyDisk, Info, PaperPlaneTilt,
} from '@phosphor-icons/react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { EmailPreview } from '@/components/email/email-preview';
import {
  EMPTY_FORM, fieldErrors, HTML_MAX, LOCALE_LABEL, LOCALES, SUBJECT_MAX, TEXT_MAX, unsample,
  type EmailForm, type EmailKey, type EmailLocale, type EmailTemplateDetail, type FieldName,
} from '@/components/email/email-utils';
import { useDebounced } from '@/components/email/use-debounced';
import { VariableChips } from '@/components/email/variable-chips';
import { ErrorNote, PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Badge, Card } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/empty';
import { Input, Label, Textarea } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Tabs } from '@/components/ui/tabs';
import { useToast } from '@/components/ui/toast';
import { api, errorText } from '@/lib/api/client';
import { useMe } from '@/lib/hooks';
import { cn, formatDateTime } from '@/lib/utils';

/** Code emails whose senders don't pass a locale yet (ru override unused). */
const NO_LOCALE_YET: EmailKey[] = ['login_otp', 'admin_login_code', 'contact_otp'];

function fromDetail(d: EmailTemplateDetail): EmailForm {
  return d.override
    ? {
        subject: d.override.subject,
        textBody: d.override.textBody,
        htmlBody: d.override.htmlBody ?? '',
        enabled: d.override.enabled,
      }
    : EMPTY_FORM;
}

const same = (a: EmailForm, b: EmailForm) =>
  a.subject === b.subject && a.textBody === b.textBody && a.htmlBody === b.htmlBody && a.enabled === b.enabled;

type Confirm = 'reset' | 'base' | null;

/** Editor for one transactional email: EN/RU text, variables, live preview, test send. */
export default function EmailTemplateEditorPage() {
  const { key } = useParams<{ key: EmailKey }>();
  const qc = useQueryClient();
  const toast = useToast();
  const { data: me } = useMe();
  const [locale, setLocale] = useState<EmailLocale>('en');
  // Edits and the saved baseline per locale, so switching tabs keeps drafts.
  const [forms, setForms] = useState<Partial<Record<EmailLocale, EmailForm>>>({});
  const [saved, setSaved] = useState<Partial<Record<EmailLocale, EmailForm>>>({});
  const [error, setError] = useState<{ field?: FieldName; text: string } | null>(null);
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [showDefault, setShowDefault] = useState(false);

  const dq = useQuery({
    queryKey: ['email-template', key, locale],
    queryFn: async () =>
      (await api.GET('/admin/email-templates/{key}/{locale}', { params: { path: { key, locale } } })).data!.data,
  });
  const d = dq.data;

  useEffect(() => {
    if (!d || d.locale !== locale) return;
    setForms((f) => (f[locale] ? f : { ...f, [locale]: fromDetail(d) }));
    setSaved((s) => (s[locale] ? s : { ...s, [locale]: fromDetail(d) }));
  }, [d, locale]);

  const form = forms[locale] ?? EMPTY_FORM;
  const baseline = saved[locale] ?? EMPTY_FORM;
  const dirty = !!forms[locale] && !same(form, baseline);
  const filled = form.subject.trim() !== '' && form.textBody.trim() !== '';
  const set = (patch: Partial<EmailForm>) => {
    setForms((f) => ({ ...f, [locale]: { ...(f[locale] ?? EMPTY_FORM), ...patch } }));
    if (error && (!error.field || error.field in patch)) setError(null);
  };

  // Live preview (debounced) of the current text; the built-in when the fields are empty.
  const content = { subject: form.subject, textBody: form.textBody, htmlBody: form.htmlBody.trim() ? form.htmlBody : null };
  const contentKey = JSON.stringify(content);
  const debouncedKey = useDebounced(contentKey, 500);
  const debounced = JSON.parse(debouncedKey) as typeof content;
  const debouncedFilled = debounced.subject.trim() !== '' && debounced.textBody.trim() !== '';
  const pq = useQuery({
    queryKey: ['email-template-preview', key, locale, debounced],
    queryFn: async () =>
      (
        await api.POST('/admin/email-templates/{key}/{locale}/preview', {
          params: { path: { key, locale } },
          body: debounced,
        })
      ).data!.data,
    enabled: debouncedFilled,
    placeholderData: keepPreviousData,
    retry: false,
  });

  // Variable insertion at the cursor of the last focused field.
  // (The design-system inputs don't forward refs, so elements are captured on focus.)
  const els = useRef<Partial<Record<FieldName, HTMLInputElement | HTMLTextAreaElement>>>({});
  const focused = useRef<FieldName>('textBody');
  const track = (f: FieldName) => (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    focused.current = f;
    els.current[f] = e.currentTarget;
  };
  function insert(name: string) {
    const field = focused.current;
    const el = els.current[field];
    const token = `{{${name}}}`;
    const value = form[field];
    const start = el?.selectionStart ?? value.length;
    const end = el?.selectionEnd ?? value.length;
    set({ [field]: value.slice(0, start) + token + value.slice(end) });
    const pos = start + token.length;
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(pos, pos);
    });
  }

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['email-template', key, locale] });
    void qc.invalidateQueries({ queryKey: ['email-templates'] });
  };

  const save = useMutation({
    mutationFn: async (v: EmailForm) => {
      const r = await api.PUT('/admin/email-templates/{key}/{locale}', {
        params: { path: { key, locale } },
        body: { subject: v.subject, textBody: v.textBody, htmlBody: v.htmlBody.trim() ? v.htmlBody : null, enabled: v.enabled },
      });
      return { v, data: r.data!.data };
    },
    onSuccess: ({ v }) => {
      setSaved((s) => ({ ...s, [locale]: v }));
      setError(null);
      toast.success(`Сохранено · ${LOCALE_LABEL[locale]}${v.enabled ? '' : ' (выключено — уходит стандартное)'}`);
      invalidate();
    },
    onError: (e) => {
      setError(fieldErrors(e) ?? { text: errorText(e) });
      toast.error(e);
    },
  });

  const reset = useMutation({
    mutationFn: async () => {
      await api.DELETE('/admin/email-templates/{key}/{locale}', { params: { path: { key, locale } } });
    },
    onSuccess: () => {
      setForms((f) => ({ ...f, [locale]: EMPTY_FORM }));
      setSaved((s) => ({ ...s, [locale]: EMPTY_FORM }));
      setError(null);
      setConfirm(null);
      toast.success(`Вернули стандартное письмо · ${LOCALE_LABEL[locale]}`);
      invalidate();
    },
    onError: (e) => toast.error(e),
  });

  const test = useMutation({
    mutationFn: async () => {
      const r = await api.POST('/admin/email-templates/{key}/{locale}/test', {
        params: { path: { key, locale } },
        body: filled ? content : {},
      });
      return r.data!.data;
    },
    onSuccess: (r) => toast.success(`Тестовое письмо отправлено на ${r.sentTo}`),
    onError: (e) => {
      const fe = fieldErrors(e);
      if (fe) setError(fe);
      toast.error(e);
    },
  });

  function takeDefault() {
    if (!d) return;
    set({
      subject: unsample(d.defaultRendered.subject, d.variables),
      textBody: unsample(d.defaultRendered.text, d.variables),
      htmlBody: '',
    });
    setConfirm(null);
    toast.info('Стандартный текст подставлен — проверьте переменные и сохраните');
  }

  if (me && me.role !== 'super_admin') {
    return (
      <>
        <BackLink />
        <ErrorNote text="Шаблоны писем доступны только супер-админу." />
      </>
    );
  }

  const preview = filled
    ? pq.data
      ? { ...pq.data, label: undefined }
      : null
    : d
      ? { ...d.defaultRendered, unknownVariables: [], label: 'Сейчас уходит стандартное письмо' }
      : null;
  const hasOverride = !!d?.override;
  const errFor = (f: FieldName) => (error?.field === f ? error.text : null);

  return (
    <>
      <BackLink />
      <PageHeader
        eyebrow="Шаблон письма"
        title={d?.title ?? 'Письмо'}
        subtitle={d?.description}
        actions={
          <>
            {hasOverride ? (
              <Button variant="ghost" size="sm" onClick={() => setConfirm('reset')} disabled={reset.isPending}>
                <ArrowCounterClockwise size={15} weight="light" /> Сбросить к стандартному
              </Button>
            ) : null}
            <Button variant="outline" size="sm" loading={test.isPending} onClick={() => test.mutate()} disabled={!d}>
              {test.isPending ? null : <PaperPlaneTilt size={15} weight="light" />}
              Отправить тест себе
            </Button>
            <Button variant="gold" size="sm" loading={save.isPending} disabled={!filled || !dirty} onClick={() => save.mutate(form)}>
              {save.isPending ? null : <FloppyDisk size={15} weight="light" />}
              Сохранить
            </Button>
          </>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Tabs<EmailLocale>
          value={locale}
          onChange={(l) => {
            setLocale(l);
            setError(null);
          }}
          items={LOCALES.map((l) => {
            const ld = forms[l] && saved[l] && !same(forms[l], saved[l]);
            return {
              value: l,
              label: (
                <>
                  {l === 'en' ? 'English' : 'Русский'}
                  {ld ? <span className="h-1.5 w-1.5 rounded-full bg-gold" aria-label="не сохранено" /> : null}
                </>
              ),
            };
          })}
        />
        {d ? (
          hasOverride ? (
            <Badge tone={d.override!.enabled ? 'gold' : 'warning'} dot>
              {d.override!.enabled ? 'свой текст' : 'свой текст выключен'} · {formatDateTime(d.override!.updatedAt)}
            </Badge>
          ) : (
            <Badge tone="neutral">стандартный</Badge>
          )
        ) : null}
        {dirty ? <span className="text-xs text-gold-600">Есть несохранённые изменения</span> : null}
      </div>

      {locale === 'ru' ? (
        <Note>
          Русского стандартного письма нет — пользователи с русским языком сейчас получают английское.
          {NO_LOCALE_YET.includes(key) ? ' Для писем с кодом язык пока не передаётся, поэтому русский текст начнёт работать позже.' : ''}
        </Note>
      ) : null}
      <ErrorNote text={dq.error ? errorText(dq.error) : null} />

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)]">
        {/* Editor */}
        <div className="space-y-4">
          {dq.isPending ? (
            <Skeleton className="h-[560px] rounded-[var(--radius-lg)]" />
          ) : (
            <Card className="space-y-5 p-5">
              <div>
                <div className="mb-2 flex items-center justify-between gap-2">
                  <Label>Переменные</Label>
                  <span className="text-[11px] text-faint">клик — вставить в поле с курсором</span>
                </div>
                <VariableChips vars={d?.variables ?? []} onInsert={insert} />
              </div>

              <FieldBox label="Тема" htmlFor="et-subject" count={form.subject.length} max={SUBJECT_MAX} error={errFor('subject')}>
                <Input
                  id="et-subject"
                  value={form.subject}
                  maxLength={SUBJECT_MAX}
                  onFocus={track('subject')}
                  onChange={(e) => set({ subject: e.target.value })}
                  placeholder={d?.defaultRendered.subject}
                  aria-invalid={!!errFor('subject')}
                  className={cn(errFor('subject') && 'border-danger')}
                />
              </FieldBox>

              <FieldBox label="Текст письма" htmlFor="et-text" count={form.textBody.length} max={TEXT_MAX} error={errFor('textBody')}>
                <Textarea
                  id="et-text"
                  value={form.textBody}
                  maxLength={TEXT_MAX}
                  onFocus={track('textBody')}
                  onChange={(e) => set({ textBody: e.target.value })}
                  placeholder="Текст письма. Переменные — {{name}}."
                  aria-invalid={!!errFor('textBody')}
                  className={cn('min-h-52 resize-y font-mono text-[13px]', errFor('textBody') && 'border-danger')}
                />
              </FieldBox>

              <FieldBox
                label="HTML (необязательно)"
                htmlFor="et-html"
                count={form.htmlBody.length}
                max={HTML_MAX}
                error={errFor('htmlBody')}
                hint="Пусто — текст письма в фирменном оформлении LawBid. Начинается с «<» — ваш HTML как есть."
              >
                <Textarea
                  id="et-html"
                  value={form.htmlBody}
                  maxLength={HTML_MAX}
                  onFocus={track('htmlBody')}
                  onChange={(e) => set({ htmlBody: e.target.value })}
                  placeholder="<p>Ваш код: {{code}}</p>"
                  aria-invalid={!!errFor('htmlBody')}
                  className={cn('min-h-36 resize-y font-mono text-[12px]', errFor('htmlBody') && 'border-danger')}
                />
              </FieldBox>

              {error && !error.field ? <ErrorNote text={error.text} /> : null}

              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-surface-2 px-4 py-3">
                <div>
                  <div className="text-sm font-medium text-ink">Использовать свой текст</div>
                  <div className="text-xs text-muted">Выключено — текст сохраняется, но уходит стандартное письмо.</div>
                </div>
                <Switch checked={form.enabled} onChange={(v) => set({ enabled: v })} label="Использовать свой текст" />
              </div>
            </Card>
          )}

          {/* Built-in text for reference */}
          {d ? (
            <Card className="overflow-hidden">
              <button
                type="button"
                onClick={() => setShowDefault((v) => !v)}
                className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left"
                aria-expanded={showDefault}
              >
                <span>
                  <span className="block text-sm font-medium text-ink">Стандартное письмо</span>
                  <span className="block text-xs text-muted">Встроенный текст (с примерами значений) — для сравнения</span>
                </span>
                <CaretDown size={16} className={cn('text-faint transition-transform duration-300', showDefault && 'rotate-180')} />
              </button>
              <AnimatePresence initial={false}>
                {showDefault ? (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
                    className="overflow-hidden"
                  >
                    <div className="space-y-3 border-t border-line px-5 py-4">
                      <div className="text-sm">
                        <span className="text-faint">Тема: </span>
                        <span className="text-ink">{d.defaultRendered.subject}</span>
                      </div>
                      <pre className="max-h-72 overflow-auto rounded-xl bg-surface-2 p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap break-words text-ink">
                        {d.defaultRendered.text}
                      </pre>
                      <Button
                        variant="soft"
                        size="sm"
                        onClick={() => (form.subject || form.textBody || form.htmlBody ? setConfirm('base') : takeDefault())}
                      >
                        <CopySimple size={15} weight="light" /> Взять стандартный за основу
                      </Button>
                    </div>
                  </motion.div>
                ) : null}
              </AnimatePresence>
            </Card>
          ) : null}
        </div>

        {/* Preview */}
        <div className="xl:sticky xl:top-4">
          <EmailPreview
            email={preview}
            label={preview?.label}
            loading={filled && (pq.isFetching || debouncedKey !== contentKey)}
            error={filled && pq.error ? errorText(pq.error) : null}
          />
        </div>
      </div>

      <Dialog
        open={confirm === 'reset'}
        onClose={() => setConfirm(null)}
        eyebrow={`Язык ${LOCALE_LABEL[locale]}`}
        title="Сбросить к стандартному?"
        description="Свой текст будет удалён, пользователи снова получат встроенное письмо. Отменить нельзя."
      >
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setConfirm(null)}>
            Отмена
          </Button>
          <Button variant="danger" loading={reset.isPending} onClick={() => reset.mutate()}>
            Сбросить
          </Button>
        </div>
      </Dialog>
      <Dialog
        open={confirm === 'base'}
        onClose={() => setConfirm(null)}
        title="Заменить текст стандартным?"
        description="Тема и текст в редакторе будут заменены стандартными, HTML очищен. Сохранённая версия не изменится, пока вы не нажмёте «Сохранить»."
      >
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setConfirm(null)}>
            Отмена
          </Button>
          <Button variant="gold" onClick={takeDefault}>
            Заменить
          </Button>
        </div>
      </Dialog>
    </>
  );
}

function FieldBox({
  label,
  htmlFor,
  count,
  max,
  error,
  hint,
  children,
}: {
  label: string;
  htmlFor: string;
  count: number;
  max: number;
  error: string | null;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <Label htmlFor={htmlFor}>{label}</Label>
        <span className={cn('text-[11px] tabular-nums', count > max * 0.9 ? 'text-warning' : 'text-faint')}>
          {count.toLocaleString('ru-RU')} / {max.toLocaleString('ru-RU')}
        </span>
      </div>
      {children}
      <AnimatePresence initial={false}>
        {error ? (
          <motion.p
            role="alert"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="text-xs text-danger"
          >
            {error}
          </motion.p>
        ) : null}
      </AnimatePresence>
      {hint && !error ? <p className="text-xs text-muted">{hint}</p> : null}
    </div>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-4 flex items-start gap-2 rounded-xl bg-info-soft px-3.5 py-2.5 text-sm text-info">
      <Info size={17} weight="light" className="mt-px shrink-0" />
      <span>{children}</span>
    </div>
  );
}

function BackLink() {
  return (
    <Link href="/email-templates" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted transition-colors hover:text-ink">
      <ArrowLeft size={15} weight="light" /> Все письма
    </Link>
  );
}
