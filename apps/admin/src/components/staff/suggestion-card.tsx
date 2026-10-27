'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';
import { Badge, Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';
import { staffPost, type Recommendation } from '@/lib/staff-data';
import { ADVICE_TONE, SUGGESTION_KIND, WORKSPACE_NAME } from '@/lib/staff-labels';

/**
 * A suggestion of the system, in words: WHO, what is advised
 * («Премировать / Обучить / Заменить»), the proof in numbers, and two buttons.
 * «Сделать» asks for a fresh 2FA code (the shared client does) and writes the
 * journal; «Не сейчас» only closes the suggestion. Nobody else approves.
 */
export function SuggestionCard({
  id,
  adminId,
  name,
  workspace,
  kind,
  recommendation: r,
  link = true,
}: {
  id: string;
  adminId: string;
  name: string;
  workspace?: string;
  kind: string;
  recommendation: Recommendation;
  link?: boolean;
}) {
  const qc = useQueryClient();
  const toast = useToast();
  const [confirming, setConfirming] = useState(false);
  const [note, setNote] = useState('');
  const run = useMutation({
    mutationFn: (action: 'apply' | 'dismiss') =>
      staffPost<{ status: string; done: string }>(`/admin/staff/suggestions/${id}/decide`, { action, note: note.trim() || undefined }),
    onSuccess: (res) => {
      toast.success(res.done);
      setConfirming(false);
      void qc.invalidateQueries({ queryKey: ['staff-today'] });
      void qc.invalidateQueries({ queryKey: ['staff-people'] });
      void qc.invalidateQueries({ queryKey: ['staff-person'] });
      void qc.invalidateQueries({ queryKey: ['staff-person-history', adminId] });
    },
    onError: (e) => toast.error(e),
  });
  return (
    <Card className="space-y-3 p-4" data-testid="suggestion-card">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={ADVICE_TONE[r.advice] ?? 'neutral'}>{r.adviceLabel}</Badge>
        {link ? (
          <Link href={`/staff/${adminId}`} className="font-medium text-heading hover:underline">
            {name}
          </Link>
        ) : (
          <span className="font-medium text-heading">{name}</span>
        )}
        <span className="text-xs text-faint">
          {workspace ? `${WORKSPACE_NAME[workspace] ?? workspace} · ` : ''}
          {SUGGESTION_KIND[kind] ?? kind}
        </span>
      </div>
      <p className="text-sm text-ink">{r.headline}</p>
      {r.lines.length > 0 ? (
        <ul className="list-disc space-y-0.5 pl-5 text-sm text-muted">
          {r.lines.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
      ) : null}
      {confirming ? (
        <div className="space-y-2 rounded-xl bg-surface-2 p-3">
          <p className="text-sm text-ink">{r.actionLabel}. Понадобится код из приложения-аутентификатора.</p>
          <Textarea rows={2} maxLength={500} placeholder="Причина (по желанию, попадёт в журнал)" value={note} onChange={(e) => setNote(e.target.value)} />
          <div className="flex flex-wrap gap-2">
            <Button size="sm" loading={run.isPending} onClick={() => run.mutate('apply')}>
              Подтвердить
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>
              Отмена
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant={r.advice === 'replace' ? 'danger-soft' : 'soft'} onClick={() => setConfirming(true)}>
            {r.actionLabel}
          </Button>
          <Button size="sm" variant="ghost" loading={run.isPending} onClick={() => run.mutate('dismiss')}>
            Не сейчас
          </Button>
        </div>
      )}
    </Card>
  );
}
