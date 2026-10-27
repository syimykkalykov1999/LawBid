/**
 * Owner rule (2026-10-25): everything that sits in the code and creates
 * charges, load or slowness while it runs gets a 3-state admin control:
 * Выкл / Вкл / Авто. The default is Авто, which follows a real signal and
 * stays under a ceiling. This is the shared reading of such a setting.
 */
export type TriMode = 'off' | 'on' | 'auto';

/** For the admin config schema (`pattern`). */
export const TRI_MODE_PATTERN = /^(off|on|auto)$/;

/** An unknown or missing value counts as Авто (the safe default). */
export function triMode(value: unknown): TriMode {
  return value === 'off' || value === 'on' || value === 'auto' ? value : 'auto';
}
