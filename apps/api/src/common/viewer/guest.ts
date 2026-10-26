import type { RequestUser } from '../../modules/auth/decorators/current-user.decorator';

/**
 * Owner 2026-10-22 (guest browsing): the viewer of a request that came with
 * no token on a route marked `@OptionalAuth()`. A nil UUID: it matches no
 * row, so "blocked", "following", "liked" and "my privacy" all come out
 * empty and every viewer-dependent field is null / false, with the same
 * DTOs. Nothing can be written as the guest: write routes are never
 * optional, and the services that log or count per user skip a guest.
 */
export const GUEST_USER_ID = '00000000-0000-0000-0000-000000000000';

export function isGuestId(id: string | null | undefined): boolean {
  return id === GUEST_USER_ID;
}

export function guestUser(): RequestUser {
  return {
    sub: GUEST_USER_ID,
    role: null,
    sid: 'guest',
    verified: false,
    subscriptionStatus: 'none',
    guest: true,
  };
}
