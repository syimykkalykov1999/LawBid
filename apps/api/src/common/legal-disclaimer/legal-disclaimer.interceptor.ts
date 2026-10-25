import {
  applyDecorators,
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  SetMetadata,
  UseInterceptors,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { mergeMap, type Observable } from 'rxjs';
import { AppSettingsService } from '../app-settings/app-settings.service';
import {
  buildDisclaimer,
  stateOf,
  type DisclaimerKind,
  type LegalDisclaimer,
} from './legal-disclaimer';

const KIND_KEY = 'legal-disclaimer-kind';

/** Request property the response envelope reads (`meta.disclaimer`). */
export const DISCLAIMER_REQUEST_KEY = 'legalDisclaimer';

/**
 * Owner 2026-10-28: mark a route whose answer is legal information. The
 * server then adds `meta.disclaimer` ({text, version, stateCode, kind}) —
 * the text and per-state wording come from the admin (Настройки →
 * legal.disclaimer.*). Add the decorator to a route and nothing else.
 */
export function LegalDisclaimerNotice(kind: DisclaimerKind) {
  return applyDecorators(
    SetMetadata(KIND_KEY, kind),
    UseInterceptors(LegalDisclaimerInterceptor),
  );
}

@Injectable()
export class LegalDisclaimerInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly settings: AppSettingsService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const kind = this.reflector.getAllAndOverride<DisclaimerKind | undefined>(
      KIND_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!kind) return next.handle();
    const req = context.switchToHttp().getRequest<{
      query?: Record<string, unknown>;
      [DISCLAIMER_REQUEST_KEY]?: LegalDisclaimer;
    }>();
    return next.handle().pipe(
      mergeMap(async (payload: unknown) => {
        const notice = await this.notice(kind, req.query, payload);
        if (notice) req[DISCLAIMER_REQUEST_KEY] = notice;
        return payload;
      }),
    );
  }

  /** null = switched off in the admin. */
  async notice(
    kind: DisclaimerKind,
    query: Record<string, unknown> | undefined,
    payload: unknown,
  ): Promise<LegalDisclaimer | null> {
    if (!(await this.settings.boolean('legal.disclaimer.enabled'))) return null;
    const [defaultText, byState, extra] = await Promise.all([
      this.settings.string('legal.disclaimer.text'),
      this.settings.string('legal.disclaimer.by_state'),
      kind === 'template'
        ? this.settings.string('legal.disclaimer.template_extra')
        : kind === 'deadline'
          ? this.settings.string('legal.disclaimer.deadline_extra')
          : Promise.resolve(''),
    ]);
    return buildDisclaimer({
      kind,
      defaultText,
      byState,
      extra,
      stateCode: stateOf(query, payload),
    });
  }
}
