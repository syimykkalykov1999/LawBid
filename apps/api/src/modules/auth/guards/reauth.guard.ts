import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { REAUTH_REQUIRED_KEY } from '../decorators/reauth-required.decorator';
import { ReauthVerifier } from '../services/reauth-verifier.service';
import type { RequestUser } from '../decorators/current-user.decorator';

/** Enforces a fresh single-use reauth token on routes marked
 * @ReauthRequired() (docs/01 §10.1). Validation lives in ReauthVerifier. */
@Injectable()
export class ReauthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly verifier: ReauthVerifier,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<boolean>(
      REAUTH_REQUIRED_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!required) return true;
    await this.verifier.assertAndConsume(
      context.switchToHttp().getRequest<Request & { user?: RequestUser }>(),
    );
    return true;
  }
}
