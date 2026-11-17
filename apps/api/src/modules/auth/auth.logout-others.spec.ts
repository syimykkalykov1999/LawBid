import { AuthService } from './auth.service';

/** R2-A #9 (14.11, Telegram «Terminate all other sessions»), expand/contract:
 * `logout-others` ends every session of the account except the caller's;
 * `logout-all` keeps its old meaning (all, this one included) for the apps
 * already in the stores. */
describe('AuthService logout-all / logout-others', () => {
  function make() {
    const service = Object.create(AuthService.prototype) as AuthService;
    const revocation = {
      revokeOtherChainsForUser: jest.fn().mockResolvedValue(['c2', 'c3']),
      revokeAllChainsForUser: jest.fn().mockResolvedValue(['c1', 'c2']),
    };
    const authEvents = { record: jest.fn().mockResolvedValue(undefined) };
    Object.assign(service, { revocation, authEvents });
    return { service, revocation, authEvents };
  }

  it('logout-others ends the other chains only, and records it', async () => {
    const { service, revocation, authEvents } = make();
    await service.logoutOthers({ sub: 'u1', sid: 'chain-1' } as never);
    expect(revocation.revokeOtherChainsForUser).toHaveBeenCalledWith(
      'u1',
      'chain-1',
      'logout_all',
    );
    expect(revocation.revokeAllChainsForUser).not.toHaveBeenCalled();
    expect(authEvents.record).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'u1',
        success: true,
        meta: expect.objectContaining({ scope: 'others' }),
      }),
    );
  });

  it('logout-all still ends every chain, the caller included', async () => {
    const { service, revocation } = make();
    await service.logoutAll({ sub: 'u1', sid: 'chain-1' } as never);
    expect(revocation.revokeAllChainsForUser).toHaveBeenCalledWith(
      'u1',
      'logout_all',
    );
    expect(revocation.revokeOtherChainsForUser).not.toHaveBeenCalled();
  });
});
