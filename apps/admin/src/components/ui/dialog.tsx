'use client';

import { X } from '@phosphor-icons/react';
import { AnimatePresence, useMotionValue, useTransform } from 'motion/react';
import * as m from 'motion/react-m';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useDragDismiss, useMediaQuery } from '@/lib/drag-dismiss';
import * as MOTION from '@/lib/motion-tokens';
import { useEscapeLayer } from '@/lib/layers';
import { lockScroll } from '@/lib/scroll-lock';
import { cn } from '@/lib/utils';
import { FocusScope } from '@/lib/vendor/focus-scope';

/** Phones: below Tailwind `sm`, where the dialog fills the screen. */
const PHONE = '(max-width: 639.98px)';

/**
 * Animated modal: blurred backdrop, spring panel, Esc / backdrop closes.
 *
 * Owner row 88 (2026-11-13), look unchanged:
 * - phones: the full-screen panel slides up from the bottom and can be pulled
 *   down to close, like an iOS / Instagram sheet (vaul's logic and curve, MIT,
 *   lib/drag-dismiss.ts);
 * - the page under it no longer jumps sideways when its scrollbar goes away
 *   (react-remove-scroll-bar, MIT, lib/scroll-lock.ts);
 * - Tab stays inside the dialog and focus returns to the button that opened
 *   it (Radix FocusScope, MIT, lib/vendor/focus-scope.tsx);
 * - Esc closes only the dialog on top (Radix DismissableLayer rule,
 *   lib/layers.ts).
 */
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
  useEscapeLayer(open, onClose);
  useEffect(() => {
    if (!open) return;
    return lockScroll();
  }, [open]);

  // Rendered in <body>: a dialog opened from inside the page header or a
  // transformed card would otherwise sit in that parent's stacking context
  // and show other sections (cases, bids…) on top of it.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  return createPortal(
    <AnimatePresence>
      {open ? (
        <Panel onClose={onClose} title={title} description={description} eyebrow={eyebrow} className={className} wide={wide}>
          {children}
        </Panel>
      ) : null}
    </AnimatePresence>,
    document.body,
  );
}

function Panel({
  onClose,
  title,
  description,
  eyebrow,
  children,
  className,
  wide,
}: {
  onClose: () => void;
  title?: React.ReactNode;
  description?: React.ReactNode;
  eyebrow?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  wide?: boolean;
}) {
  const phone = useMediaQuery(PHONE);
  // Sheet offset (px while dragged); the backdrop follows it (vaul fades the
  // overlay by the dragged share of the panel height).
  const y = useMotionValue<number | string>(0);
  const height = useRef(1);
  const dim = useTransform(y, (v) => (typeof v === 'number' ? Math.min(1, Math.max(0, 1 - v / height.current)) : 1));
  const drag = useDragDismiss({ offset: y, direction: 'bottom', enabled: phone, onClose });
  const panel = useRef<HTMLDivElement | null>(null);
  const { ref: dragRef } = drag;
  const setPanel = useCallback(
    (node: HTMLDivElement | null) => {
      panel.current = node;
      dragRef(node);
      if (node) height.current = node.getBoundingClientRect().height || 1;
    },
    [dragRef],
  );

  return (
    <m.div
      className="fixed inset-0 z-[60] flex items-stretch justify-center p-0 sm:items-center sm:p-6"
      // Phones: only the backdrop fades (on the sheet's clock); the sheet
      // itself slides and stays opaque, like vaul.
      initial={{ opacity: phone ? 1 : 0 }}
      animate={{ opacity: 1 }}
      exit={phone ? { opacity: 1, transition: MOTION.sheet } : { opacity: 0 }}
      transition={{ duration: 0.2 }}
    >
      <m.div
        className="absolute inset-0"
        initial={phone ? { opacity: 0 } : false}
        animate={{ opacity: 1 }}
        exit={phone ? { opacity: 0 } : undefined}
        transition={MOTION.sheet}
      >
        <m.div className="absolute inset-0 bg-[#05060a]/55 backdrop-blur-[6px]" style={phone ? { opacity: dim } : undefined} onClick={onClose} />
      </m.div>
      <FocusScope
        trapped
        loop
        onMountAutoFocus={(e) => {
          // The panel itself takes focus (no ring on the first field or the ✕);
          // the next Tab goes to the first control.
          e.preventDefault();
          panel.current?.focus({ preventScroll: true });
        }}
        className="contents"
      >
        <m.div
          role="dialog"
          aria-modal
          tabIndex={-1}
          ref={setPanel}
          {...drag.handlers}
          style={phone ? { y } : undefined}
          initial={phone ? { y: '100%' } : { opacity: 0, y: 24, scale: 0.97 }}
          animate={phone ? { y: 0 } : { opacity: 1, y: 0, scale: 1 }}
          exit={phone ? { y: '100%', transition: MOTION.sheet } : { opacity: 0, y: 16, scale: 0.98, transition: { duration: 0.15 } }}
          transition={phone ? MOTION.sheet : { type: 'spring', stiffness: 380, damping: 32 }}
          onAnimationStart={drag.markOpened}
          className={cn(
            'relative h-dvh w-full overflow-y-auto border-0 border-line bg-elevated p-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))] shadow-pop outline-none sm:h-auto sm:max-h-[92vh] sm:rounded-[var(--radius-xl)] sm:border sm:p-6',
            wide ? 'sm:max-w-2xl' : 'sm:max-w-md',
            className,
          )}
        >
          <button
            type="button"
            aria-label="Закрыть"
            onClick={onClose}
            className="absolute top-[max(0.75rem,env(safe-area-inset-top))] right-3 grid h-10 w-10 place-items-center rounded-full sm:top-4 sm:right-4 sm:h-auto sm:w-auto sm:p-1.5 text-faint transition-colors hover:bg-surface-2 hover:text-ink"
          >
            <X size={16} />
          </button>
          {eyebrow ? (
            <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-gold-600">{eyebrow}</div>
          ) : null}
          {title ? <h2 className="pr-8 font-serif text-xl font-semibold text-heading">{title}</h2> : null}
          {description ? <p className="mt-1.5 text-sm leading-relaxed text-muted">{description}</p> : null}
          <div className={title || description ? 'mt-5' : ''}>{children}</div>
        </m.div>
      </FocusScope>
    </m.div>
  );
}
