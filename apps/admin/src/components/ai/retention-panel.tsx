'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { SectionTitle } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Field, Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';
import { api } from '@/lib/api/client';

type Scope = 'worker' | 'technician';
type What = 'records' | 'images';

/** 0..365, whole days; anything else is not saved. */
export function parseDays(raw: string): number | null {
  if (!/^\d{1,3}$/.test(raw.trim())) return null;
  const n = Number(raw);
  return n >= 0 && n <= 365 ? n : null;
}

/**
 * Owner 2026-11-12 (row 49): «Хранить N дней» and «Очистить сейчас» for what
 * the AI makes. 15 days by default, 0 = keep forever; every change and every
 * purge asks for a fresh 2FA code (the panel's global prompt) and leaves an
 * audit row. Undecided items and open tasks are never removed.
 */
export function AiRetentionPanel({ scope }: { scope: Scope }) {
  const qc = useQueryClient();
  const toast = useToast();
  const q = useQuery({
    queryKey: ['ai-retention'],
    queryFn: async () => (await api.GET('/admin/ai-attachments/retention')).data!.data,
  });
  const [records, setRecords] = useState('');
  const [images, setImages] = useState('');
  useEffect(() => {
    if (!q.data) return;
    setRecords(String(q.data.recordsDays));
    setImages(String(q.data.imagesDays));
  }, [q.data]);

  const save = useMutation({
    mutationFn: async (p: { what: What; days: number }) =>
      (await api.PATCH('/admin/ai-attachments/retention', { body: p })).data!.data,
    onSuccess: (d) => {
      qc.setQueryData(['ai-retention'], d);
      toast.success('Сохранено');
    },
    onError: (e) => toast.error(e),
  });
  const purge = useMutation({
    mutationFn: async (mode: 'older' | 'all') =>
      (await api.POST('/admin/ai-attachments/retention/purge', { body: { mode, scope } })).data!.data,
    onSuccess: (r) => {
      void qc.invalidateQueries({ queryKey: [scope === 'worker' ? 'ai-worker' : 'ai-assistant'] });
      toast.success(
        scope === 'worker'
          ? `Удалено: записей ${r.items + r.runs}, картинок ${r.images + r.unattached}`
          : `Удалено картинок: ${r.images + r.unattached}`,
      );
    },
    onError: (e) => toast.error(e),
  });

  const field = (what: What, value: string, set: (v: string) => void, label: string) => {
    const days = parseDays(value);
    const stored = what === 'records' ? q.data?.recordsDays : q.data?.imagesDays;
    return (
      <Field label={label} htmlFor={`ai-keep-${scope}-${what}`}>
        <div className="flex items-center gap-2">
          <Input
            id={`ai-keep-${scope}-${what}`}
            inputMode="numeric"
            className="w-24"
            value={value}
            onChange={(e) => set(e.target.value)}
          />
          <span className="text-xs text-muted">дней (0 — хранить всегда)</span>
          <Button
            size="sm"
            variant="outline"
            disabled={days === null || days === stored || save.isPending}
            loading={save.isPending && save.variables?.what === what}
            onClick={() => days !== null && save.mutate({ what, days })}
          >
            Сохранить срок
          </Button>
        </div>
      </Field>
    );
  };

  return (
    <>
      <SectionTitle>Хранение</SectionTitle>
      <Card className="mb-6 grid gap-3 p-4 text-sm">
        {scope === 'worker' ? field('records', records, setRecords, 'Записи (законченные запуски и решённые предложения)') : null}
        {field('images', images, setImages, 'Картинки (после закрытия задачи)')}
        <p className="text-xs text-muted">
          {scope === 'worker'
            ? 'Примеры, на которых ИИ учится (ваши последние решения по каждой роли), роли и нерешённые предложения не удаляются никогда.'
            : 'Картинки открытых задач не удаляются. Ветка отклонённого или влитого PR удаляется сразу.'}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" loading={purge.isPending && purge.variables === 'older'} disabled={purge.isPending} onClick={() => purge.mutate('older')}>
            Очистить сейчас: старше срока
          </Button>
          <Button size="sm" variant="outline" loading={purge.isPending && purge.variables === 'all'} disabled={purge.isPending} onClick={() => purge.mutate('all')}>
            Очистить сейчас: всё законченное
          </Button>
        </div>
      </Card>
    </>
  );
}
