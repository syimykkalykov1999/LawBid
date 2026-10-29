import { ForbiddenException } from '@nestjs/common';
import { AuthService } from './auth.service';

/** Owner 2026-10-28: POST /auth/identifiers sits behind the admin switch
 * `auth.additional_identifiers_enabled` (default OFF). */
function make(settings?: { boolean: jest.Mock }) {
  const none = {} as never;
  const identity = { linkIdentifier: jest.fn() };
  const service = new AuthService(
    none,
    none,
    none,
    identity as never,
    none,
    none,
    none,
    none,
    none,
    none,
    none,
    none,
    none,
    none,
    none,
    none,
    undefined,
    settings as never,
  );
  return { service, identity };
}

const dto = {
  provider: 'phone',
  identifier: '+15550100001',
  code: '000000',
} as never;
const user = { sub: 'u1', sid: 's1' } as never;

describe('AuthService.linkIdentifier behind auth.additional_identifiers_enabled', () => {
  it('switch off: 403 FEATURE_DISABLED, nothing is linked', async () => {
    const settings = { boolean: jest.fn().mockResolvedValue(false) };
    const { service, identity } = make(settings);
    const err: unknown = await service
      .linkIdentifier(dto, user)
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ForbiddenException);
    expect((err as ForbiddenException).getResponse()).toMatchObject({
      code: 'FEATURE_DISABLED',
    });
    expect(settings.boolean).toHaveBeenCalledWith(
      'auth.additional_identifiers_enabled',
    );
    expect(identity.linkIdentifier).not.toHaveBeenCalled();
  });

  it('no settings service: treated as off', async () => {
    const { service } = make(undefined);
    await expect(service.linkIdentifier(dto, user)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
});
