'use client';

import { ArrowRight, Lightning } from '@phosphor-icons/react';
import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { api } from '@/lib/api/client';
import { verificationReviewHref } from '@/lib/review-flow';

/**
 * Verification focus mode: opens the oldest waiting request (skipping the
 * one on screen) on the «…и дальше» review screen (owner 2026-10-28).
 * Empty queue → back to «Рабочее место».
 */
export function useNextVerification(currentId?: string) {
  const router = useRouter();
  const toast = useToast();
  return useMutation({
    mutationFn: async () => {
      const r = await api.GET('/admin/verification/requests', { params: { query: { limit: 10 } } });
      return (r.data?.data ?? []).find((x) => x.id !== currentId && x.status !== 'needs_more_info')?.id ?? null;
    },
    onSuccess: (id) => {
      if (id) router.push(verificationReviewHref(id));
      else {
        toast.success('Очередь пуста: все заявки проверены');
        router.push('/workspace');
      }
    },
    onError: (e) => toast.error(e),
  });
}

/** The strip on top of a card opened from the queue. */
export function FocusBar({ text, onSkip, busy, onExit }: { text: string; onSkip: () => void; busy: boolean; onExit: () => void }) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-3 rounded-[var(--radius-lg)] border border-gold/40 bg-accent-soft/50 px-4 py-2.5 text-sm">
      <Lightning size={16} weight="fill" className="shrink-0 text-gold-600" />
      <span className="min-w-0 flex-1 text-ink">{text}</span>
      <Button variant="outline" size="sm" loading={busy} onClick={onSkip}>
        {busy ? null : <ArrowRight size={14} weight="bold" />}
        Пропустить
      </Button>
      <Button variant="ghost" size="sm" onClick={onExit}>
        Выйти
      </Button>
    </div>
  );
}
