import { ErrorCode } from '../../../common/errors/error-code.enum';
import type { FeatureFlagsService } from '../../feature-flags/services/feature-flags.service';
import { LoginMethodPolicy } from './login-method-policy.service';

describe('LoginMethodPolicy.assertPlatformAllowed', () => {
  const policy = (enabled: boolean) => {
    const isEnabled = jest.fn().mockResolvedValue(enabled);
    return {
      isEnabled,
      p: new LoginMethodPolicy({ isEnabled } as unknown as FeatureFlagsService),
    };
  };

  it('ignores non-web platforms without reading the flag', async () => {
    const { p, isEnabled } = policy(false);
    await expect(p.assertPlatformAllowed('ios')).resolves.toBeUndefined();
    await expect(p.assertPlatformAllowed(undefined)).resolves.toBeUndefined();
    expect(isEnabled).not.toHaveBeenCalled();
  });

  it('refuses web with FEATURE_DISABLED once web_client is switched off', async () => {
    const { p, isEnabled } = policy(false);
    await expect(p.assertPlatformAllowed('web')).rejects.toMatchObject({
      response: { code: ErrorCode.FEATURE_DISABLED },
    });
    expect(isEnabled).toHaveBeenCalledWith('web_client', true);
  });

  it('allows web once web_client is on', async () => {
    const { p } = policy(true);
    await expect(p.assertPlatformAllowed('web')).resolves.toBeUndefined();
  });
});
