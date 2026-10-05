import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { StateRegistryService } from '../../services/state-registry.service';
import type {
  BarLookupInput,
  BarLookupProvider,
  CheckOutcome,
} from '../verification-providers';

/**
 * Routes a lookup to the state's registry as configured in the admin
 * (owner 2026-10-05: per state, StateRegistryService). A state without an
 * enabled registry, or a registry error, never blocks the attorney — the
 * result is `manual_review` and a verifier checks by hand (§2.4).
 */
@Injectable()
export class AutoBarLookupProvider implements BarLookupProvider {
  readonly name = 'auto';

  constructor(
    private readonly registries: StateRegistryService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(AutoBarLookupProvider.name);
  }

  /** The state has an enabled automatic registry. */
  async supports(stateCode: string): Promise<boolean> {
    return (
      (await this.registries.resolve(stateCode).catch(() => null)) !== null
    );
  }

  async lookup(input: BarLookupInput): Promise<CheckOutcome> {
    let adapter = 'none';
    try {
      const registry = await this.registries.resolve(input.stateCode);
      if (!registry) {
        return {
          result: 'manual_review',
          details: {
            provider: 'none',
            stateCode: input.stateCode,
            reason: 'no_adapter_for_state',
          },
        };
      }
      adapter = registry.adapter;
      return await this.registries.lookup(input, registry);
    } catch (err) {
      this.logger.warn(
        { err, adapter, stateCode: input.stateCode },
        'State bar lookup failed — falling back to manual review',
      );
      return {
        result: 'manual_review',
        details: {
          provider: adapter,
          stateCode: input.stateCode,
          reason: 'provider_error',
          error: (err instanceof Error ? err.message : String(err)).slice(
            0,
            200,
          ),
        },
      };
    }
  }
}
