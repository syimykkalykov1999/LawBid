'use client';

import { WarningCircle } from '@phosphor-icons/react';
import { motion } from 'motion/react';

export function PageHeader({
  title,
  subtitle,
  actions,
  eyebrow,
}: {
  title: string;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  eyebrow?: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      className="mb-7 flex flex-wrap items-end justify-between gap-4"
    >
      <div className="min-w-0">
        {eyebrow ? (
          <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.2em] text-gold-600">{eyebrow}</div>
        ) : null}
        <h1 className="font-serif text-[28px] leading-tight font-semibold tracking-tight text-heading sm:text-[32px]">{title}</h1>
        {subtitle ? <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-muted">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </motion.div>
  );
}

export function ErrorNote({ text }: { text: string | null | undefined }) {
  if (!text) return null;
  return (
    <motion.p
      role="alert"
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      className="my-3 flex items-start gap-2 rounded-xl border border-transparent bg-danger-soft px-3.5 py-2.5 text-sm text-danger"
    >
      <WarningCircle size={18} className="mt-px shrink-0" />
      <span>{text}</span>
    </motion.p>
  );
}

/** Section title inside a page. */
export function SectionTitle({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="mt-9 mb-3.5 flex items-center justify-between gap-3">
      <h2 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-faint">{children}</h2>
      {action}
    </div>
  );
}
