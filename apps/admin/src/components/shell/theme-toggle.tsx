'use client';

import { Desktop, MoonStars, Sun } from '@phosphor-icons/react';
import { AnimatePresence, motion } from 'motion/react';
import { useTheme, type ThemePref } from '@/lib/theme';
import { cn } from '@/lib/utils';

/** One-tap day/night switch with a rotating sun/moon. */
export function ThemeToggle() {
  const { resolved, toggle } = useTheme();
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={resolved === 'dark' ? 'Дневная тема' : 'Ночная тема'}
      title={resolved === 'dark' ? 'Дневная тема' : 'Ночная тема'}
      className="relative grid h-9 w-9 place-items-center overflow-hidden rounded-xl border border-line bg-surface text-muted transition-colors hover:border-gold/50 hover:text-ink"
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={resolved}
          initial={{ y: 14, rotate: -90, opacity: 0 }}
          animate={{ y: 0, rotate: 0, opacity: 1 }}
          exit={{ y: -14, rotate: 90, opacity: 0 }}
          transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
        >
          {resolved === 'dark' ? <MoonStars size={18} weight="light" /> : <Sun size={18} weight="light" />}
        </motion.span>
      </AnimatePresence>
    </button>
  );
}

const OPTIONS: { value: ThemePref; label: string; icon: React.ReactNode }[] = [
  { value: 'light', label: 'День', icon: <Sun size={15} /> },
  { value: 'dark', label: 'Ночь', icon: <MoonStars size={15} /> },
  { value: 'system', label: 'Как в системе', icon: <Desktop size={15} /> },
];

export function ThemeChoice() {
  const { pref, setPref } = useTheme();
  return (
    <div className="grid grid-cols-3 gap-1 rounded-xl bg-surface-2 p-1">
      {OPTIONS.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => setPref(o.value)}
          className={cn(
            'flex flex-col items-center gap-1 rounded-lg px-2 py-1.5 text-[11px] transition-colors',
            pref === o.value ? 'bg-surface text-ink shadow-card' : 'text-muted hover:text-ink',
          )}
        >
          {o.icon}
          {o.label}
        </button>
      ))}
    </div>
  );
}
