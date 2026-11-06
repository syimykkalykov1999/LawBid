'use client';

import { ArrowSquareOut, Copy } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { copyChips, openRegistry, registryButtonLabel, registryLinks, type CopyChipSource } from '@/lib/registry-conveyor';
import { cn } from '@/lib/utils';

/**
 * Owner 2026-11-04 (R-400): the verifier's hands on the state registry. One
 * row: «Открыть реестр штата» (always into the same browser tab — see
 * REGISTRY_TAB in lib/registry-conveyor.ts) and the one-tap copy chips (ФИО,
 * bar number, state, date of birth when known), each with the usual toast.
 * `tone="page"` draws it with the admin's own buttons under the thumbnails;
 * `tone="overlay"` matches the lightbox's white-on-dark controls on its last
 * slide. Same data, same handlers in both places.
 */
export function RegistryActions({ card, tone = 'page', className }: { card: CopyChipSource; tone?: 'page' | 'overlay'; className?: string }) {
  const toast = useToast();
  const links = registryLinks(card.licenses);
  const chips = copyChips(card);
  if (links.length === 0 && chips.length === 0) return null;

  const copy = (label: string, value: string) => {
    const clip = typeof navigator === 'undefined' ? undefined : navigator.clipboard;
    if (!clip?.writeText) {
      toast.error(new Error('Буфер обмена недоступен в этом браузере'));
      return;
    }
    void clip.writeText(value).then(
      () => toast.success(`Скопировано: ${label} — ${value}`),
      (e: unknown) => toast.error(e),
    );
  };
  const open = (url: string) => {
    if (!openRegistry(url)) toast.error(new Error('Браузер не дал открыть вкладку реестра — разрешите всплывающие окна для админки'));
  };

  const overlay = tone === 'overlay';
  const overlayBtn = 'inline-flex h-9 items-center gap-1.5 rounded-full bg-white/10 px-3.5 text-sm font-medium text-white hover:bg-white/20 disabled:opacity-45';
  return (
    <div className={cn('flex flex-wrap items-center gap-2', overlay ? 'justify-center' : '', className)} data-testid="registry-actions" role="group" aria-label="Реестр штата и копирование">
      {links.map((l) =>
        overlay ? (
          <button key={l.stateCode} type="button" className={overlayBtn} disabled={!l.url} title={l.url ? `${l.stateName}: откроется в одной и той же вкладке` : `${l.stateName}: реестра нет`} onClick={() => l.url && open(l.url)} data-testid="registry-open">
            <ArrowSquareOut size={15} /> {l.url ? registryButtonLabel(l, links.length) : `Реестра ${l.stateCode} нет`}
          </button>
        ) : (
          <Button key={l.stateCode} type="button" size="sm" variant="outline" disabled={!l.url} title={l.url ? `${l.stateName}: откроется в одной и той же вкладке` : `${l.stateName}: реестра нет`} onClick={() => l.url && open(l.url)} data-testid="registry-open">
            <ArrowSquareOut size={13} /> {l.url ? registryButtonLabel(l, links.length) : `Реестра ${l.stateCode} нет`}
          </Button>
        ),
      )}
      {chips.map((c, i) =>
        overlay ? (
          <button key={`${c.id}-${i}`} type="button" className={overlayBtn} title={`Скопировать: ${c.value}`} onClick={() => copy(c.label, c.value)} data-testid={`copy-${c.id}`}>
            <Copy size={14} /> {c.label}
          </button>
        ) : (
          <Button key={`${c.id}-${i}`} type="button" size="sm" variant="ghost" title={`Скопировать: ${c.value}`} onClick={() => copy(c.label, c.value)} data-testid={`copy-${c.id}`}>
            <Copy size={13} /> {c.label}
            <span className="max-w-40 truncate font-mono text-[11px] text-muted">{c.value}</span>
          </Button>
        ),
      )}
    </div>
  );
}
