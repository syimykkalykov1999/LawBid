'use client';

import { ChatCircleText, NotePencil, PaperPlaneRight } from '@phosphor-icons/react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Select, Textarea } from '@/components/ui/input';
import { Tabs } from '@/components/ui/tabs';
import { TICKET_STATUS } from '@/lib/labels';
import { cn } from '@/lib/utils';
import { STATUSES, type TicketStatus } from './support-labels';

export type ComposerMode = 'reply' | 'note';

export interface ComposerSubmit {
  body: string;
  internal: boolean;
  status?: TicketStatus;
}

/**
 * Reply box: "Ответ пользователю / Заметка для команды", status after a
 * public reply (default "ждём пользователя"), Ctrl/⌘+Enter sends.
 * `onSubmit` resolves true when sent, so the text is cleared only then.
 */
export function Composer({
  onSubmit,
  busy,
}: {
  onSubmit: (v: ComposerSubmit) => Promise<boolean>;
  busy: boolean;
}) {
  const [mode, setMode] = useState<ComposerMode>('reply');
  const [body, setBody] = useState('');
  const [status, setStatus] = useState<TicketStatus>('waiting_user');
  const note = mode === 'note';
  const ready = body.trim().length > 0 && body.length <= 5000 && !busy;

  async function send() {
    if (!ready) return;
    const ok = await onSubmit({ body: body.trim(), internal: note, status: note ? undefined : status });
    if (ok) {
      setBody('');
      setStatus('waiting_user');
    }
  }

  return (
    <div
      className={cn(
        'border-t p-3 transition-colors sm:p-4',
        note ? 'border-dashed border-warning/60 bg-warning-soft/40' : 'border-line bg-surface',
      )}
    >
      <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
        <Tabs<ComposerMode>
          size="sm"
          value={mode}
          onChange={setMode}
          items={[
            {
              value: 'reply',
              label: (
                <>
                  <ChatCircleText size={14} weight="light" /> Ответ пользователю
                </>
              ),
            },
            {
              value: 'note',
              label: (
                <>
                  <NotePencil size={14} weight="light" /> Заметка для команды
                </>
              ),
            },
          ]}
        />
        <span className="text-[11px] text-faint">
          {note ? 'Пользователь не увидит заметку' : 'Пользователь получит уведомление'}
        </span>
      </div>
      <Textarea
        value={body}
        maxLength={5000}
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            void send();
          }
        }}
        placeholder={note ? 'Заметка видна только команде…' : 'Напишите ответ…'}
        className={cn('min-h-28 resize-y', note && 'border-dashed')}
      />
      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        {!note ? (
          <label className="flex items-center gap-2 text-xs text-muted">
            После ответа
            <Select
              value={status}
              onChange={(e) => setStatus(e.target.value as TicketStatus)}
              className="h-8 w-48 text-xs"
              aria-label="Статус после ответа"
            >
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {TICKET_STATUS[s]}
                </option>
              ))}
            </Select>
          </label>
        ) : null}
        <span className="ml-auto hidden text-[11px] text-faint sm:inline">Ctrl/⌘ + Enter — отправить</span>
        <Button variant={note ? 'soft' : 'gold'} size="sm" loading={busy} disabled={!ready} onClick={() => void send()}>
          {!busy ? note ? <NotePencil size={15} weight="light" /> : <PaperPlaneRight size={15} weight="light" /> : null}
          {note ? 'Сохранить заметку' : 'Отправить'}
        </Button>
      </div>
    </div>
  );
}
