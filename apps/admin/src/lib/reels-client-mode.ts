/**
 * Owner 2026-11-04 (R-398): client reels are ONE three-way choice in the
 * admin — Выключено / Бесплатно всем / Только с галочкой — stored as two
 * feature flags (`reels_client_publish` on/off and, while it is on,
 * `reels_client_publish_paid_only`). The server and the app read the flags;
 * the admin never shows the second flag on its own.
 */
export type ReelsClientMode = 'off' | 'free' | 'badge';

export const REELS_CLIENT_FLAG = 'reels_client_publish';
export const REELS_CLIENT_PAID_FLAG = 'reels_client_publish_paid_only';

export const REELS_CLIENT_MODES: { value: ReelsClientMode; label: string; hint: string }[] = [
  { value: 'off', label: 'Выключено', hint: 'Клиенты рилсы только смотрят; фото и брифы публикуют как обычно.' },
  { value: 'free', label: 'Бесплатно всем', hint: 'Любой клиент снимает и выкладывает рилсы.' },
  {
    value: 'badge',
    label: 'Только с галочкой',
    hint: 'Рилсы публикуют клиенты с оплаченной золотой галочкой; остальным приложение показывает «Видео — по подписке» и ведёт к оформлению галочки. В описании галочки появляется строка «Публикация рилсов».',
  },
];

/** The mode the two flags spell. */
export function reelsClientMode(flags: Record<string, boolean>): ReelsClientMode {
  if (!flags[REELS_CLIENT_FLAG]) return 'off';
  return flags[REELS_CLIENT_PAID_FLAG] ? 'badge' : 'free';
}

/** The flag writes that move [flags] to [mode] — only the ones that change. */
export function reelsClientModeWrites(
  mode: ReelsClientMode,
  flags: Record<string, boolean>,
): { key: string; enabled: boolean }[] {
  const want: Record<string, boolean> = {
    [REELS_CLIENT_FLAG]: mode !== 'off',
    [REELS_CLIENT_PAID_FLAG]: mode === 'badge',
  };
  // Turn the narrowing on BEFORE opening the gate (never a moment where
  // every client may publish on the way to «Только с галочкой»).
  const order = mode === 'badge' ? [REELS_CLIENT_PAID_FLAG, REELS_CLIENT_FLAG] : [REELS_CLIENT_FLAG, REELS_CLIENT_PAID_FLAG];
  return order.filter((k) => (flags[k] ?? false) !== want[k]).map((k) => ({ key: k, enabled: want[k] }));
}
