import { SetMetadata } from '@nestjs/common';

export const IS_OPTIONAL_AUTH_KEY = 'isOptionalAuth';
/**
 * Owner 2026-10-22 (guest browsing): a READ route anyone may open without
 * signing in. A valid token still signs the caller in as usual (an expired
 * one still answers TOKEN_EXPIRED, so the app refreshes); with no token the
 * request runs as the guest viewer (common/viewer/guest.ts) under a
 * stricter per-IP limit, and `guest.browsing_enabled` can switch it off.
 */
export const OptionalAuth = (): MethodDecorator & ClassDecorator =>
  SetMetadata(IS_OPTIONAL_AUTH_KEY, true);
