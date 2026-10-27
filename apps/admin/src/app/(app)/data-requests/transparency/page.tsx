'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';
import { ErrorNote, PageHeader } from '@/components/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input, Label } from '@/components/ui/input';
import { api, errorText } from '@/lib/api/client';
import { DATA_REQUEST_STATUS, DATA_REQUEST_TYPE, label } from '@/lib/labels';

/** Owner 2026-10-28: counts for the yearly transparency report. */
export default function TransparencyPage() {
  const [year, setYear] = useState(String(new Date().getUTCFullYear()));
  const y = Number(year);
  const valid = Number.isInteger(y) && y >= 2020 && y <= 2100;
  const q = useQuery({
    queryKey: ['legal-transparency', y],
    enabled: valid,
    queryFn: async () => (await api.GET('/admin/data-requests/legal/transparency', { params: { query: { year: y } } })).data!.data,
  });
  const r = q.data;
  const rows = (m: Record<string, number>, names?: Record<string, string>) =>
    Object.entries(m).map(([k, v]) => (
      <li key={k} className="flex justify-between gap-3">
        <span>{names ? label(names, k) : k}</span>
        <span className="tabular-nums">{v}</span>
      </li>
    ));

  return (
    <>
      <PageHeader
        eyebrow="Система"
        title="Отчёт прозрачности"
        subtitle="Сколько запросов госорганов пришло за год и чем они кончились. Цифры для публикации; имён и содержимого здесь нет."
        actions={
          <Link href="/data-requests" className="text-sm font-medium text-heading hover:underline">
            К запросам
          </Link>
        }
      />
      <div className="mb-4 max-w-[160px] space-y-1">
        <Label htmlFor="yr">Год</Label>
        <Input id="yr" inputMode="numeric" value={year} onChange={(e) => setYear(e.target.value)} />
      </div>
      <ErrorNote text={q.error ? errorText(q.error) : null} />
      {r ? (
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Всего запросов: {r.total}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-sm">
              <ul className="space-y-1">{rows(r.byType, DATA_REQUEST_TYPE)}</ul>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Чем кончились</CardTitle>
            </CardHeader>
            <CardContent className="text-sm">
              <ul className="space-y-1">{rows(r.byStatus, DATA_REQUEST_STATUS)}</ul>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>По странам</CardTitle>
            </CardHeader>
            <CardContent className="text-sm">
              <ul className="space-y-1">{rows(r.byCountry)}</ul>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Остальное</CardTitle>
            </CardHeader>
            <CardContent className="text-sm">
              <ul className="space-y-1">
                <li className="flex justify-between gap-3"><span>Аккаунтов затронуто</span><span className="tabular-nums">{r.accountsAffected}</span></li>
                <li className="flex justify-between gap-3"><span>С запретом рассказывать</span><span className="tabular-nums">{r.withGagOrder}</span></li>
                <li className="flex justify-between gap-3"><span>Пользователям сообщили</span><span className="tabular-nums">{r.usersNotified}</span></li>
                <li className="flex justify-between gap-3"><span>Заморозок данных</span><span className="tabular-nums">{r.holdsPlaced}</span></li>
                <li className="flex justify-between gap-3"><span>Выгрузок отдано</span><span className="tabular-nums">{r.productionsMade}</span></li>
              </ul>
            </CardContent>
          </Card>
        </div>
      ) : null}
    </>
  );
}
