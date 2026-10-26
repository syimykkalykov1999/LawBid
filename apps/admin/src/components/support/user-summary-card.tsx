'use client';

import { ArrowUpRight, CheckCircle, MinusCircle } from '@phosphor-icons/react';
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import type { components } from '@/lib/api/schema';
import { ROLE_TEXT, StatusBadge } from '@/lib/labels';
import { formatDateTime } from '@/lib/utils';
import { initials } from './support-labels';

type Summary = components['schemas']['AdminSupportUserSummaryDto'];

const LANG: Record<string, string> = { en: 'английский', ru: 'русский', es: 'испанский' };

function Yes({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <span className={ok ? 'inline-flex items-center gap-1 text-ink' : 'inline-flex items-center gap-1 text-faint'}>
      {ok ? <CheckCircle size={14} weight="light" className="text-success" /> : <MinusCircle size={14} weight="light" />}
      {children}
    </span>
  );
}

/** Who wrote the ticket: name, role, account status, contacts on file. */
export function UserSummaryCard({ u, canOpenUser }: { u: Summary; canOpenUser: boolean }) {
  return (
    <Card className="p-5">
      <div className="flex items-center gap-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-accent-soft text-sm font-semibold text-gold-600">
          {initials(u.name)}
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate font-medium text-heading">{u.name}</div>
          <div className="truncate text-xs text-muted">
            {u.username ? `@${u.username} · ` : ''}
            {u.role ? (ROLE_TEXT[u.role] ?? u.role) : 'без роли'}
          </div>
        </div>
        {canOpenUser ? (
          <Link
            href={`/users/${u.id}`}
            className="grid h-8 w-8 place-items-center rounded-lg text-faint transition-colors hover:bg-surface-2 hover:text-gold-600"
            aria-label="Открыть профиль"
            title="Открыть профиль"
          >
            <ArrowUpRight size={16} weight="light" />
          </Link>
        ) : null}
      </div>
      <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
        <dt className="text-muted">Статус</dt>
        <dd>
          <StatusBadge status={u.status} />
        </dd>
        <dt className="text-muted">Язык</dt>
        <dd className="text-ink">{LANG[u.uiLanguage] ?? u.uiLanguage}</dd>
        <dt className="text-muted">Контакты</dt>
        <dd className="flex flex-wrap gap-x-3 gap-y-1">
          <Yes ok={u.hasEmail}>email</Yes>
          <Yes ok={u.hasPhone}>телефон</Yes>
        </dd>
        {u.subscriptionActive != null ? (
          <>
            <dt className="text-muted">Подписка</dt>
            <dd>
              <Yes ok={u.subscriptionActive}>{u.subscriptionActive ? 'активна' : 'нет'}</Yes>
            </dd>
          </>
        ) : null}
        <dt className="text-muted">С нами с</dt>
        <dd className="text-ink">{formatDateTime(u.createdAt)}</dd>
      </dl>
      {canOpenUser ? (
        <Link href={`/users/${u.id}`} className="mt-4 inline-flex items-center gap-1 text-xs font-medium text-gold-600 hover:underline">
          Профиль пользователя <ArrowUpRight size={12} />
        </Link>
      ) : null}
    </Card>
  );
}
