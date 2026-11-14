import { AuthService } from './auth.service';

/** R2-A #9 (14.11, Telegram «Terminate all other sessions»): «sign out of
 * other devices» ends every session of the account except the caller's;
 * «This wasn't me» still ends them all. */
describe('AuthService.logoutAll keeps the caller signed in', () => {
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

  it('ends the other chains only, and records it', async () => {
    const { service, revocation, authEvents } = make();
    await service.logoutAll({ sub: 'u1', sid: 'chain-1' } as never);
    expect(revocation.revokeOtherChainsForUser).toHaveBeenCalledWith(
      'u1',
      'chain-1',
      'logout_all',
    );
    expect(revocation.revokeAllChainsForUser).not.toHaveBeenCalled();
    expect(authEvents.record).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'u1', success: true }),
    );
  });
});
