'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { ErrorNote, PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Badge, Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input, Textarea } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';
import { ApiError, errorText } from '@/lib/api/client';

type Texts = {
  languages: Array<{ code: string; name: string }>;
  keys: Array<{ key: string; values: Record<string, string>; edited: string[] }>;
};

/** The app's «Справочник» (the «i» in the case lists): intro + 8 sections. */
const SECTIONS = 8;
const PREFIX = 'guide.';

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

/** Owner 2026-10-18: the «Справочник» texts in every language. A saved
 * text reaches the apps on their next translation sync, and the deploy's
 * translations file no longer overwrites it. */
export default function GuidePage() {
  const [lang, setLang] = useState('ru');
  const texts = useQuery({
    queryKey: ['i18n-texts', PREFIX],
    queryFn: () => call<Texts>(`i18n/texts?prefix=${encodeURIComponent(PREFIX)}`),
  });
  const data = texts.data;
  const value = (key: string) => data?.keys.find((k) => k.key === key)?.values[lang] ?? '';
  const edited = (key: string) => data?.keys.find((k) => k.key === key)?.edited.includes(lang) ?? false;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Справочник"
        subtitle="Тексты экрана «Справочник» в приложении (кнопка «i» в списке дел) на каждом языке. Сохранённый текст приходит в приложения при следующей синхронизации переводов."
      />
      {texts.error ? <ErrorNote text={errorText(texts.error)} /> : null}
      <div className="flex items-center gap-3">
        <span className="text-sm text-muted-foreground">Язык</span>
        <select
          className="h-9 rounded-md border bg-background px-3 text-sm"
          value={lang}
          onChange={(e) => setLang(e.target.value)}
        >
          {(data?.languages ?? []).map((l) => (
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
            fields={[{ key: `${PREFIX}title`, label: 'Заголовок', multiline: false }]}
            value={value}
            edited={edited}
          />
          <TextCard
            key={`${lang}-intro`}
            heading="Вступление"
            lang={lang}
            fields={[{ key: `${PREFIX}intro`, label: 'Текст', multiline: true }]}
            value={value}
            edited={edited}
          />
          {Array.from({ length: SECTIONS }, (_, i) => i + 1).map((n) => (
            <TextCard
              key={`${lang}-${n}`}
              heading={`Раздел ${n}`}
              lang={lang}
              fields={[
                { key: `${PREFIX}s${n}.title`, label: 'Заголовок', multiline: false },
                { key: `${PREFIX}s${n}.body`, label: 'Текст (пустая строка между абзацами)', multiline: true },
              ]}
              value={value}
              edited={edited}
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
  fields,
  value,
  edited,
}: {
  heading: string;
  lang: string;
  fields: Array<{ key: string; label: string; multiline: boolean }>;
  value: (key: string) => string;
  edited: (key: string) => boolean;
}) {
  const qc = useQueryClient();
  const toast = useToast();
  const initial = () => Object.fromEntries(fields.map((f) => [f.key, value(f.key)]));
  const [draft, setDraft] = useState<Record<string, string>>(initial);
  const server = fields.map((f) => value(f.key)).join('\u0000');
  // A refetch (after a save) resets the form to what the server has.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => setDraft(initial()), [lang, server]);
  const changed = fields.filter((f) => (draft[f.key] ?? '').trim() !== value(f.key).trim());
  const save = useMutation({
    mutationFn: async () => {
      for (const f of changed) {
        await call<void>('i18n/texts', {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ key: f.key, lang, value: draft[f.key] }),
        });
      }
    },
    onSuccess: async () => {
      toast.success(`${heading}: сохранено`);
      await qc.invalidateQueries({ queryKey: ['i18n-texts', PREFIX] });
    },
    onError: (e) => toast.error(errorText(e)),
  });
  const empty = changed.some((f) => !(draft[f.key] ?? '').trim());
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle className="flex items-center gap-2">
          {heading}
          {fields.some((f) => edited(f.key)) ? <Badge>изменено в админке</Badge> : null}
        </CardTitle>
        <Button size="sm" disabled={changed.length === 0 || empty || save.isPending} onClick={() => save.mutate()}>
          Сохранить
        </Button>
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
    </Card>
  );
}
