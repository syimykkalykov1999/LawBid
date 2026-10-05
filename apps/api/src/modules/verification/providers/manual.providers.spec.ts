import { HttpException, HttpStatus } from '@nestjs/common';
import type { PinoLogger } from 'nestjs-pino';
import type { CostGuardService } from '../../../common/cost-guard/cost-guard.service';
import { ErrorCode } from '../../../common/errors/error-code.enum';
import type { FeatureFlagsService } from '../../feature-flags/services/feature-flags.service';
import { AutoBarLookupProvider } from './bar-lookup/auto-bar-lookup.provider';
import type { ResolvedRegistry } from './bar-lookup/state-bar-adapter';
import type { StateRegistryService } from '../services/state-registry.service';
import type { CheckOutcome } from './verification-providers';
import {
  PersonaIdVerificationProvider,
  StripeIdentityProvider,
} from './id/paid-id-verification.providers';
import {
  ManualBarLookupProvider,
  ManualIdVerificationProvider,
} from './manual.providers';
import { VerificationProviderSelector } from './verification-provider.selector';

const INPUT = {
  stateCode: 'NY',
  barNumber: '123',
  firstName: 'Kim',
  lastName: 'Wexler',
};
const logger = {
  setContext: jest.fn(),
  warn: jest.fn(),
} as unknown as PinoLogger;

describe('manual verification providers (docs/03 §2.4)', () => {
  it('bar lookup always defers to a human verifier', async () => {
    const out = await new ManualBarLookupProvider().lookup();
    expect(out.result).toBe('manual_review');
  });

  it('ID check and face match always defer to a human verifier', async () => {
    const p = new ManualIdVerificationProvider();
    expect((await p.verify()).result).toBe('manual_review');
    expect((await p.matchFace()).result).toBe('manual_review');
  });
});

describe('AutoBarLookupProvider (per-state registries, owner 2026-10-05)', () => {
  const registry: ResolvedRegistry = {
    stateCode: 'NY',
    adapter: 'generic_rest',
    config: {},
    secret: null,
  };
  const build = (
    resolved: ResolvedRegistry | null,
    lookup: () => Promise<CheckOutcome> = () =>
      Promise.resolve({ result: 'pass', details: { provider: 'x' } }),
  ) =>
    new AutoBarLookupProvider(
      {
        resolve: jest.fn(() => Promise.resolve(resolved)),
        lookup: jest.fn(lookup),
      } as unknown as StateRegistryService,
      logger,
    );

  it("routes to the state's enabled registry", async () => {
    const provider = build(registry);
    expect(await provider.supports('NY')).toBe(true);
    expect((await provider.lookup(INPUT)).result).toBe('pass');
  });

  it('a state without a registry goes to manual review', async () => {
    const provider = build(null);
    expect(await provider.supports('NY')).toBe(false);
    const out = await provider.lookup(INPUT);
    expect(out).toEqual({
      result: 'manual_review',
      details: {
        provider: 'none',
        stateCode: 'NY',
        reason: 'no_adapter_for_state',
      },
    });
  });

  it('a registry error never blocks — manual review', async () => {
    const out = await build(registry, () =>
      Promise.reject(new Error('timeout')),
    ).lookup(INPUT);
    expect(out.result).toBe('manual_review');
    expect(out.details).toMatchObject({
      provider: 'generic_rest',
      reason: 'provider_error',
      error: 'timeout',
    });
  });
});

describe('paid identity providers (CostGuard id_check)', () => {
  it.each([
    ['stripe_identity', StripeIdentityProvider],
    ['persona', PersonaIdVerificationProvider],
  ] as const)(
    '%s reserves one id_check unit before verifying',
    async (name, Provider) => {
      const consume = jest.fn().mockResolvedValue(undefined);
      const p = new Provider({ consume } as unknown as CostGuardService);
      const out = await p.verify({ requestId: 'r', attorneyId: 'a' });
      expect(consume).toHaveBeenCalledWith('id_check');
      expect(out.details.provider).toBe(name);
      await p.matchFace({ requestId: 'r', attorneyId: 'a' });
      expect(consume).toHaveBeenCalledTimes(1);
    },
  );

  it('an exhausted budget propagates (caller records manual_review)', async () => {
    const err = new HttpException(
      { code: ErrorCode.PROVIDER_BUDGET_EXCEEDED },
      HttpStatus.SERVICE_UNAVAILABLE,
    );
    const p = new StripeIdentityProvider({
      consume: jest.fn().mockRejectedValue(err),
    } as unknown as CostGuardService);
    await expect(p.verify({ requestId: 'r', attorneyId: 'a' })).rejects.toBe(
      err,
    );
  });
});

describe('VerificationProviderSelector (feature flags)', () => {
  const build = (flags: Record<string, boolean>) => {
    const ff = {
      isEnabled: (key: string, def: boolean) =>
        Promise.resolve(flags[key] ?? def),
    } as unknown as FeatureFlagsService;
    const cost = { consume: jest.fn() } as unknown as CostGuardService;
    return new VerificationProviderSelector(
      ff,
      new AutoBarLookupProvider(
        {
          resolve: () => Promise.resolve(null),
        } as unknown as StateRegistryService,
        logger,
      ),
      new ManualIdVerificationProvider(),
      new StripeIdentityProvider(cost),
      new PersonaIdVerificationProvider(cost),
    );
  };

  it('all flags off → manual ID checks; bar lookups route per state', async () => {
    const s = build({});
    expect((await s.barLookup()).name).toBe('auto');
    expect((await s.idVerification()).provider).toBe('manual');
  });

  it('stripe_identity wins over persona; persona alone → persona', async () => {
    expect(
      (
        await build({
          stripe_identity: true,
          persona_verification: true,
        }).idVerification()
      ).provider,
    ).toBe('stripe_identity');
    expect(
      (await build({ persona_verification: true }).idVerification()).provider,
    ).toBe('persona');
  });
});
