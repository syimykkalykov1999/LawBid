'use client';

import { useCallback, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Label, Select, Textarea } from '@/components/ui/input';
import { useMe } from '@/lib/hooks';
import { REASON_MIN, useReasonRequired } from '@/lib/reason-policy';

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
  /** Text is needed even though it is labelled «Причина»: a message to
   * a person, or the X-Justification for viewing personal data. */
  required?: boolean;
  /** Section of the action when it differs from the page's (e.g. a money
   * action on a user's card): decides whether staff must give a reason. */
  area?: string;
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
  const isReason = !opts.label || opts.label.startsWith('Причина');
  // Owner 2026-10-05: the owner never has to give a reason; staff do in the
  // sections the owner switched on (Администраторы → «Обязательная причина»).
  const policy = useReasonRequired(opts.area);
  const min = opts.required ? (opts.min ?? 10) : isReason ? REASON_MIN : (opts.min ?? 10);
  const max = opts.max ?? 500;
  const [text, setText] = useState('');
  const [choice, setChoice] = useState(opts.choices?.[0]?.value ?? '');
  const trimmed = text.trim();
  // Owner 2026-10-05: an admin never has to write a reason for an action;
  // it is optional and stored empty when left blank.
  // The X-Justification for personal data too: optional for the owner
  // (the access is still logged).
  const { data: me } = useMe();
  const owner = me?.role === 'super_admin';
  const optional = opts.optionalText || (opts.required ? owner && isReason : isReason && !policy);
  const ok = (optional || trimmed.length >= min) && trimmed.length <= max;

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
            {opts.label ?? 'Причина'}
            {optional ? (
              opts.optionalText ? null : <span className="ml-1 text-xs font-normal text-muted">(необязательно)</span>
            ) : (
              <span className="ml-1 text-xs font-normal text-muted">(не короче {min} символов)</span>
            )}
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
            <span>{!optional && trimmed.length < min ? `ещё ${min - trimmed.length}` : ''}</span>
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
