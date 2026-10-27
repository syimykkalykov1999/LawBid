'use client';

import { ArrowRight } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import type { DeskSettingsView } from '@/lib/desk-data';
import type { DeskRole } from '@/lib/desk';
import { useDeskQueue } from './use-desk-queue';

/** «Следующий» of the open tab (drawn only for a tab that has a queue). */
export function NextButton({ role, tab, settings, blocked }: { role: DeskRole; tab: string; settings: DeskSettingsView; blocked?: string }) {
  const q = useDeskQueue(role, tab, settings);
  if (q.mode === 'none') return null;
  return (
    <Button variant="gold" size="sm" loading={q.pending} disabled={!!blocked} title={blocked} onClick={q.next}>
      {q.pending ? null : <ArrowRight size={15} weight="bold" />}
      Следующий
    </Button>
  );
}
