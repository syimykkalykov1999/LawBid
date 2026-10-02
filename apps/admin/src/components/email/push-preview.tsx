'use client';

import { Bell } from '@phosphor-icons/react';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useState } from 'react';

function clock(): [string, string] {
  const now = new Date();
  return [
    new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit' }).format(now),
    new Intl.DateTimeFormat('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' }).format(now),
  ];
}

/** Lock-screen style phone mock with the push as it will look, plus the in-app row. */
export function PushPreview({ title, body }: { title: string; body: string }) {
  const [[time, date], setTime] = useState<[string, string]>(['', '']);
  useEffect(() => {
    setTime(clock());
    const t = window.setInterval(() => setTime(clock()), 30_000);
    return () => window.clearInterval(t);
  }, []);
  const empty = !title.trim() && !body.trim();
  return (
    <div className="mx-auto w-full max-w-[320px]">
      <div className="relative overflow-hidden rounded-[2.6rem] border-[6px] border-line-strong bg-gradient-to-b from-surface-2 via-canvas to-accent-soft p-3 pb-6 shadow-pop">
        {/* Dynamic island */}
        <div className="mx-auto mb-5 h-6 w-24 rounded-full bg-ink/90" />
        <div className="mb-6 text-center">
          <div className="text-[44px] leading-none font-light tracking-tight text-heading tabular-nums">{time || '9:41'}</div>
          <div className="mt-1 text-xs text-muted">
            {date || '\u00a0'}
          </div>
        </div>
        <AnimatePresence mode="wait" initial={false}>
          {empty ? (
            <motion.div
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="rounded-2xl border border-dashed border-line-strong px-4 py-6 text-center text-xs text-faint"
            >
              Начните писать — пуш появится здесь
            </motion.div>
          ) : (
            <motion.div
              key="push"
              initial={{ opacity: 0, y: -12, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
              className="rounded-2xl border border-line bg-elevated/90 p-3 shadow-card backdrop-blur-xl"
            >
              <div className="flex items-start gap-2.5">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] bg-gold font-serif text-base font-bold text-brand-navy">
                  L
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-[13px] font-semibold text-ink">{title.trim() || 'Заголовок'}</span>
                    <span className="shrink-0 text-[11px] text-faint">сейчас</span>
                  </div>
                  <p className="mt-0.5 line-clamp-4 text-[13px] leading-snug break-words whitespace-pre-line text-muted">
                    {body.trim() || 'Текст уведомления'}
                  </p>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        <div className="mx-auto mt-10 h-1 w-28 rounded-full bg-ink/40" />
      </div>
      {!empty ? (
        <div className="mt-4 rounded-2xl border border-line bg-surface p-3.5 shadow-card">
          <div className="mb-2 flex items-center gap-1.5 text-[11px] text-faint">
            <Bell size={12} weight="light" /> В приложении, раздел «Уведомления»
          </div>
          <div className="text-sm font-medium text-ink">{title.trim() || 'Заголовок'}</div>
          <p className="mt-0.5 text-xs leading-relaxed break-words whitespace-pre-line text-muted">{body.trim() || 'Текст уведомления'}</p>
        </div>
      ) : null}
    </div>
  );
}
