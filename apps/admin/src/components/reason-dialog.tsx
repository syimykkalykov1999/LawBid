'use client';

import { useCallback, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Label, Select } from '@/components/ui/input';

export interface ReasonOptions {
  title: string;
  description?: string;
  label?: string;
  min?: number;
  max?: number;
  confirm?: string;
  danger?: boolean;
  /** Optional select shown above the text (e.g. a rejection code). */
  choices?: { value: string; label: string }[];
  choiceLabel?: string;
  /** Text may be empty (the choice carries the decision). */
  optionalText?: boolean;
}

export type ReasonResult = { text: string; choice?: string } | null;

/**
 * One promise-based dialog for every "enter a reason" step (docs/06 §2.1
 * justification ≥ 10 chars, §3.4 sanction reasons, verifier messages).
 * `const { ask, dialog } = useReason()`; render `{dialog}` once.
 */
export function useReason() {
  const [state, setState] = useState<{
    opts: ReasonOptions;
    resolve: (r: ReasonResult) => void;
  } | null>(null);

  const ask = useCallback(
    (opts: ReasonOptions) =>
      new Promise<ReasonResult>((resolve) => setState({ opts, resolve })),
    [],
  );

  const dialog = state ? (
    <ReasonDialog
      opts={state.opts}
      onClose={(r) => {
        state.resolve(r);
        setState(null);
      }}
    />
  ) : null;

  return { ask, dialog };
}

function ReasonDialog({
  opts,
  onClose,
}: {
  opts: ReasonOptions;
  onClose: (r: ReasonResult) => void;
}) {
  const min = opts.min ?? 10;
  const max = opts.max ?? 500;
  const [text, setText] = useState('');
  const [choice, setChoice] = useState(opts.choices?.[0]?.value ?? '');
  const trimmed = text.trim();
  const ok =
    (opts.optionalText || trimmed.length >= min) && trimmed.length <= max;

  return (
    <div
      role="dialog"
      aria-modal
      aria-labelledby="reason-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-navy/60 p-4"
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose(null);
      }}
    >
      <form
        className="w-full max-w-md space-y-4 rounded-[var(--radius-lg)] bg-surface p-5 shadow-xl"
        onSubmit={(e) => {
          e.preventDefault();
          if (ok) onClose({ text: trimmed, choice: choice || undefined });
        }}
      >
        <div>
          <h2 id="reason-title" className="text-lg font-semibold text-navy">
            {opts.title}
          </h2>
          {opts.description ? (
            <p className="mt-1 text-sm text-muted">{opts.description}</p>
          ) : null}
        </div>
        {opts.choices ? (
          <div className="space-y-1.5">
            <Label htmlFor="reason-choice">{opts.choiceLabel ?? 'Причина'}</Label>
            <Select
              id="reason-choice"
              value={choice}
              onChange={(e) => setChoice(e.target.value)}
            >
              {opts.choices.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </Select>
          </div>
        ) : null}
        <div className="space-y-1.5">
          <Label htmlFor="reason-text">
            {opts.label ?? 'Комментарий'}
            {!opts.optionalText ? (
              <span className="ml-1 text-xs text-muted">(не короче {min} символов)</span>
            ) : null}
          </Label>
          <textarea
            id="reason-text"
            autoFocus
            rows={4}
            maxLength={max}
            value={text}
            onChange={(e) => setText(e.target.value)}
            className="w-full rounded-[var(--radius-md)] border border-line bg-surface px-3 py-2 text-sm"
          />
          <div className="text-right text-xs text-muted">
            {trimmed.length}/{max}
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={() => onClose(null)}>
            Отмена
          </Button>
          <Button type="submit" variant={opts.danger ? 'danger' : 'default'} disabled={!ok}>
            {opts.confirm ?? 'Подтвердить'}
          </Button>
        </div>
      </form>
    </div>
  );
}
