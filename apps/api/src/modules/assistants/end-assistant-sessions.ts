import type { SessionRevocationService } from '../auth/auth.public';

/**
 * Owner 2026-10-22 (security audit #3, finding 6): removing an assistant
 * used to stop only the swap into the attorney's account (the cache). The
 * assistant's own tokens lived on, and an open socket kept receiving the
 * attorney's events until it reconnected. Now every session of the
 * assistant ends: blacklisted at once, and `session:revoked` drops the
 * live sockets on every API instance. The assistant can sign in again as
 * an ordinary account, without the attorney's data.
 */
export async function endAssistantSessions(
  revocation: SessionRevocationService | undefined,
  assistantUserId: string | null | undefined,
): Promise<void> {
  if (!revocation || !assistantUserId) return;
  await revocation.revokeAllChainsForUser(assistantUserId, 'assistant_removed');
}
