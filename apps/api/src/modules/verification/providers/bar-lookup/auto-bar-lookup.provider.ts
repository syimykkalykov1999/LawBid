import { Injectable, Optional } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { FeatureFlagsService } from '../../../feature-flags/services/feature-flags.service';
import { StateRegistryService } from '../../services/state-registry.service';
import type {
  BarLookupInput,
  BarLookupProvider,
  CheckOutcome,
} from '../verification-providers';

/** Master switch of automatic lookups (admin «Флаги»); a missing row
 * counts as on, the per-state registry settings decide then. */
export const AUTO_BAR_CHECK_FLAG = 'auto_bar_check';

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
    @Optional() private readonly flags?: FeatureFlagsService,
  ) {
    this.logger.setContext(AutoBarLookupProvider.name);
  }

  /** Feature reality audit 2026-11-08: the `auto_bar_check` flag is the
   * master again (it was stored but not read). */
  private async masterOn(): Promise<boolean> {
    if (!this.flags) return true;
    return this.flags.isEnabled(AUTO_BAR_CHECK_FLAG, true).catch(() => true);
  }

  /** The state has an enabled automatic registry. */
  async supports(stateCode: string): Promise<boolean> {
    if (!(await this.masterOn())) return false;
    return (
      (await this.registries.resolve(stateCode).catch(() => null)) !== null
    );
  }

  async lookup(input: BarLookupInput): Promise<CheckOutcome> {
    let adapter = 'none';
    if (!(await this.masterOn())) {
      return {
        result: 'manual_review',
        details: {
          provider: 'none',
          stateCode: input.stateCode,
          reason: 'auto_bar_check_off',
        },
      };
    }
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
