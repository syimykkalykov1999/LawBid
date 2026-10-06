import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UseGuards,
  applyDecorators,
} from '@nestjs/common';
import type { Request } from 'express';
import { LegalAcceptanceService } from './legal-acceptance.service';

/** Blocks a key action (publish a case, place a bid) with
 * LEGAL_REACCEPT_REQUIRED until the user has accepted the current legal
 * documents of their role. Everything else in the app keeps working. */
@Injectable()
export class LegalAcceptedGuard implements CanActivate {
  constructor(private readonly acceptance: LegalAcceptanceService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx
      .switchToHttp()
      .getRequest<Request & { user?: { sub?: string; assistant?: unknown } }>();
    // An assistant acts inside the attorney's account and cannot accept
    // for them.
    if (req.user?.assistant) return true;
    const userId = req.user?.sub;
    if (userId) await this.acceptance.assertAccepted(userId);
    return true;
  }
}

export const RequireLegalAcceptance = (): MethodDecorator =>
  applyDecorators(UseGuards(LegalAcceptedGuard));
