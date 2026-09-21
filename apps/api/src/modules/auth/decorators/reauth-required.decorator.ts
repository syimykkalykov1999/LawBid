import { SetMetadata } from '@nestjs/common';

export const REAUTH_REQUIRED_KEY = 'reauthRequired';
/** Marks a route as needing a fresh X-Reauth-Token header (docs/
 * 01_FOUNDATION_AUTH.md §10.1: sensitive actions need reauth in place of
 * the password this app never has) — checked by ReauthGuard. */
export const ReauthRequired = (): MethodDecorator =>
  SetMetadata(REAUTH_REQUIRED_KEY, true);
