'use client';

import { X } from '@phosphor-icons/react';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';

/** Animated modal: blurred backdrop, spring panel, Esc / backdrop closes. */
export function Dialog({
  open,
  onClose,
  title,
  description,
  eyebrow,
  children,
  className,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  description?: React.ReactNode;
  eyebrow?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  wide?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  // Rendered in <body>: a dialog opened from inside the page header or a
  // transformed card would otherwise sit in that parent's stacking context
  // and show other sections (cases, bids…) on top of it.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  return createPortal(
    <AnimatePresence>
      {open ? (
        <motion.div
          className="fixed inset-0 z-[60] flex items-end justify-center p-0 sm:items-center sm:p-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          <div className="absolute inset-0 bg-[#05060a]/55 backdrop-blur-[6px]" onClick={onClose} />
          <motion.div
            role="dialog"
            aria-modal
            initial={{ opacity: 0, y: 24, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.98, transition: { duration: 0.15 } }}
            transition={{ type: 'spring', stiffness: 380, damping: 32 }}
            className={cn(
              'relative max-h-[92vh] w-full overflow-y-auto rounded-t-[var(--radius-xl)] border border-line bg-elevated p-6 shadow-pop sm:rounded-[var(--radius-xl)]',
              wide ? 'sm:max-w-2xl' : 'sm:max-w-md',
              className,
            )}
          >
            <button
              type="button"
              aria-label="Закрыть"
              onClick={onClose}
              className="absolute top-4 right-4 rounded-full p-1.5 text-faint transition-colors hover:bg-surface-2 hover:text-ink"
            >
              <X size={16} />
            </button>
            {eyebrow ? (
              <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-gold-600">{eyebrow}</div>
            ) : null}
            {title ? <h2 className="pr-8 font-serif text-xl font-semibold text-heading">{title}</h2> : null}
            {description ? <p className="mt-1.5 text-sm leading-relaxed text-muted">{description}</p> : null}
            <div className={title || description ? 'mt-5' : ''}>{children}</div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>,
    document.body,
  );
}
