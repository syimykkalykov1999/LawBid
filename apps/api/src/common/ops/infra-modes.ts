/**
 * Owner 2026-11-11 («Масштаб»: Выкл / Вкл / Авто must really rule each cloud
 * item): the position the owner picked for the items the automation can
 * switch (infra-auto.logic). Auto = on when needed and off again when not;
 * On = kept on (the automation never switches it off, and switches it on
 * again if it is off); Off = never switched on by itself.
 *
 * The item → setting map is INFRA_MODE_KEYS in cost-registry.ts.
 */
export { INFRA_MODE_KEYS } from './cost-registry';
export type InfraMode = 'off' | 'on' | 'auto';

/** A stored value as a mode; anything unknown (or nothing) is Auto. */
export function infraMode(raw: unknown): InfraMode {
  const v = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  return v === 'off' || v === 'on' ? v : 'auto';
}
