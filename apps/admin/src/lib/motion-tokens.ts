/**
 * One set of motion values for the admin (owner row 88, 2026-11-13; audit
 * D14: menus moved in 0.12 s here and 0.16 s there). New and touched code
 * takes its timing from here.
 * - `menu`: drop-downs and popovers, a short tween (Telegram Web A menus and
 *   modals: 0.2 s ease; ours stay at the shorter 0.12 s they already had).
 * - `sheet`: phone sheet and side menu snap-back, vaul's 0.5 s
 *   [0.32, 0.72, 0, 1] (MIT).
 * - the page crossfade is CSS (150 ms, globals.css `.admin-page`).
 */
export { SHEET_TRANSITION as sheet } from './drag-dismiss';
export const menu = { duration: 0.12 } as const;
