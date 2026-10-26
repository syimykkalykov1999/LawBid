'use client';

import { CheckCircle, Info, WarningCircle, X } from '@phosphor-icons/react';
import { AnimatePresence, motion } from 'motion/react';
import { createContext, useCallback, useContext, useState } from 'react';
import { errorText } from '@/lib/api/client';

type Kind = 'success' | 'error' | 'info';
interface Toast {
  id: number;
  kind: Kind;
  text: string;
}

const Ctx = createContext<{
  push: (kind: Kind, text: string) => void;
} | null>(null);

let seq = 0;

/** Small corner notifications — every mutation reports success or failure. */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const push = useCallback((kind: Kind, text: string) => {
    const id = ++seq;
    setItems((t) => [...t.slice(-3), { id, kind, text }]);
    window.setTimeout(() => setItems((t) => t.filter((x) => x.id !== id)), kind === 'error' ? 7000 : 3800);
  }, []);
  return (
    <Ctx.Provider value={{ push }}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed right-4 bottom-4 z-[70] flex w-[min(380px,calc(100vw-2rem))] flex-col gap-2">
        <AnimatePresence initial={false}>
          {items.map((t) => {
            const Icon = t.kind === 'success' ? CheckCircle : t.kind === 'error' ? WarningCircle : Info;
            return (
              <motion.div
                key={t.id}
                layout
                initial={{ opacity: 0, y: 16, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, x: 40, transition: { duration: 0.2 } }}
                transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                className="pointer-events-auto flex items-start gap-3 rounded-2xl border border-line bg-elevated/95 px-4 py-3 text-sm shadow-pop backdrop-blur-xl"
              >
                <Icon
                  size={20}
                  weight="fill"
                  className={t.kind === 'success' ? 'text-success' : t.kind === 'error' ? 'text-danger' : 'text-gold'}
                />
                <span className="flex-1 leading-snug text-ink">{t.text}</span>
                <button
                  type="button"
                  aria-label="Закрыть"
                  className="text-faint hover:text-ink"
                  onClick={() => setItems((x) => x.filter((i) => i.id !== t.id))}
                >
                  <X size={14} />
                </button>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </Ctx.Provider>
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
