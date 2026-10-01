'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { ErrorNote, PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input, Label, Select } from '@/components/ui/input';
import { Table, Td, Th } from '@/components/ui/table';
import { api, errorText } from '@/lib/api/client';
import { formatDateTime } from '@/lib/utils';

const AUDIENCE: Record<string, string> = {
  all: 'все пользователи',
  attorneys: 'адвокаты',
  clients: 'клиенты',
  assistants: 'помощники',
};

/**
 * Owner 2026-09-30 — broadcasts: a push and an in-app notification from
 * the LawBid team to an audience (optionally one state).
 */
export default function BroadcastsPage() {
  const qc = useQueryClient();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [audience, setAudience] = useState('all');
  const [state, setState] = useState('');
  const history = useQuery({
    queryKey: ['admin-broadcasts'],
    queryFn: async () => (await api.GET('/admin/broadcasts')).data!.data,
  });
  const send = useMutation({
    mutationFn: async () => {
      const r = await api.POST('/admin/broadcasts', {
        body: {
          title: title.trim(),
          body: body.trim(),
          audience: audience as never,
          stateCode: state.trim().toUpperCase() || undefined,
        },
      });
      if (r.error) throw r.error;
      return r.data!.data;
    },
    onSuccess: () => {
      setTitle('');
      setBody('');
      void qc.invalidateQueries({ queryKey: ['admin-broadcasts'] });
    },
  });
  const ready = title.trim() && body.trim() && (!state || /^[A-Za-z]{2}$/.test(state));
  return (
    <>
      <PageHeader title="Рассылки" subtitle="Пуш и уведомление в приложении от команды LawBid." />
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Новая рассылка</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="bt">Заголовок</Label>
            <Input id="bt" value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="bb">Текст</Label>
            <textarea
              id="bb"
              value={body}
              maxLength={1000}
              onChange={(e) => setBody(e.target.value)}
              className="min-h-24 w-full rounded-[var(--radius-md)] border border-line bg-surface p-3 text-sm"
            />
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <div className="w-56 space-y-1">
              <Label htmlFor="ba">Кому</Label>
              <Select id="ba" value={audience} onChange={(e) => setAudience(e.target.value)}>
                {Object.entries(AUDIENCE).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </Select>
            </div>
            <div className="w-32 space-y-1">
              <Label htmlFor="bs">Штат (необяз.)</Label>
              <Input id="bs" value={state} maxLength={2} placeholder="IL" onChange={(e) => setState(e.target.value)} />
            </div>
            <Button
              variant="gold"
              disabled={!ready || send.isPending}
              onClick={() => {
                if (window.confirm(`Отправить «${title}» — ${AUDIENCE[audience]}${state ? `, ${state.toUpperCase()}` : ''}?`)) send.mutate();
              }}
            >
              {send.isPending ? 'Отправляем…' : 'Отправить'}
            </Button>
            {send.data ? <span className="text-sm text-success">Отправлено: {send.data.recipients}</span> : null}
          </div>
          <ErrorNote text={send.error ? errorText(send.error) : null} />
        </CardContent>
      </Card>
      <ErrorNote text={history.error ? errorText(history.error) : null} />
      <Table>
        <thead>
          <tr>
            <Th>Рассылка</Th>
            <Th>Кому</Th>
            <Th>Получателей</Th>
            <Th>Когда</Th>
          </tr>
        </thead>
        <tbody>
          {(history.data ?? []).map((b) => (
            <tr key={b.id}>
              <Td className="max-w-md">
                <div className="font-medium">{b.title}</div>
                <div className="line-clamp-2 text-xs text-muted">{b.body}</div>
              </Td>
              <Td className="text-xs">
                {AUDIENCE[b.audience] ?? b.audience}
                {b.stateCode ? `, ${b.stateCode}` : ''}
              </Td>
              <Td>{b.recipients}</Td>
              <Td className="whitespace-nowrap text-xs">{formatDateTime(b.createdAt)}</Td>
            </tr>
          ))}
          {!history.isPending && (history.data ?? []).length === 0 ? (
            <tr>
              <Td colSpan={4} className="py-8 text-center text-muted">
                Рассылок ещё не было
              </Td>
            </tr>
          ) : null}
        </tbody>
      </Table>
    </>
  );
}
