'use client';

import { PageHeader } from '@/components/page-header';
import { CsvButton } from '@/components/csv-button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const ENTITIES: [string, string, string][] = [
  ['users', 'Пользователи', 'роль, статус, имя, телефон, email, дата регистрации'],
  ['cases', 'Кейсы', 'название, статус, квалификация, штат, бюджет, ставки, просмотры'],
  ['bids', 'Ставки', 'кейс, адвокат, статус, тип и сумма, раунды'],
  ['payments', 'Платежи', 'пользователь, сумма, статус, дата оплаты, код ошибки'],
  ['posts', 'Публикации', 'автор, тип, заголовок, лайки, комментарии'],
  ['teams', 'Команды помощников', 'адвокат, помощник, телефон, статус, обязанности'],
];

/** Owner 2026-09-30: CSV exports (UTF-8, up to 50 000 rows each). */
export default function ExportsPage() {
  return (
    <>
      <PageHeader title="Выгрузки CSV" subtitle="Файл открывается в Excel / Google Sheets. До 50 000 строк." />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {ENTITIES.map(([code, title, hint]) => (
          <Card key={code}>
            <CardHeader>
              <CardTitle>{title}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="text-xs text-muted">{hint}</div>
              <CsvButton entity={code} label="Скачать CSV" />
            </CardContent>
          </Card>
        ))}
      </div>
    </>
  );
}
