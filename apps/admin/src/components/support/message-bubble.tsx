'use client';

import { NotePencil } from '@phosphor-icons/react';
import { motion } from 'motion/react';
import { cn, formatDateTime } from '@/lib/utils';
import { initials, relativeTime, type TicketMessage } from './support-labels';

/**
 * Conversation bubble: the user on the left, support on the right in the
 * accent color, internal notes in a dashed warning style.
 */
export function MessageBubble({ m }: { m: TicketMessage }) {
  const mine = m.authorType === 'admin';
  return (
    <motion.div
      layout="position"
      initial={{ opacity: 0, y: 12, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      className={cn('flex items-end gap-2.5', mine ? 'flex-row-reverse' : 'flex-row')}
    >
      <span
        className={cn(
          'grid h-8 w-8 shrink-0 place-items-center rounded-full text-[11px] font-semibold',
          m.internal ? 'bg-warning-soft text-warning' : mine ? 'bg-accent-soft text-gold-600' : 'bg-surface-2 text-muted',
        )}
      >
        {m.internal ? <NotePencil size={15} weight="light" /> : initials(m.authorName)}
      </span>
      <div className={cn('flex max-w-[min(560px,85%)] flex-col', mine ? 'items-end' : 'items-start')}>
        <div className={cn('mb-1 flex items-center gap-2 px-1 text-[11px] text-faint', mine && 'flex-row-reverse')}>
          <span className="font-medium text-muted">{m.authorName}</span>
          <span title={formatDateTime(m.createdAt)}>{relativeTime(m.createdAt)}</span>
        </div>
        <div
          className={cn(
            'whitespace-pre-wrap break-words px-4 py-2.5 text-sm leading-relaxed',
            m.internal
              ? 'rounded-2xl border border-dashed border-warning/60 bg-warning-soft text-ink'
              : mine
                ? 'rounded-2xl rounded-br-md border border-gold/25 bg-accent-soft text-ink'
                : 'rounded-2xl rounded-bl-md border border-line bg-surface-2 text-ink',
          )}
        >
          {m.internal ? (
            <div className="mb-1 flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-warning">
              <NotePencil size={12} weight="bold" /> Внутренняя заметка
            </div>
          ) : null}
          {m.body}
        </div>
      </div>
    </motion.div>
  );
}
