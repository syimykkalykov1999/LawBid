import { Inject, Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import type {
  BarLookupInput,
  BarLookupProvider,
  CheckOutcome,
} from '../verification-providers';
import { STATE_BAR_ADAPTERS, type StateBarAdapter } from './state-bar-adapter';

/**
 * `auto_bar_check` on: routes the lookup to the state's adapter. A state
 * without an adapter, or an adapter error, never blocks the attorney —
 * the result is `manual_review` and a verifier checks by hand (§2.4).
 */
@Injectable()
export class AutoBarLookupProvider implements BarLookupProvider {
  readonly name = 'auto';

  constructor(
    @Inject(STATE_BAR_ADAPTERS)
    private readonly adapters: readonly StateBarAdapter[],
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(AutoBarLookupProvider.name);
  }

  adapterFor(stateCode: string): StateBarAdapter | undefined {
    return this.adapters.find((a) => a.states.includes(stateCode));
  }

  async lookup(input: BarLookupInput): Promise<CheckOutcome> {
    const adapter = this.adapterFor(input.stateCode);
    if (!adapter) {
      return {
        result: 'manual_review',
        details: {
          provider: 'none',
          stateCode: input.stateCode,
          reason: 'no_adapter_for_state',
        },
      };
    }
    try {
      return await adapter.lookup(input);
    } catch (err) {
      this.logger.warn(
        { err, adapter: adapter.name, stateCode: input.stateCode },
        'State bar lookup failed — falling back to manual review',
      );
      return {
        result: 'manual_review',
        details: {
          provider: adapter.name,
          stateCode: input.stateCode,
          reason: 'provider_error',
        },
      };
    }
  }
}
