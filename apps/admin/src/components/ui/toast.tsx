'use client';

import { CheckCircle, Info, WarningCircle, X } from '@phosphor-icons/react';
import { AnimatePresence } from 'motion/react';
import * as m from 'motion/react-m';
import { createContext, useCallback, useContext, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { errorText } from '@/lib/api/client';

type Kind = 'success' | 'error' | 'info';
interface Toast {
  id: number;
  kind: Kind;
  text: string;
  /** Set just before removal when the user swiped it away. */
  swiped?: boolean;
}

const Ctx = createContext<{
  push: (kind: Kind, text: string) => void;
} | null>(null);

let seq = 0;

// Owner row 88 (2026-11-13), numbers copied from sonner (MIT, Copyright (c)
// 2023 Emil Kowalski; see THIRD_PARTY_NOTICES.md): a swipe of 45 px, or a
// quicker flick than 0.11 px/ms, dismisses the toast; the phone offset is
// 16 px above the bottom bar.
const SWIPE_THRESHOLD = 45;
const SWIPE_VELOCITY = 0.11;

/** Small corner notifications — every mutation reports success or failure. */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const push = useCallback((kind: Kind, text: string) => {
    const id = ++seq;
    setItems((t) => [...t.slice(-3), { id, kind, text }]);
  }, []);
  // Owner row 88 (2026-11-13), sonner (MIT): the countdown stops while the
  // pointer is over the toasts, while a finger is on one, and while the tab
  // is hidden, and goes on from where it stopped.
  const [expanded, setExpanded] = useState(false);
  const [interacting, setInteracting] = useState(false);
  const hidden = useDocumentHidden();
  const paused = expanded || interacting || hidden;
  // A toast closed under the pointer never sends mouseleave (sonner resets the
  // same way when the stack empties).
  useEffect(() => {
    if (items.length === 0) {
      setExpanded(false);
      setInteracting(false);
    }
  }, [items.length]);
  const close = useCallback((id: number) => setItems((t) => t.filter((x) => x.id !== id)), []);
  const swipe = useCallback((id: number) => {
    // First render the toast with its swipe exit, then remove it, so it leaves
    // the way the finger threw it (AnimatePresence keeps the last props).
    setItems((t) => t.map((x) => (x.id === id ? { ...x, swiped: true } : x)));
    window.setTimeout(() => setItems((t) => t.filter((x) => x.id !== id)), 0);
  }, []);
  return (
    <Ctx.Provider value={{ push }}>
      {children}
      {/* Phones: above the bottom bar (h-14 + safe area) with sonner's 16 px gap. */}
      <div
        aria-live="polite"
        className="pointer-events-none fixed right-4 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-[70] flex w-[min(380px,calc(100vw-2rem))] flex-col gap-2 lg:bottom-4"
      >
        <AnimatePresence initial={false}>
          {items.map((t) => (
            <ToastItem
              key={t.id}
              t={t}
              paused={paused}
              onClose={() => close(t.id)}
              onSwipe={() => swipe(t.id)}
              onHover={setExpanded}
              onInteract={setInteracting}
            />
          ))}
        </AnimatePresence>
      </div>
    </Ctx.Provider>
  );
}

function ToastItem({
  t,
  paused,
  onClose,
  onSwipe,
  onHover,
  onInteract,
}: {
  t: Toast;
  paused: boolean;
  onClose: () => void;
  onSwipe: () => void;
  onHover: (on: boolean) => void;
  onInteract: (on: boolean) => void;
}) {
  const Icon = t.kind === 'success' ? CheckCircle : t.kind === 'error' ? WarningCircle : Info;
  const started = useRef(0);
  useCountdown(t.kind === 'error' ? 7000 : 3800, paused, onClose);
  return (
    <m.div
      layout
      onMouseEnter={() => onHover(true)}
      onMouseMove={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
      onPointerDown={() => onInteract(true)}
      onPointerUp={() => onInteract(false)}
      onPointerCancel={() => onInteract(false)}
      drag="x"
      dragConstraints={{ left: 0, right: 0 }}
      dragElastic={{ left: 0.05, right: 1 }}
      dragSnapToOrigin
      onDragStart={() => {
        started.current = Date.now();
      }}
      onDragEnd={(_, info) => {
        const dx = info.offset.x;
        const ms = Math.max(1, Date.now() - started.current);
        if (dx >= SWIPE_THRESHOLD || (dx > 0 && dx / ms > SWIPE_VELOCITY)) onSwipe();
      }}
      initial={{ opacity: 0, y: 16, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      // One direction: it leaves the way it came (down), or sideways only
      // when it was swiped away.
      exit={t.swiped ? { opacity: 0, x: '110%', transition: { duration: 0.2 } } : { opacity: 0, y: 16, scale: 0.96, transition: { duration: 0.2 } }}
      transition={{ type: 'spring', stiffness: 420, damping: 32 }}
      className="pointer-events-auto flex items-start gap-3 rounded-2xl border border-line bg-elevated/95 px-4 py-3 text-sm shadow-pop backdrop-blur-xl"
    >
      <Icon size={20} weight="fill" className={t.kind === 'success' ? 'text-success' : t.kind === 'error' ? 'text-danger' : 'text-gold'} />
      <span className="flex-1 leading-snug text-ink">{t.text}</span>
      <button type="button" aria-label="Закрыть" className="text-faint hover:text-ink" onClick={onClose}>
        <X size={14} />
      </button>
    </m.div>
  );
}

/**
 * sonner's `startTimer` / `pauseTimer` (MIT, Copyright (c) 2023 Emil Kowalski;
 * see THIRD_PARTY_NOTICES.md): on pause the elapsed time is taken off the
 * remaining time, on resume a new timeout runs for what is left.
 */
function useCountdown(duration: number, paused: boolean, onDone: () => void) {
  const remainingTime = useRef(duration);
  const closeTimerStartTimeRef = useRef(0);
  const lastCloseTimerStartTimeRef = useRef(0);
  const done = useRef(onDone);
  useEffect(() => {
    done.current = onDone;
  });
  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    // Pause the timer on each hover
    const pauseTimer = () => {
      if (lastCloseTimerStartTimeRef.current < closeTimerStartTimeRef.current) {
        // Get the elapsed time since the timer started
        const elapsedTime = new Date().getTime() - closeTimerStartTimeRef.current;
        remainingTime.current = remainingTime.current - elapsedTime;
      }
      lastCloseTimerStartTimeRef.current = new Date().getTime();
    };
    const startTimer = () => {
      if (remainingTime.current === Infinity) return;
      closeTimerStartTimeRef.current = new Date().getTime();
      timeoutId = setTimeout(() => done.current(), remainingTime.current);
    };
    if (paused) pauseTimer();
    else startTimer();
    return () => clearTimeout(timeoutId);
  }, [paused]);
}

/** sonner's useIsDocumentHidden. */
function useDocumentHidden() {
  return useSyncExternalStore(
    (cb) => {
      document.addEventListener('visibilitychange', cb);
      return () => document.removeEventListener('visibilitychange', cb);
    },
    () => document.hidden,
    () => false,
  );
}

export function useToast() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useToast outside ToastProvider');
  return {
    success: (text: string) => v.push('success', text),
    info: (text: string) => v.push('info', text),
    error: (e: unknown) => v.push('error', typeof e === 'string' ? e : errorText(e)),
  };
}
