'use client';

import { ArrowSquareOut, Check, Copy } from '@phosphor-icons/react';
import { useState } from 'react';
import { Badge } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import type { components } from '@/lib/api/schema';
import { cn } from '@/lib/utils';

type Lookup = components['schemas']['BarLookupDto'];

/** Red chip on an attorney whose license is on the block list. */
export function BlockedChip({ className }: { className?: string }) {
  return (
    <Badge tone="danger" dot className={className} title="Номер лицензии в блок-листе: его нельзя зарегистрировать снова">
      Номер в блок-листе
    </Badge>
  );
}

/**
 * Owner 2026-10-05 07:00 — one line per license: «Открыть запись №…» when the
 * registry page opens straight on the number, otherwise «Открыть в реестре» plus
 * «Скопировать номер» to paste into the registry's search. Trailing controls are
 * fixed-width; the state / number text ellipsizes instead of pushing them.
 */
export function BarLookups({ lookups, compact, className }: { lookups: Lookup[]; compact?: boolean; className?: string }) {
  if (!lookups.length) return null;
  return (
    <ul className={cn('space-y-1', className)}>
      {lookups.map((l) => (
        <LookupRow key={`${l.stateCode}:${l.barNumber}`} l={l} compact={compact} />
      ))}
    </ul>
  );
}

function LookupRow({ l, compact }: { l: Lookup; compact?: boolean }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    void navigator.clipboard?.writeText(l.barNumber).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    });
  };
  const title = `${l.stateName || l.stateCode} · № ${l.barNumber}`;
  return (
    <li className={cn('flex items-center gap-2', compact ? 'text-xs' : 'text-sm')}>
      <span className="min-w-0 flex-1 truncate" title={title}>
        <span className="font-medium text-ink">{l.stateCode}</span>
        <span className="ml-1 font-mono text-muted">№ {l.barNumber}</span>
        {l.blocked ? (
          <Badge tone="danger" className="ml-1.5 align-middle">
            в блок-листе
          </Badge>
        ) : null}
      </span>
      {l.url ? (
        <a
          href={l.url}
          target="_blank"
          rel="noreferrer"
          title={l.prefilled ? `Открыть запись № ${l.barNumber} в реестре ${l.stateCode}` : `Открыть реестр ${l.stateCode}; номер вставьте в поиск`}
          className={cn(
            'inline-flex shrink-0 items-center justify-center gap-1 rounded-[10px] border border-line-strong bg-surface px-2 text-xs font-medium text-ink transition-colors hover:border-gold/60 hover:bg-surface-2',
            compact ? 'h-7' : 'h-8',
            l.prefilled ? 'w-40' : 'w-36',
          )}
        >
          <ArrowSquareOut size={13} className="shrink-0" />
          <span className="truncate">{l.prefilled ? `Открыть запись № ${l.barNumber}` : 'Открыть в реестре'}</span>
        </a>
      ) : (
        <span className={cn('inline-flex shrink-0 items-center text-xs text-faint', l.prefilled ? 'w-40' : 'w-36')}>реестра нет</span>
      )}
      {!l.prefilled ? (
        <Button type="button" size="sm" variant="ghost" className={cn('w-36 shrink-0 px-2', compact && 'h-7')} onClick={copy} title="Скопировать номер лицензии">
          {copied ? <Check size={13} className="text-success" /> : <Copy size={13} />}
          {copied ? 'Скопировано' : 'Скопировать номер'}
        </Button>
      ) : null}
    </li>
  );
}
