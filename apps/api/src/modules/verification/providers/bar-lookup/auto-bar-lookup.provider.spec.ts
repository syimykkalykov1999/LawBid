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
