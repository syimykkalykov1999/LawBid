'use client';

import { ChatCircleText, FileText, NotePencil, PaperPlaneRight, Paperclip, SpinnerGap, WarningCircle, X } from '@phosphor-icons/react';
import { useEffect, useRef, useState } from 'react';
import { formatBytes } from '@/components/media/media-utils';
import { Button } from '@/components/ui/button';
import { Select, Textarea } from '@/components/ui/input';
import { Tabs } from '@/components/ui/tabs';
import { TICKET_STATUS } from '@/lib/labels';
import { cn } from '@/lib/utils';
import { STATUSES, type SupportMacro, type TicketStatus } from './support-labels';
import { SUPPORT_ACCEPT, uploadSupportFile } from './upload';

/** The server's `support` place decides the real number (default 5). */
const MAX_FILES = 5;

interface Picked {
  key: string;
  name: string;
  size: number;
  state: 'uploading' | 'ready' | 'error';
  step?: string;
  fileId?: string;
  error?: string;
}

type ComposerMode = 'reply' | 'note';

export interface ComposerSubmit {
  body: string;
  internal: boolean;
  status?: TicketStatus;
  /** The ready answer the text came from (counted for the team). */
  macroId?: string;
  attachments: { fileId: string; name: string }[];
}

/**
 * Reply box: "Ответ пользователю / Заметка для команды", status after a
 * public reply (default "ждём пользователя"), Ctrl/⌘+Enter sends.
 * `onSubmit` resolves true when sent, so the text is cleared only then.
 * «Готовый ответ» drops a saved answer (in the user's language) into the
 * box to edit before sending; `{name}` and `{ticket}` are filled by the
 * server. The paperclip attaches photos, videos and documents.
 */
export function Composer({
  onSubmit,
  busy,
  macros = [],
  hideReplyButton = false,
  sendRef,
  onReadyChange,
}: {
  onSubmit: (v: ComposerSubmit) => Promise<boolean>;
  busy: boolean;
  macros?: SupportMacro[];
  /** The reply is sent from outside (the review action bar); a note keeps its button. */
  hideReplyButton?: boolean;
  /** Lets a button outside the box send the reply (the review action bar). */
  sendRef?: React.MutableRefObject<(() => void) | null>;
  /** Tells the outside whether a public reply can be sent now. */
  onReadyChange?: (ready: boolean) => void;
}) {
  const [mode, setMode] = useState<ComposerMode>('reply');
  const [body, setBody] = useState('');
  const [macroId, setMacroId] = useState('');
  const [status, setStatus] = useState<TicketStatus>('waiting_user');
  const [files, setFiles] = useState<Picked[]>([]);
  const input = useRef<HTMLInputElement>(null);
  const note = mode === 'note';
  const sendable = files.filter((f) => f.state === 'ready');
  const uploading = files.some((f) => f.state === 'uploading');
  const ready =
    (body.trim().length > 0 || sendable.length > 0) && body.length <= 5000 && !busy && !uploading;

  const canReply = ready && !note;
  useEffect(() => onReadyChange?.(canReply), [canReply, onReadyChange]);

  function patchFile(key: string, p: Partial<Picked>) {
    setFiles((cur) => cur.map((f) => (f.key === key ? { ...f, ...p } : f)));
  }

  function pick(list: FileList | null) {
    const chosen = Array.from(list ?? []);
    if (input.current) input.current.value = '';
    for (const file of chosen.slice(0, Math.max(0, MAX_FILES - files.length))) {
      const key = `${file.name}-${file.size}-${Math.random().toString(36).slice(2)}`;
      setFiles((cur) => [...cur, { key, name: file.name, size: file.size, state: 'uploading' }]);
      uploadSupportFile(file, (step) => patchFile(key, { step })).then(
        (fileId) => patchFile(key, { state: 'ready', fileId, step: undefined }),
        (e: unknown) => patchFile(key, { state: 'error', error: e instanceof Error ? e.message : 'Не удалось загрузить' }),
      );
    }
  }

  async function send() {
    if (!ready) return;
    const ok = await onSubmit({
      body: body.trim(),
      internal: note,
      status: note ? undefined : status,
      macroId: note ? undefined : macroId || undefined,
      attachments: sendable.flatMap((f) => (f.fileId ? [{ fileId: f.fileId, name: f.name }] : [])),
    });
    if (ok) {
      setBody('');
      setMacroId('');
      setStatus('waiting_user');
      setFiles([]);
    }
  }

  // The latest send for the outside button (set after render, not during it).
  useEffect(() => {
    if (sendRef) sendRef.current = () => void send();
  });

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
      {!note ? (
        <p className="mt-1 text-[11px] text-faint">
          В тексте можно писать <code>{'{name}'}</code> (имя пользователя) и <code>{'{ticket}'}</code> (номер обращения) — при отправке они заменятся.
        </p>
      ) : null}
      {files.length > 0 ? (
        <ul className="mt-2.5 flex flex-wrap gap-2">
          {files.map((f) => (
            <li
              key={f.key}
              className={cn(
                'flex max-w-full items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs',
                f.state === 'error' ? 'border-danger/50 bg-danger-soft text-danger' : 'border-line bg-surface-2 text-ink',
              )}
              title={f.error}
            >
              {f.state === 'uploading' ? (
                <SpinnerGap size={14} className="animate-spin text-muted" />
              ) : f.state === 'error' ? (
                <WarningCircle size={14} weight="fill" />
              ) : (
                <FileText size={14} weight="light" className="text-gold-600" />
              )}
              <span className="max-w-48 truncate">{f.name}</span>
              <span className="text-faint">
                {f.state === 'uploading' ? (f.step ?? '…') : f.state === 'error' ? (f.error ?? 'ошибка') : formatBytes(f.size)}
              </span>
              <button
                type="button"
                aria-label={`Убрать ${f.name}`}
                onClick={() => setFiles((cur) => cur.filter((x) => x.key !== f.key))}
                className="rounded p-0.5 text-muted hover:bg-line hover:text-ink"
              >
                <X size={12} weight="bold" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        <input
          ref={input}
          type="file"
          multiple
          accept={SUPPORT_ACCEPT}
          className="hidden"
          onChange={(e) => pick(e.target.files)}
        />
        <Button
          variant="outline"
          size="sm"
          disabled={files.length >= MAX_FILES || busy}
          onClick={() => input.current?.click()}
          aria-label="Прикрепить файлы"
        >
          <Paperclip size={15} weight="light" /> Файлы
        </Button>
        {!note && macros.length > 0 ? (
          <Select
            value={macroId}
            onChange={(e) => {
              const m = macros.find((x) => x.id === e.target.value);
              setMacroId(m?.id ?? '');
              if (m) setBody(m.text);
            }}
            className="h-8 w-full text-xs sm:w-56"
            aria-label="Готовый ответ"
          >
            <option value="">Готовый ответ…</option>
            {macros.map((m) => (
              <option key={m.id} value={m.id}>
                {m.title}
              </option>
            ))}
          </Select>
        ) : null}
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
        {note || !hideReplyButton ? (
          <Button variant={note ? 'soft' : 'gold'} size="sm" loading={busy} disabled={!ready} onClick={() => void send()}>
            {!busy ? note ? <NotePencil size={15} weight="light" /> : <PaperPlaneRight size={15} weight="light" /> : null}
            {note ? 'Сохранить заметку' : 'Отправить'}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
