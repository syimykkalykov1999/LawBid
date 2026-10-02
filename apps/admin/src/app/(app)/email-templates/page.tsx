'use client';

import { ArrowRight, BracketsCurly, EnvelopeSimple } from '@phosphor-icons/react';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'motion/react';
import Link from 'next/link';
import { LOCALE_LABEL, type EmailTemplateSummary } from '@/components/email/email-utils';
import { ErrorNote, PageHeader } from '@/components/page-header';
import { Badge, Card } from '@/components/ui/card';
import { EmptyState, Skeleton } from '@/components/ui/empty';
import { api, errorText } from '@/lib/api/client';
import { useMe } from '@/lib/hooks';
import { can } from '@/lib/rbac';
import { formatDateTime } from '@/lib/utils';

/** Transactional emails: catalog with which locales carry our own text. */
export default function EmailTemplatesPage() {
  const { data: me } = useMe();
  const q = useQuery({
    queryKey: ['email-templates'],
    queryFn: async () => (await api.GET('/admin/email-templates')).data!.data,
  });
  const list = q.data ?? [];

  return (
    <>
      <PageHeader
        eyebrow="Связь"
        title="Шаблоны писем"
        subtitle="Тексты служебных писем: коды входа, новое устройство, выгрузка данных, уведомления. Свой текст заменяет стандартный для выбранного языка."
      />
      {me && !can(me, 'email_templates') ? <ErrorNote text="Шаблоны писем недоступны: нужен доступ от супер-админа." /> : null}
      <ErrorNote text={q.error ? errorText(q.error) : null} />
      {q.isPending ? (
        <div className="grid gap-4 md:grid-cols-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-44 rounded-[var(--radius-lg)]" />
          ))}
        </div>
      ) : list.length === 0 && !q.error ? (
        <EmptyState icon={EnvelopeSimple} title="Писем нет" text="Каталог писем пуст." />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {list.map((t, i) => (
            <TemplateCard key={t.key} t={t} i={i} />
          ))}
        </div>
      )}
    </>
  );
}

function TemplateCard({ t, i }: { t: EmailTemplateSummary; i: number }) {
  const overridden = t.locales.filter((l) => l.overridden);
  const last = overridden
    .map((l) => l.updatedAt)
    .filter((d): d is string => !!d)
    .sort()
    .pop();
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay: i * 0.04, ease: [0.16, 1, 0.3, 1] }}
    >
      <Link href={`/email-templates/${t.key}`} className="group block h-full">
        <Card spotlight className="flex h-full flex-col p-5 transition-colors group-hover:border-gold/40">
          <div className="flex items-start gap-3.5">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-surface-2 text-faint transition-colors group-hover:text-gold-600">
              <EnvelopeSimple size={20} weight="light" />
            </span>
            <div className="min-w-0 flex-1">
              <h3 className="font-medium text-heading">{t.title}</h3>
              <p className="mt-1 text-sm leading-relaxed text-muted">{t.description}</p>
            </div>
            <ArrowRight size={16} className="mt-1 shrink-0 text-faint transition-transform group-hover:translate-x-0.5 group-hover:text-gold-600" />
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-1.5">
            {overridden.length === 0 ? (
              <Badge tone="neutral">стандартный</Badge>
            ) : (
              overridden.map((l) => (
                <Badge key={l.locale} tone={l.active ? 'gold' : 'warning'} dot>
                  свой текст {LOCALE_LABEL[l.locale]}
                  {l.active ? '' : ' · выключен'}
                </Badge>
              ))
            )}
            {overridden.length > 0 && overridden.length < t.locales.length
              ? t.locales
                  .filter((l) => !l.overridden)
                  .map((l) => (
                    <Badge key={l.locale} tone="neutral">
                      {LOCALE_LABEL[l.locale]} стандартный
                    </Badge>
                  ))
              : null}
          </div>
          <div className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-4 text-xs text-faint">
            <span className="inline-flex items-center gap-1">
              <BracketsCurly size={13} weight="light" />
              {t.variables.length ? t.variables.map((v) => v.name).join(', ') : 'без переменных'}
            </span>
            {last ? <span>изменён {formatDateTime(last)}</span> : null}
          </div>
        </Card>
      </Link>
    </motion.div>
  );
}
