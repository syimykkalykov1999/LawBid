'use client';

import { Check, Copy } from '@phosphor-icons/react';
import { useEffect, useState } from 'react';
import { useToast } from '@/components/ui/toast';
import { cn } from '@/lib/utils';

/** The words of the toast after a copy (scout 13.11, row 96). */
export const COPIED_TEXT = 'Скопировано';

/**
 * Scout 13.11 batch 1 (row 96): the copy icon next to ids, emails and
 * phones, as Stripe puts one next to every id. Copied from shadcn/ui's
 * `CopyButton` (MIT, apps/www/components/copy-button.tsx): the icon turns
 * into a check for two seconds after `navigator.clipboard.writeText`; here
 * the corner toast «Скопировано» also confirms it, and a browser without
 * the clipboard (an insecure origin) says so instead of failing silently.
 * The click never reaches the row under it (rows open a card on click).
 */
export function CopyButton({
  text,
  label = 'Скопировать',
  className,
}: {
  text: string;
  label?: string;
  className?: string;
}) {
  const toast = useToast();
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(t);
  }, [copied]);
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      data-testid="copy-button"
      onClick={(e) => {
        e.stopPropagation();
        e.preventDefault();
        const clip = typeof navigator === 'undefined' ? undefined : navigator.clipboard;
        if (!clip?.writeText) {
          toast.error('Буфер обмена недоступен в этом браузере');
          return;
        }
        void clip.writeText(text).then(
          () => {
            setCopied(true);
            toast.success(COPIED_TEXT);
          },
          (err: unknown) => toast.error(err),
        );
      }}
      className={cn(
        'inline-flex rounded-md p-1 text-faint transition-colors hover:bg-surface-2 hover:text-ink',
        className,
      )}
    >
      {copied ? <Check size={14} className="text-success" /> : <Copy size={14} />}
    </button>
  );
}
