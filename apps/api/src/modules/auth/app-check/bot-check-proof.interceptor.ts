import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
  Optional,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { type Observable, tap } from 'rxjs';
import {
  BotCheckStatsService,
  type BotCheckGroup,
} from '../../../common/security/bot-check-stats';
import {
  BOT_CHECK_REQ_KEY,
  type BotCheckVerdictOnRequest,
} from './app-check.guard';

export const BOT_CHECK_PROOF_KEY = 'bot-check:proof';

export interface BotCheckProofOptions {
  /** Count this request's own verdict (the guard put it on the request):
   * a right password / code / Google token proves a real person. */
  self?: boolean;
  /** Count the verdict the code / reset REQUEST of these groups left for
   * the same `identifier` (the person typed the code that came by SMS). */
  pending?: BotCheckGroup[];
}

/**
 * Item 13 (L2, 2026-11-25): marks a route whose success proves a real person
 * (the step a script cannot do). After a 2xx answer the
 * BotCheckProofInterceptor counts what the bot check said about that person
 * into the proven-real pass rate that «Авто» and the admin launch page read.
 */
export const BotCheckProof = (options: BotCheckProofOptions) =>
  SetMetadata(BOT_CHECK_PROOF_KEY, options);

@Injectable()
export class BotCheckProofInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    @Optional() private readonly stats?: BotCheckStatsService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const options = this.reflector.getAllAndOverride<
      BotCheckProofOptions | undefined
    >(BOT_CHECK_PROOF_KEY, [context.getHandler(), context.getClass()]);
    if (!options || !this.stats || context.getType() !== 'http') {
      return next.handle();
    }
    const req = context.switchToHttp().getRequest<Request>();
    return next.handle().pipe(
      tap({
        next: () => {
          // Fire and forget: counting never delays or breaks the answer.
          void this.count(req, options);
        },
      }),
    );
  }

  private async count(
    req: Request,
    options: BotCheckProofOptions,
  ): Promise<void> {
    const stats = this.stats!;
    try {
      if (options.self) {
        const own = (req as unknown as Record<string, unknown>)[
          BOT_CHECK_REQ_KEY
        ] as BotCheckVerdictOnRequest | undefined;
        if (own) await stats.record(own.group, own);
      }
      const body = req.body as unknown;
      const id =
        typeof body === 'object' && body !== null
          ? (body as { identifier?: unknown }).identifier
          : undefined;
      if (typeof id !== 'string' || id.length === 0 || id.length > 254) return;
      for (const group of options.pending ?? []) {
        const s = await stats.takePending(group, id);
        if (s) await stats.record(group, s);
      }
    } catch {
      // best effort
    }
  }
}
