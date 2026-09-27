/* eslint-disable @typescript-eslint/unbound-method -- jest.fn() members are
   only asserted on (toHaveBeenCalled...), never invoked unbound. */
import { ExecutionContext } from '@nestjs/common';
import type { FeatureFlagsService } from '../../feature-flags/services/feature-flags.service';
import type { AttestationVerifier } from './attestation-verifier.interface';
import { DeviceAttestationGuard } from './device-attestation.guard';
import { DeviceAttestationService } from './device-attestation.service';
import { UnconfiguredAttestationVerifier } from './unconfigured-attestation.verifier';

function flags(enabled: boolean | undefined): FeatureFlagsService {
  return {
    isEnabled: jest.fn((_key: string, def: boolean) =>
      Promise.resolve(enabled ?? def),
    ),
  } as unknown as FeatureFlagsService;
}

const acceptGood = (platform: 'ios' | 'android'): AttestationVerifier => ({
  platform,
  verify: jest.fn((e) =>
    Promise.resolve(
      e.token === 'good' ? { valid: true } : { valid: false, reason: 'bad' },
    ),
  ),
});

function ctx(headers: Record<string, string>): ExecutionContext {
  const lower = Object.fromEntries(
    Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]),
  );
  return {
    switchToHttp: () => ({
      getRequest: () => ({
        method: 'POST',
        originalUrl: '/api/v1/auth/otp/request?x=1',
        header: (name: string) => lower[name.toLowerCase()],
      }),
    }),
  } as unknown as ExecutionContext;
}

describe('DeviceAttestationService', () => {
  it('is not required when the flag row is missing (default off)', async () => {
    const svc = new DeviceAttestationService(
      flags(undefined),
      acceptGood('ios'),
      acceptGood('android'),
    );
    await expect(svc.isRequired()).resolves.toBe(false);
  });

  it('dispatches by platform and binds the request', async () => {
    const ios = acceptGood('ios');
    const android = acceptGood('android');
    const svc = new DeviceAttestationService(flags(true), ios, android);
    await expect(
      svc.verify({ platform: 'Android', token: 'good', requestBinding: 'b' }),
    ).resolves.toEqual({ valid: true });
    expect(android.verify).toHaveBeenCalledWith(
      expect.objectContaining({ platform: 'android', requestBinding: 'b' }),
    );
    expect(ios.verify).not.toHaveBeenCalled();
  });

  it.each([
    [{ platform: 'web', token: 'good' }, 'unsupported_platform'],
    [{ platform: 'ios' }, 'missing_token'],
    [{ platform: 'ios', token: 'x'.repeat(20_000) }, 'malformed_token'],
  ])('rejects %j (%s)', async (input, reason) => {
    const svc = new DeviceAttestationService(
      flags(true),
      acceptGood('ios'),
      acceptGood('android'),
    );
    await expect(
      svc.verify({ ...input, requestBinding: 'b' }),
    ).resolves.toEqual({ valid: false, reason });
  });

  it('fails closed when a verifier throws', async () => {
    const broken: AttestationVerifier = {
      platform: 'ios',
      verify: () => Promise.reject(new Error('provider down')),
    };
    const svc = new DeviceAttestationService(
      flags(true),
      broken,
      acceptGood('android'),
    );
    await expect(
      svc.verify({ platform: 'ios', token: 'good', requestBinding: 'b' }),
    ).resolves.toEqual({ valid: false, reason: 'verifier_error' });
  });

  it('the placeholder verifiers reject every token', async () => {
    for (const p of ['ios', 'android'] as const) {
      await expect(
        new UnconfiguredAttestationVerifier(p).verify({
          platform: p,
          token: 'anything',
          requestBinding: 'b',
        }),
      ).resolves.toEqual({ valid: false, reason: 'verifier_not_configured' });
    }
  });
});

describe('DeviceAttestationGuard', () => {
  it('lets everything through while the flag is off', async () => {
    const guard = new DeviceAttestationGuard(
      new DeviceAttestationService(
        flags(false),
        acceptGood('ios'),
        acceptGood('android'),
      ),
    );
    await expect(guard.canActivate(ctx({}))).resolves.toBe(true);
  });

  it('with the flag on: 403 DEVICE_ATTESTATION_REQUIRED without a valid token, pass with one', async () => {
    const ios = acceptGood('ios');
    const guard = new DeviceAttestationGuard(
      new DeviceAttestationService(flags(true), ios, acceptGood('android')),
    );
    await expect(
      guard.canActivate(ctx({ 'X-Platform': 'ios' })),
    ).rejects.toMatchObject({
      status: 403,
      response: expect.objectContaining({
        code: 'DEVICE_ATTESTATION_REQUIRED',
      }),
    });
    await expect(
      guard.canActivate(
        ctx({ 'X-Platform': 'ios', 'X-Device-Attestation': 'good' }),
      ),
    ).resolves.toBe(true);
    expect(ios.verify).toHaveBeenLastCalledWith(
      expect.objectContaining({
        requestBinding: 'POST /api/v1/auth/otp/request',
      }),
    );
  });
});
