'use client';

import { CaretRight, UserCircle } from '@phosphor-icons/react';
import { motion } from 'motion/react';
import Link from 'next/link';
import { StatusPill, ROLE_TEXT, TICKET_STATUS } from '@/lib/labels';
import { cn, formatDateTime } from '@/lib/utils';
import { CategoryBadge, initials, PriorityBadge, relativeTime, type TicketRow } from './support-labels';

/** One inbox row: avatar, subject, user, badges, unread dot, last activity. */
export function TicketRowItem({ t, i, showStatus }: { t: TicketRow; i: number; showStatus?: boolean }) {
  return (
    <motion.li
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: Math.min(i, 12) * 0.03, ease: [0.16, 1, 0.3, 1] }}
    >
      <Link
        href={`/support/${t.id}`}
        className={cn(
          'group flex items-center gap-3.5 px-4 py-3.5 transition-colors hover:bg-surface-2 sm:px-5',
          t.unreadByAdmin && 'bg-accent-soft/40',
        )}
      >
        <span className="relative shrink-0">
          <span className="grid h-10 w-10 place-items-center rounded-full bg-surface-2 text-xs font-semibold text-muted">
            {initials(t.user.name)}
          </span>
          {t.unreadByAdmin ? (
            <span
              aria-label="Непрочитано"
              className="absolute -top-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-surface bg-gold"
            />
          ) : null}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className={cn('truncate text-sm', t.unreadByAdmin ? 'font-semibold text-heading' : 'font-medium text-ink')}>
              {t.subject}
            </span>
          </span>
          <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
            <span className="truncate">{t.user.name}</span>
            {t.user.role ? <span className="text-faint">· {ROLE_TEXT[t.user.role] ?? t.user.role}</span> : null}
            {t.assigneeName ? (
              <span className="inline-flex items-center gap-1 text-faint">
                <UserCircle size={13} weight="light" /> {t.assigneeName}
              </span>
            ) : null}
            <span className="flex gap-1 md:hidden">
              <CategoryBadge value={t.category} />
              <PriorityBadge value={t.priority} />
            </span>
          </span>
        </span>
        <span className="hidden shrink-0 items-center gap-1.5 md:flex">
          {showStatus ? <StatusPill map={TICKET_STATUS} value={t.status} /> : null}
          <CategoryBadge value={t.category} />
          <PriorityBadge value={t.priority} />
        </span>
        <span
          className={cn('w-24 shrink-0 text-right text-xs tabular-nums', t.unreadByAdmin ? 'text-gold-600' : 'text-faint')}
          title={formatDateTime(t.lastMessageAt)}
        >
          {relativeTime(t.lastMessageAt)}
        </span>
        <CaretRight size={14} className="shrink-0 text-faint transition-transform group-hover:translate-x-0.5 group-hover:text-gold-600" />
      </Link>
    </motion.li>
  );
}
