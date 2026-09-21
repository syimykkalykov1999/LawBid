import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { AccessTokenClaims } from '../services/token.service';

// Type alias, not `interface RequestUser extends AccessTokenClaims {}` —
// an empty-body interface extending another is flagged by
// @typescript-eslint/no-empty-object-type since it adds nothing over the
// supertype; this stays a distinct exported name for readability at call
// sites (CurrentUser() : RequestUser) without that redundancy.
export type RequestUser = AccessTokenClaims;

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): RequestUser => {
    const req = ctx
      .switchToHttp()
      .getRequest<Request & { user?: RequestUser }>();
    // JwtAuthGuard always sets req.user on any route it lets through
    // (public routes don't use this decorator) — a missing user here is a
    // wiring bug, not a runtime possibility worth a soft fallback.
    if (!req.user) {
      throw new Error('CurrentUser used on a route without JwtAuthGuard');
    }
    return req.user;
  },
);
