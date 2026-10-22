import { endAssistantSessions } from './end-assistant-sessions';

/** Owner 2026-10-22 (security audit #3, finding 6). */
describe('endAssistantSessions', () => {
  it('ends every session of the removed assistant', async () => {
    const revocation = {
      revokeAllChainsForUser: jest.fn().mockResolvedValue(['c1']),
    };
    await endAssistantSessions(revocation as never, 'asst-1');
    expect(revocation.revokeAllChainsForUser).toHaveBeenCalledWith(
      'asst-1',
      'assistant_removed',
    );
  });

  it('an invite nobody accepted has no sessions to end', async () => {
    const revocation = { revokeAllChainsForUser: jest.fn() };
    await endAssistantSessions(revocation as never, null);
    expect(revocation.revokeAllChainsForUser).not.toHaveBeenCalled();
  });
});
