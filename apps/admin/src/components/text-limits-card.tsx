'use client';

import { TextT } from '@phosphor-icons/react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';
import { api } from '@/lib/api/client';

/** Owner 2026-10-15: how many characters each free-text field takes. */
const LIMITS: { key: string; label: string }[] = [
  { key: 'limits.chat_message_chars', label: 'Сообщение в чате' },
  { key: 'limits.comment_chars', label: 'Комментарий (к посту, рилсу или кейсу)' },
  { key: 'post.max_chars_brief', label: 'Бриф (пост только с текстом)' },
  { key: 'post.max_chars_media', label: 'Подпись к посту с фото, видео или файлами' },
  { key: 'limits.post_title_chars', label: 'Заголовок поста или рилса' },
  { key: 'limits.case_title_chars', label: 'Заголовок кейса' },
  { key: 'limits.case_description_chars', label: 'Описание кейса' },
  { key: 'limits.bid_message_chars', label: 'Текст отклика адвоката' },
  { key: 'limits.counter_message_chars', label: 'Текст встречного предложения' },
  { key: 'limits.review_chars', label: 'Текст отзыва' },
  { key: 'limits.dispute_chars', label: 'Текст спора или отметки о завершении' },
  { key: 'limits.workspace_note_chars', label: 'Заметка к файлам в рабочем пространстве кейса' },
  { key: 'limits.workspace_update_chars', label: 'Обновление по кейсу в рабочем пространстве' },
  { key: 'limits.support_message_chars', label: 'Сообщение в поддержку' },
  { key: 'limits.bio_chars', label: 'О себе (адвокат)' },
];

export const isTextLimitKey = (key: string) => LIMITS.some((l) => l.key === key);

type Entry = {
  key: string;
  value: unknown;
  defaultValue: unknown;
  min: number | null;
  max: number | null;
  stored: boolean;
};

/**
 * One block for every character limit: the server enforces the numbers and
 * the app shows the same ones as a counter in the field. A change applies
 * within about half a minute, without a release.
 */
export function TextLimitsCard({ entries }: { entries: Entry[] }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const save = useMutation({
    mutationFn: (v: { key: string; value: number }) =>
      api.PUT('/admin/config/{key}', {
        params: { path: { key: v.key } },
        body: { value: v.value } as never,
      }),
    onSuccess: (_r, v) => {
      toast.success(`Сохранено: ${v.key}`);
      setDrafts((d) => {
        const next = { ...d };
        delete next[v.key];
        return next;
      });
      void qc.invalidateQueries({ queryKey: ['config'] });
    },
    onError: (e) => toast.error(e),
  });
  const byKey = new Map(entries.map((e) => [e.key, e]));
  return (
    <section className="mb-6 rounded-2xl border border-line bg-card p-5">
      <div className="mb-1 flex items-center gap-2 text-sm font-medium text-ink">
        <TextT size={18} weight="light" /> Лимиты ввода
      </div>
      <p className="mb-4 text-xs text-muted">
        Сколько знаков можно ввести в каждое поле. Сервер не примет больше, а приложение показывает тот же
        предел счётчиком в поле. Изменения действуют примерно через 30 секунд, без обновления приложения.
      </p>
      <div className="divide-y divide-line">
        {LIMITS.map(({ key, label }) => {
          const e = byKey.get(key);
          if (!e) return null;
          const draft = drafts[key];
          const current = e.value === null || e.value === undefined ? String(e.defaultValue ?? '') : String(e.value);
          const n = draft === undefined ? null : Number(draft);
          const bad =
            n !== null &&
            (!Number.isInteger(n) || (e.min !== null && n < e.min) || (e.max !== null && n > e.max));
          return (
            <form
              key={key}
              className="flex flex-wrap items-center gap-3 py-2"
              onSubmit={(ev) => {
                ev.preventDefault();
                if (n !== null && !bad) save.mutate({ key, value: n });
              }}
            >
              <div className="min-w-64 flex-1">
                <div className="text-sm text-ink">{label}</div>
                <div className="font-mono text-[11px] text-faint">{key}</div>
              </div>
              <Input
                className="h-8 w-28 text-right font-mono text-xs"
                inputMode="numeric"
                aria-label={label}
                value={draft ?? current}
                onChange={(ev) => setDrafts({ ...drafts, [key]: ev.target.value })}
              />
              <div className="w-40 text-xs text-muted">
                по умолчанию {String(e.defaultValue ?? '—')}
                {e.min !== null && e.max !== null ? <div>можно {e.min}–{e.max}</div> : null}
              </div>
              <div className="w-24">
                {draft !== undefined ? (
                  <Button size="sm" type="submit" disabled={save.isPending || bad} title={bad ? 'Число вне допустимого диапазона' : undefined}>
                    Сохранить
                  </Button>
                ) : null}
              </div>
            </form>
          );
        })}
      </div>
    </section>
  );
}
