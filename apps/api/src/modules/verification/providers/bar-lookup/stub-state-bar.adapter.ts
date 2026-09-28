import type { BarLookupInput, CheckOutcome } from '../verification-providers';
import type { StateBarAdapter } from './state-bar-adapter';

/**
 * Template/stub state adapter: answers `manual_review` without any
 * network call. Real adapters (one per state database) replace it —
 * TODO(docs/03_VERIFICATION_PROFILES.md §2.4, stage 3.4 follow-up): pick
 * the states with a public bar database and implement their lookups;
 * none is registered in production until then.
 */
export class StubStateBarAdapter implements StateBarAdapter {
  readonly name = 'stub_state_bar';

  constructor(readonly states: readonly string[]) {}

  lookup(input: BarLookupInput): Promise<CheckOutcome> {
    return Promise.resolve({
      result: 'manual_review',
      details: {
        provider: this.name,
        stateCode: input.stateCode,
        reason: 'adapter_not_implemented',
      },
    });
  }
}
