/**
 * Verify batch 11 (C4): a counter that moves on every admin settings write
 * in this process (AppConfigService's clearAppConfigMemo bumps it). Readers
 * that keep a copy derived from app_config (the staff switches) drop it
 * when the number changes, so a save applies at once on this instance.
 * Lives in common so a module needs no import from feature-flags.
 */
let generation = 0;

export function bumpConfigMemoGeneration(): void {
  generation += 1;
}

export function configMemoGeneration(): number {
  return generation;
}
