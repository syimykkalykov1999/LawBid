'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { ErrorNote, PageHeader, SectionTitle } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Badge, Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/empty';
import { Field, Select, Textarea } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/components/ui/toast';
import { api, errorText } from '@/lib/api/client';
import { useMe } from '@/lib/hooks';
import { can } from '@/lib/rbac';

type ConfigEntry = { key: string; type: string; value: unknown; defaultValue: unknown; stored: boolean; description?: string | null };
type TextRow = { key: string; values: Record<string, string>; edited: string[] };
type Texts = { languages: { code: string; name: string }[]; keys: TextRow[] };

/** The two tumblers of the page (app settings, both off by default). */
const SWITCHES: { key: string; title: string; what: string; warn?: string }[] = [
  {
    key: 'deal_record.enabled',
    title: 'Запись о сделке',
    what: 'Клиент нажимает «Принять» и вместо мгновенного принятия открывается «Запись о заключении сделки»: таблица, вся история предложений слово в слово, три фразы, подпись пальцем. Адвокат подписывает следом. Ставка принята только после двух подписей; до этого любая сторона жмёт «Отказаться» без последствий. PDF с двумя подписями лежит в деле (Docs) и на обзоре.',
    warn: 'Старое приложение без этого экрана при включённом тумблере увидит «обновите приложение» при попытке принять ставку.',
  },
  {
    key: 'bids.rich_terms_enabled',
    title: 'Подробные условия оплаты в ставках',
    what: 'Адвокат может указать вид оплаты подробнее: фикс, почасово, процент, аванс + платежи по графику, смесь или «уточним позже», с заметкой. Выключено — форма ставки как сегодня.',
  },
];

/** Which texts live here (i18n keys) and how the owner sees them. */
const TEXTS: { key: string; title: string; where: string; english: boolean }[] = [
  { key: 'deal_record.pdf.title', title: 'Заголовок документа', where: 'PDF, первая страница (всегда по-английски)', english: true },
  { key: 'deal_record.pdf.not_contract', title: 'Строка «это не договор»', where: 'PDF, под заголовком (всегда по-английски)', english: true },
  { key: 'deal_record.pdf.footer', title: 'Строка-отказ внизу каждой страницы', where: 'PDF, футер (всегда по-английски)', english: true },
  { key: 'deal_record.consent.not_contract', title: 'Фраза 1 перед подписью', where: 'экран подписи, на языке пользователя', english: false },
  { key: 'deal_record.consent.platform', title: 'Фраза 2 перед подписью', where: 'экран подписи, на языке пользователя', english: false },
  { key: 'deal_record.consent.accurate', title: 'Фраза 3 перед подписью', where: 'экран подписи, на языке пользователя', english: false },
];

/**
 * Deal record 2026-10-27 (docs/architecture/DEAL_RECORD_PLAN_2026-10-27.md
 * §8): «Запись о сделке». Two switches (app settings), the editable texts
 * (ordinary i18n keys: every language, «сбросить» = the built-in text; a
 * sealed record keeps the texts it was signed with), a PDF preview.
 */
