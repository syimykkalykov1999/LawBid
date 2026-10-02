'use client';

import { Briefcase, CreditCard, Gavel, type Icon, Article, Users, UsersThree } from '@phosphor-icons/react';
import { CsvButton } from '@/components/csv-button';
import { FadeIn } from '@/components/legacy/fade-in';
import { PageHeader } from '@/components/page-header';
import { Badge, Card } from '@/components/ui/card';
import { useMe } from '@/lib/hooks';

const ENTITIES: { code: string; title: string; hint: string; icon: Icon; reason?: boolean }[] = [
  { code: 'users', title: 'Пользователи', hint: 'роль, статус, имя, телефон, email, дата регистрации', icon: Users, reason: true },
  { code: 'cases', title: 'Кейсы', hint: 'название, статус, квалификация, штат, бюджет, ставки, просмотры', icon: Briefcase },
  { code: 'bids', title: 'Ставки', hint: 'кейс, адвокат, статус, тип и сумма, раунды', icon: Gavel },
  { code: 'payments', title: 'Платежи', hint: 'пользователь, сумма, статус, дата оплаты, код ошибки', icon: CreditCard },
  { code: 'posts', title: 'Публикации', hint: 'автор, тип, заголовок, лайки, комментарии', icon: Article },
  { code: 'teams', title: 'Команды помощников', hint: 'адвокат, помощник, телефон, статус, обязанности', icon: UsersThree },
];

/** Owner 2026-09-30: CSV exports (UTF-8, up to 50 000 rows each). */
export default function ExportsPage() {
  const { data: me } = useMe();
  // Payments are money: the super admin only.
  const entities = ENTITIES.filter((e) => e.code !== 'payments' || me?.role === 'super_admin');
  return (
    <>
      <PageHeader
        eyebrow="Система"
        title="Выгрузки CSV"
        subtitle="Файл открывается в Excel или Google Sheets. До 50 000 строк."
      />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {entities.map((e, i) => (
          <FadeIn key={e.code} i={i}>
            <Card spotlight className="flex h-full flex-col p-5">
              <div className="flex items-center gap-3">
                <div className="grid h-10 w-10 place-items-center rounded-xl bg-surface-2 text-gold-600">
                  <e.icon size={20} weight="light" />
                </div>
                <h3 className="font-serif text-lg font-semibold text-heading">{e.title}</h3>
              </div>
              <p className="mt-3 flex-1 text-sm text-muted">{e.hint}</p>
              {e.reason ? (
                <div className="mt-3">
                  <Badge tone="warning">нужна причина — есть контакты</Badge>
                </div>
              ) : null}
              <div className="mt-4">
                <CsvButton entity={e.code} label="Скачать CSV" />
              </div>
            </Card>
          </FadeIn>
        ))}
      </div>
    </>
  );
}
