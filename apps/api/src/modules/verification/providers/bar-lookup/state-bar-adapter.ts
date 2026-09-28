import type { BarLookupInput, CheckOutcome } from '../verification-providers';

/**
 * One State Bar public database (docs/03 §2.4 `bar_lookup`: "адаптеры по
 * штатам, где есть публичная база"). An adapter declares the states it
 * serves; AutoBarLookupProvider routes by state code and falls back to
 * manual review for states without an adapter. To add a state: implement
 * this interface and append the class to STATE_BAR_ADAPTER_CLASSES.
 *
 * Result details (§2.4): found/not found, license status
 * (active/inactive), name, admission date, source URL — stored in
 * `attorney_licenses.auto_check_result`.
 */
export interface StateBarAdapter {
  readonly name: string;
  readonly states: readonly string[];
  lookup(input: BarLookupInput): Promise<CheckOutcome>;
}

export interface BarLookupDetails {
  provider: string;
  found: boolean;
  licenseStatus: 'active' | 'inactive' | null;
  name: string | null;
  admittedAt: string | null;
  sourceUrl: string | null;
}

export const STATE_BAR_ADAPTERS = Symbol('STATE_BAR_ADAPTERS');
