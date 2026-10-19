'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useConfirm } from '@/components/legacy/confirm';
import { ErrorNote, PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Badge, Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { Input, Textarea } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/components/ui/toast';
import { ApiError, api, errorText } from '@/lib/api/client';

type Texts = {
  languages: Array<{ code: string; name: string }>;
  keys: Array<{ key: string; values: Record<string, string>; edited: string[] }>;
};
type Field = { key: string; label: string; multiline: boolean };

/** The app's «Справочник» (the «i» in the case lists): intro + 8 sections. */
const SECTIONS = 8;
const PREFIX = 'guide.';
const TEXTS_KEY = ['i18n-texts', PREFIX];

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api/proxy/${path}`, init);
  if (res.status === 204) return undefined as T;
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const e = json?.error ?? {};
    throw new ApiError(res.status, e.code ?? 'INTERNAL_ERROR', e.message ?? res.statusText, e.details);
  }
  return json.data as T;
}

const send = (method: string, path: string, body: unknown) =>
  call<void>(path, { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

/** Owner 2026-10-18: the «Справочник» texts in every language, each
 * section on or off, «Перевести на все языки» and «Сбросить к встроенному
 * тексту». A saved text reaches the apps on their next translation sync;
 * the deploy's translations file no longer overwrites it. */
export default function GuidePage() {
  const [lang, setLang] = useState('ru');
  const qc = useQueryClient();
  const toast = useToast();
  const texts = useQuery({
    queryKey: TEXTS_KEY,
    queryFn: () => call<Texts>(`i18n/texts?prefix=${encodeURIComponent(PREFIX)}`),
  });
  const flags = useQuery({
    queryKey: ['flags'],
    queryFn: async () => (await api.GET('/admin/feature-flags')).data!.data as Array<{ key: string; enabled: boolean }>,
  });
  const toggle = useMutation({
    mutationFn: async (v: { n: number; enabled: boolean }) => {
      await api.PATCH('/admin/feature-flags/{key}', {
        params: { path: { key: `guide_section_${v.n}` } },
        body: { enabled: v.enabled },
      });
      return v;
    },
    onSuccess: (v) => {
      toast.success(`Раздел ${v.n}: ${v.enabled ? 'показан' : 'скрыт'} в приложении`);
      void qc.invalidateQueries({ queryKey: ['flags'] });
    },
    onError: (e) => toast.error(errorText(e)),
  });
  const data = texts.data;
  const languages = data?.languages ?? [];
  const value = (key: string, l = lang) => data?.keys.find((k) => k.key === key)?.values[l] ?? '';
  const edited = (key: string) => data?.keys.find((k) => k.key === key)?.edited.includes(lang) ?? false;
  const sectionOn = (n: number) => flags.data?.find((f) => f.key === `guide_section_${n}`)?.enabled ?? true;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Справочник"
        subtitle="Экран «Справочник» в приложении (кнопка «i» в списке дел). Тексты на каждом языке, разделы можно скрыть. Сохранённое приходит в приложения при следующей синхронизации переводов."
      />
      {texts.error ? <ErrorNote text={errorText(texts.error)} /> : null}
      <div className="flex items-center gap-3">
        <span className="text-sm text-muted-foreground">Язык</span>
        <select
          className="h-9 rounded-md border bg-background px-3 text-sm"
          value={lang}
          onChange={(e) => setLang(e.target.value)}
        >
          {languages.map((l) => (
            <option key={l.code} value={l.code}>
              {l.name} ({l.code})
            </option>
          ))}
        </select>
      </div>
      {data ? (
        <div className="space-y-4">
          <TextCard
            key={`${lang}-title`}
            heading="Заголовок экрана"
            lang={lang}
            languages={languages}
            fields={[{ key: `${PREFIX}title`, label: 'Заголовок', multiline: false }]}
            value={value}
            edited={edited}
          />
          <TextCard
            key={`${lang}-intro`}
            heading="Вступление"
            lang={lang}
            languages={languages}
            fields={[{ key: `${PREFIX}intro`, label: 'Текст', multiline: true }]}
            value={value}
            edited={edited}
          />
          {Array.from({ length: SECTIONS }, (_, i) => i + 1).map((n) => (
            <TextCard
              key={`${lang}-${n}`}
              heading={`Раздел ${n}`}
              lang={lang}
              languages={languages}
              fields={[
                { key: `${PREFIX}s${n}.title`, label: 'Заголовок', multiline: false },
                { key: `${PREFIX}s${n}.body`, label: 'Текст (пустая строка между абзацами)', multiline: true },
              ]}
              value={value}
              edited={edited}
              shown={sectionOn(n)}
              onShown={(enabled) => toggle.mutate({ n, enabled })}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function TextCard({
  heading,
  lang,
  languages,
  fields,
  value,
  edited,
  shown,
  onShown,
}: {
  heading: string;
  lang: string;
  languages: Texts['languages'];
  fields: Field[];
  value: (key: string, lang?: string) => string;
  edited: (key: string) => boolean;
  shown?: boolean;
  onShown?: (v: boolean) => void;
}) {
  const qc = useQueryClient();
  const toast = useToast();
  const { confirm, dialog } = useConfirm();
  const initial = () => Object.fromEntries(fields.map((f) => [f.key, value(f.key)]));
  const [draft, setDraft] = useState<Record<string, string>>(initial);
  const [preview, setPreview] = useState<{ byKey: Record<string, Record<string, string>>; failed: string[] } | null>(
    null,
  );
  const server = fields.map((f) => value(f.key)).join('\u0000');
  // A refetch (after a save) resets the form to what the server has.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => setDraft(initial()), [lang, server]);
  const changed = fields.filter((f) => (draft[f.key] ?? '').trim() !== value(f.key).trim());
  const empty = fields.some((f) => !(draft[f.key] ?? '').trim());
  const refresh = () => qc.invalidateQueries({ queryKey: TEXTS_KEY });

  const save = useMutation({
    mutationFn: async () => {
      for (const f of changed) await send('PUT', 'i18n/texts', { key: f.key, lang, value: draft[f.key] });
    },
    onSuccess: async () => {
      toast.success(`${heading}: сохранено`);
      await refresh();
    },
    onError: (e) => toast.error(errorText(e)),
  });

  // «Перевести на все языки»: the text on the form (saved first) → a
  // machine-translation preview → saved for every language after a yes.
  const translate = useMutation({
    mutationFn: async () => {
      for (const f of changed) await send('PUT', 'i18n/texts', { key: f.key, lang, value: draft[f.key] });
      const byKey: Record<string, Record<string, string>> = {};
      const failed = new Set<string>();
      for (const f of fields) {
        const r = await call<{ values: Record<string, string>; failed: string[] }>('i18n/texts/translate', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ text: draft[f.key], source: lang }),
        });
        byKey[f.key] = r.values;
        r.failed.forEach((l) => failed.add(l));
      }
      return { byKey, failed: [...failed] };
    },
    onSuccess: async (r) => {
      await refresh();
      setPreview(r);
    },
    onError: (e) => toast.error(errorText(e)),
  });
  const applyAll = useMutation({
    mutationFn: async () => {
      if (!preview) return;
      for (const f of fields) await send('PUT', 'i18n/texts/many', { key: f.key, values: preview.byKey[f.key] ?? {} });
    },
    onSuccess: async () => {
      toast.success(`${heading}: переведено на все языки`);
      setPreview(null);
      await refresh();
    },
    onError: (e) => toast.error(errorText(e)),
  });

  const reset = useMutation({
    mutationFn: async (all: boolean) => {
      const ok = await confirm({
        title: all ? `Сбросить «${heading}» на всех языках?` : `Сбросить «${heading}» (${lang})?`,
        description: 'Вернётся встроенный текст из приложения, ваши правки пропадут.',
        confirm: 'Сбросить',
        danger: true,
      });
      if (!ok) return false;
      for (const f of fields) await send('POST', 'i18n/texts/reset', all ? { key: f.key } : { key: f.key, lang });
      return true;
    },
    onSuccess: async (done) => {
      if (!done) return;
      toast.success(`${heading}: встроенный текст возвращён`);
      await refresh();
    },
    onError: (e) => toast.error(errorText(e)),
  });

  const busy = save.isPending || translate.isPending || applyAll.isPending || reset.isPending;
  const name = (code: string) => languages.find((l) => l.code === code)?.name ?? code;
  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
        <CardTitle className="flex items-center gap-2">
          {heading}
          {fields.some((f) => edited(f.key)) ? <Badge>изменено в админке</Badge> : null}
          {shown === false ? <Badge>скрыт в приложении</Badge> : null}
        </CardTitle>
        <div className="flex flex-wrap items-center gap-2">
          {onShown ? (
            <Switch checked={shown ?? true} onChange={onShown} label="Показывать в приложении" />
          ) : null}
          <Button size="sm" variant="outline" disabled={busy} onClick={() => reset.mutate(false)}>
            Сбросить
          </Button>
          <Button size="sm" variant="outline" disabled={busy} onClick={() => reset.mutate(true)}>
            Сбросить на всех языках
          </Button>
          <Button size="sm" variant="outline" disabled={busy || empty} onClick={() => translate.mutate()}>
            {translate.isPending ? 'Переводим…' : 'Перевести на все языки'}
          </Button>
          <Button size="sm" disabled={changed.length === 0 || empty || busy} onClick={() => save.mutate()}>
            Сохранить
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {fields.map((f) => (
          <label key={f.key} className="block space-y-1">
            <span className="text-xs text-muted-foreground">
              {f.label} · <code>{f.key}</code>
            </span>
            {f.multiline ? (
              <Textarea
                rows={10}
                value={draft[f.key] ?? ''}
                onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value })}
              />
            ) : (
              <Input value={draft[f.key] ?? ''} onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value })} />
            )}
          </label>
        ))}
      </CardContent>
      {dialog}
      <Dialog
        open={preview !== null}
        onClose={() => setPreview(null)}
        title={`${heading}: перевод на все языки`}
        description="Проверьте машинный перевод. После «Сохранить на всех языках» тексты придут в приложения и будут отмечены как изменённые в админке."
        wide
      >
        {preview ? (
          <div className="space-y-4">
            {preview.failed.length > 0 ? (
              <ErrorNote text={`Не удалось перевести: ${preview.failed.map(name).join(', ')}. Там останется прежний текст.`} />
            ) : null}
            <div className="max-h-[60vh] space-y-3 overflow-y-auto pr-2">
              {Object.keys(preview.byKey[fields[0].key] ?? {}).map((l) => (
                <div key={l} className="rounded-md border p-3">
                  <div className="mb-1 text-xs font-medium text-muted-foreground">
                    {name(l)} ({l})
                  </div>
                  {fields.map((f) => (
                    <p key={f.key} className="whitespace-pre-wrap text-sm">
                      {preview.byKey[f.key]?.[l]}
                    </p>
                  ))}
                </div>
              ))}
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setPreview(null)}>
                Отмена
              </Button>
              <Button disabled={applyAll.isPending} onClick={() => applyAll.mutate()}>
                Сохранить на всех языках
              </Button>
            </div>
          </div>
        ) : null}
      </Dialog>
    </Card>
  );
}
