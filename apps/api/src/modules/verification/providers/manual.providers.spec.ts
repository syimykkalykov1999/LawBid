import { HttpException, HttpStatus } from '@nestjs/common';
import type { PinoLogger } from 'nestjs-pino';
import type { CostGuardService } from '../../../common/cost-guard/cost-guard.service';
import { ErrorCode } from '../../../common/errors/error-code.enum';
import type { FeatureFlagsService } from '../../feature-flags/services/feature-flags.service';
import { AutoBarLookupProvider } from './bar-lookup/auto-bar-lookup.provider';
import type { StateBarAdapter } from './bar-lookup/state-bar-adapter';
import { StubStateBarAdapter } from './bar-lookup/stub-state-bar.adapter';
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

describe('AutoBarLookupProvider (state adapters)', () => {
  it('routes by state to the adapter serving it', async () => {
    const provider = new AutoBarLookupProvider(
      [new StubStateBarAdapter(['CA', 'NY'])],
      logger,
    );
    const out = await provider.lookup(INPUT);
    expect(out.result).toBe('manual_review');
    expect(out.details).toMatchObject({
      provider: 'stub_state_bar',
      stateCode: 'NY',
      reason: 'adapter_not_implemented',
    });
  });

  it('a state without an adapter goes to manual review', async () => {
    const provider = new AutoBarLookupProvider([], logger);
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

  it('an adapter error never blocks — manual review', async () => {
    const broken: StateBarAdapter = {
      name: 'ny_bar',
      states: ['NY'],
      lookup: () => Promise.reject(new Error('timeout')),
    };
    const out = await new AutoBarLookupProvider([broken], logger).lookup(INPUT);
    expect(out.result).toBe('manual_review');
    expect(out.details.reason).toBe('provider_error');
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
      new ManualBarLookupProvider(),
      new AutoBarLookupProvider([], logger),
      new ManualIdVerificationProvider(),
      new StripeIdentityProvider(cost),
      new PersonaIdVerificationProvider(cost),
    );
  };

  it('all flags off → manual everywhere', async () => {
    const s = build({});
    expect((await s.barLookup()).name).toBe('manual');
    expect((await s.idVerification()).provider).toBe('manual');
  });

  it('auto_bar_check → state adapters', async () => {
    expect((await build({ auto_bar_check: true }).barLookup()).name).toBe(
      'auto',
    );
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