export default function DealRecordPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const me = useMe();
  const canManage = me.data ? can(me.data, 'settings', 'manage') : false;

  const config = useQuery({
    queryKey: ['config'],
    queryFn: async () => (await api.GET('/admin/config')).data!.data as unknown as ConfigEntry[],
  });
  const texts = useQuery({
    queryKey: ['deal-record-texts'],
    queryFn: async () =>
      (await api.GET('/admin/i18n/texts', { params: { query: { prefix: 'deal_record.' } } })).data!.data as unknown as Texts,
  });

  const saveSwitch = useMutation({
    mutationFn: async (v: { key: string; value: boolean; say: string }) => {
      const res = await api.PUT('/admin/config/{key}', {
        params: { path: { key: v.key } },
        body: { value: v.value } as never,
      });
      if (res.error) throw res.error;
      return v;
    },
    onSuccess: (v) => {
      toast.success(v.say);
      void qc.invalidateQueries({ queryKey: ['config'] });
    },
    onError: (e) => toast.error(e),
  });

  const saveText = useMutation({
    mutationFn: async (v: { key: string; lang: string; value: string }) => {
      const res = await api.PUT('/admin/i18n/texts', { body: v });
      if (res.error) throw res.error;
      return v;
    },
    onSuccess: () => {
      toast.success('Текст сохранён. Уже запечатанные записи не меняются.');
      void qc.invalidateQueries({ queryKey: ['deal-record-texts'] });
    },
    onError: (e) => toast.error(e),
  });

  const resetText = useMutation({
    mutationFn: async (v: { key: string; lang: string }) => {
      const res = await api.POST('/admin/i18n/texts/reset', { body: v });
      if (res.error) throw res.error;
      return v;
    },
    onSuccess: () => {
      toast.success('Встроенный текст возвращён.');
      void qc.invalidateQueries({ queryKey: ['deal-record-texts'] });
    },
    onError: (e) => toast.error(e),
  });

  const entries = new Map((config.data ?? []).map((e) => [e.key, e]));

  return (
    <>
      <PageHeader
        eyebrow="Система"
        title="Запись о сделке"
        subtitle="«Запись о заключении сделки» — не договор. Это PDF о том, как клиент и адвокат договорились в приложении: кто, что, когда предложил и принял, с подписями обеих сторон. Платформа не сторона и в оплате не участвует. Всё выключено, пока вы не нажмёте."
      />
      <ErrorNote text={config.error ? errorText(config.error) : texts.error ? errorText(texts.error) : null} />

      <SectionTitle
        action={
          <Button size="sm" variant="outline" onClick={() => window.open('/api/proxy/deal-record/preview', '_blank', 'noopener')} data-testid="preview-pdf">
            Предпросмотр PDF
          </Button>
        }
      >
        Тумблеры
      </SectionTitle>
      {config.isPending ? (
        <div className="grid gap-4 md:grid-cols-2">
          {SWITCHES.map((s) => (
            <Skeleton key={s.key} className="h-36 rounded-[var(--radius-lg)]" />
          ))}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {SWITCHES.map((s) => {
            const e = entries.get(s.key);
            const on = e?.value === true;
            return (
              <Card key={s.key} className="h-full p-5" data-testid={`switch-${s.key}`}>
                <div className="flex items-start gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-medium text-heading">{s.title}</h3>
                      <Badge tone={on ? 'success' : 'neutral'}>{on ? 'Вкл' : 'Выкл'}</Badge>
                      {e && !e.stored ? <Badge tone="neutral">не трогали</Badge> : null}
                    </div>
                    <p className="mt-1.5 break-words text-sm leading-relaxed text-muted">{s.what}</p>
                    {s.warn ? <p className="mt-2 rounded-xl bg-warning-soft px-3 py-2 text-xs leading-relaxed text-warning">{s.warn}</p> : null}
                  </div>
                  <Switch
                    checked={on}
                    disabled={!canManage || !e || saveSwitch.isPending}
                    label={s.title}
                    onChange={(v) => saveSwitch.mutate({ key: s.key, value: v, say: `${s.title}: ${v ? 'включено' : 'выключено'}` })}
                  />
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <SectionTitle>Тексты</SectionTitle>
      <Card className="mb-4 p-5">
        <p className="text-sm leading-relaxed text-muted">
          Три фразы перед подписью показываются каждому на его языке; документ всегда на английском. Правка меняет только новые записи: уже подписанные хранят текст, с которым их подписали (номер версии виден в записи). «Сбросить» возвращает встроенный текст.
        </p>
      </Card>
      {texts.isPending ? (
        <Skeleton className="h-64 rounded-[var(--radius-lg)]" />
      ) : (
        <div className="grid gap-4">
          {TEXTS.map((t) => (
            <TextCard
              key={t.key}
              meta={t}
              row={texts.data?.keys.find((k) => k.key === t.key)}
              languages={texts.data?.languages ?? []}
              disabled={!canManage}
              onSave={(lang, value) => saveText.mutate({ key: t.key, lang, value })}
              onReset={(lang) => resetText.mutate({ key: t.key, lang })}
            />
          ))}
        </div>
      )}
    </>
  );
}

function TextCard({
  meta,
  row,
  languages,
  disabled,
  onSave,
  onReset,
}: {
  meta: { key: string; title: string; where: string; english: boolean };
  row: TextRow | undefined;
  languages: { code: string; name: string }[];
  disabled: boolean;
  onSave: (lang: string, value: string) => void;
  onReset: (lang: string) => void;
}) {
  const [lang, setLang] = useState('en');
  const saved = row?.values[lang] ?? '';
  const [draft, setDraft] = useState(saved);
  useEffect(() => setDraft(saved), [saved, lang]);
  const edited = row?.edited.includes(lang) ?? false;
  const langs = meta.english ? languages.filter((l) => l.code === 'en') : languages;
  return (
    <Card className="p-5" data-testid={`text-${meta.key}`}>
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-medium text-heading">{meta.title}</h3>
        {edited ? <Badge tone="warning">изменено в админке</Badge> : <Badge tone="neutral">встроенный</Badge>}
        {!row ? <Badge tone="neutral">текста в базе ещё нет — нужен импорт переводов</Badge> : null}
      </div>
      <p className="mt-1 text-xs text-faint">
        {meta.where} · ключ <code>{meta.key}</code>
      </p>
      <div className="mt-3 grid gap-3 md:grid-cols-[180px_1fr]">
        <Field label="Язык">
          <Select value={lang} onChange={(e) => setLang(e.target.value)} disabled={meta.english || langs.length === 0}>
            {langs.map((l) => (
              <option key={l.code} value={l.code}>
                {l.name} ({l.code})
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Текст" hint={`${draft.length} знаков`}>
          <Textarea rows={3} value={draft} disabled={disabled || !row} onChange={(e) => setDraft(e.target.value)} />
        </Field>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" disabled={disabled || !row || draft.trim() === '' || draft === saved} onClick={() => onSave(lang, draft.trim())}>
          Сохранить
        </Button>
        <Button size="sm" variant="outline" disabled={disabled || !edited} onClick={() => onReset(lang)}>
          Сбросить к встроенному
        </Button>
      </div>
    </Card>
  );
}
