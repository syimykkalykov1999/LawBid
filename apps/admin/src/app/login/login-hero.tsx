'use client';

import { motion } from 'motion/react';
import { LogoMark } from '@/components/shell/logo';

const LINES = ['Верификация адвокатов', 'Модерация и поддержка', 'Подписки, промокоды, рефералы', 'Ключи сервисов и функции'];

/** Dark brand panel from the website: grid lines, gold glow, serif headline. */
export function LoginHero() {
  return (
    <aside className="relative hidden overflow-hidden bg-[#0b0b0d] text-ivory lg:flex lg:flex-col lg:justify-between lg:p-12">
      <div
        aria-hidden
        className="absolute inset-0 [background-image:linear-gradient(to_right,rgb(255_255_255/0.045)_1px,transparent_1px),linear-gradient(to_bottom,rgb(255_255_255/0.045)_1px,transparent_1px)] [background-size:56px_56px] [mask-image:radial-gradient(ellipse_70%_60%_at_40%_40%,black_30%,transparent_75%)]"
      />
      <motion.div
        aria-hidden
        className="absolute -top-32 -left-24 h-[520px] w-[520px] rounded-full bg-[#c9a24a]/20 blur-[120px]"
        animate={{ x: [0, 40, 0], y: [0, 30, 0] }}
        transition={{ duration: 14, repeat: Infinity, ease: 'easeInOut' }}
      />
      <div aria-hidden className="absolute right-0 bottom-0 h-[420px] w-[420px] rounded-full bg-[#0a1a3f]/80 blur-[100px]" />

      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
        className="relative flex items-center gap-3"
      >
        <LogoMark className="h-9 w-9" />
        <span className="text-lg font-semibold tracking-tight">
          Law<span className="text-[#c9a24a]">Bid</span>
          <span className="ml-2 text-xs font-medium uppercase tracking-[0.22em] text-[#9a9aa6]">Admin</span>
        </span>
      </motion.div>

      <div className="relative">
        <motion.h2
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
          className="max-w-lg font-serif text-5xl leading-[1.05] font-semibold tracking-tight"
        >
          Всё приложение — <span className="text-gold-gradient italic">в одном месте</span>
        </motion.h2>
        <ul className="mt-8 space-y-3">
          {LINES.map((l, i) => (
            <motion.li
              key={l}
              initial={{ opacity: 0, x: -16 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.6, delay: 0.35 + i * 0.08, ease: [0.16, 1, 0.3, 1] }}
              className="flex items-center gap-3 text-[15px] text-[#c9c6bb]"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-[#c9a24a] shadow-[0_0_12px_#c9a24a]" />
              {l}
            </motion.li>
          ))}
        </ul>
      </div>
      <div className="relative text-xs text-[#6b6b76]">© LawBid</div>
    </aside>
  );
}
