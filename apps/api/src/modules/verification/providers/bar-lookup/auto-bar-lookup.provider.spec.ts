import type { PinoLogger } from 'nestjs-pino';
import type { StateRegistryService } from '../../services/state-registry.service';
import { AutoBarLookupProvider } from './auto-bar-lookup.provider';
import { RegistryGuardError } from './registry-guard';
import { RegistryRateLimitedError } from './registry-session';

/** Owner 2026-10-28: a registry problem never blocks the attorney. */
describe('AutoBarLookupProvider — errors → manual_review', () => {
  const logger = {
    setContext: jest.fn(),
    warn: jest.fn(),
  } as unknown as PinoLogger;
  const input = {
    stateCode: 'FL',
    barNumber: '1',
    firstName: 'A',
    lastName: 'B',
  };

  function provider(err: Error) {
    const registries = {
      resolve: jest.fn().mockResolvedValue({
        stateCode: 'FL',
        adapter: 'state_preset',
        config: {},
        secret: null,
      }),
      lookup: jest.fn().mockRejectedValue(err),
    } as unknown as StateRegistryService;
    return new AutoBarLookupProvider(registries, logger);
  }

  it.each([
    new RegistryGuardError('rate_limited', 'More than 4 lookups a minute'),
    new RegistryGuardError('circuit_open', 'paused'),
    new RegistryRateLimitedError(60),
    new Error('The registry did not answer in 8 s'),
  ])('%s', async (err) => {
    const out = await provider(err).lookup(input);
    expect(out.result).toBe('manual_review');
    expect(out.details).toMatchObject({
      provider: 'state_preset',
      stateCode: 'FL',
      reason: 'provider_error',
    });
  });
});

/** Feature reality audit 2026-11-08: the `auto_bar_check` flag is the
 * master of automatic lookups again (it was stored but not read). */
describe('AutoBarLookupProvider — master flag auto_bar_check', () => {
  const logger = {
    setContext: jest.fn(),
    warn: jest.fn(),
  } as unknown as PinoLogger;
  const input = {
    stateCode: 'NY',
    barNumber: '1',
    firstName: 'A',
    lastName: 'B',
  };
  const verified = { result: 'verified', details: { provider: 'ny' } };

  function provider(master: boolean | null) {
    const registries = {
      resolve: jest.fn().mockResolvedValue({
        stateCode: 'NY',
        adapter: 'ny_open_data',
        config: {},
        secret: null,
      }),
      lookup: jest.fn().mockResolvedValue(verified),
    };
    const flags =
      master === null
        ? undefined
        : { isEnabled: jest.fn().mockResolvedValue(master) };
    const p = new AutoBarLookupProvider(
      registries as unknown as StateRegistryService,
      logger,
      flags as never,
    );
    return { p, registries, flags };
  }

  it('on: the state registry is asked', async () => {
    const { p, registries, flags } = provider(true);
    await expect(p.supports('NY')).resolves.toBe(true);
    await expect(p.lookup(input)).resolves.toEqual(verified);
    expect(registries.lookup).toHaveBeenCalled();
    expect(flags!.isEnabled).toHaveBeenCalledWith('auto_bar_check', true);
  });

  it('off: no registry call, the licence goes to a verifier', async () => {
    const { p, registries } = provider(false);
    await expect(p.supports('NY')).resolves.toBe(false);
    await expect(p.lookup(input)).resolves.toMatchObject({
      result: 'manual_review',
      details: { reason: 'auto_bar_check_off' },
    });
    expect(registries.resolve).not.toHaveBeenCalled();
    expect(registries.lookup).not.toHaveBeenCalled();
  });

  it('no flags service (unit harness): behaves as on', async () => {
    const { p, registries } = provider(null);
    await p.lookup(input);
    expect(registries.lookup).toHaveBeenCalled();
  });
});
