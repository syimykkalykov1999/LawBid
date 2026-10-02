'use client';

import { useCallback, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Label, Select, Textarea } from '@/components/ui/input';

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
    <Dialog
      open
      onClose={() => onClose(null)}
      title={opts.title}
      description={opts.description}
      eyebrow={opts.danger ? 'Подтверждение' : undefined}
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (ok) onClose({ text: trimmed, choice: choice || undefined });
        }}
      >
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
              <span className="ml-1 text-xs font-normal text-muted">(не короче {min} символов)</span>
            ) : null}
          </Label>
          <Textarea
            id="reason-text"
            autoFocus
            rows={4}
            maxLength={max}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <div className="flex justify-between text-xs text-faint">
            <span>{!opts.optionalText && trimmed.length < min ? `ещё ${min - trimmed.length}` : ''}</span>
            <span>
              {trimmed.length}/{max}
            </span>
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
    </Dialog>
  );
}
