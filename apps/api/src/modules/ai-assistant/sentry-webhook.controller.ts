import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Post,
  Req,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { ErrorCode } from '../../common/errors/error-code.enum';
import { SecretsService } from '../../common/secrets/secrets.service';
import { Public } from '../auth/decorators/public.decorator';
import {
  SENTRY_RESOURCE_HEADER,
  SENTRY_SIGNATURE_HEADER,
  sentryNewIssue,
  sentrySignatureValid,
} from './ai-assistant.logic';
import { AiAssistantService } from './ai-assistant.service';

/** Integrations vault entry holding the Sentry Client Secret. */
export const SENTRY_WEBHOOK_PROVIDER = 'sentry_webhook';

/**
 * 12.11.2026 (owner): a new Sentry error starts the AI assistant at once.
 * Sentry's internal integration posts here; every call is signed with its
 * Client Secret (`sentry-hook-signature`, hex HMAC-SHA256 of the body, kept
 * in Admin → Integrations → «Sentry: вебхук для ИИ-помощника»). Same shape
 * as the Bunny webhook: no secret saved or a bad signature = plain 404.
 * Only `issue` / `created` at level error or fatal triggers a run (once an
 * hour per issue id); the answer never waits on GitHub (Sentry wants < 1 s).
 */
@ApiExcludeController()
@Controller('webhooks')
export class SentryWebhookController {
  constructor(
    private readonly secrets: SecretsService,
    private readonly ai: AiAssistantService,
  ) {}

  // flag: none server-to-server webhook (HMAC-signed by Sentry), gated by ai.assistant_mode
  @Public()
  @Post('sentry')
  @HttpCode(HttpStatus.OK)
  async sentryWebhook(
    @Req() req: { rawBody?: Buffer },
    @Headers(SENTRY_SIGNATURE_HEADER) signature: string | undefined,
    @Headers(SENTRY_RESOURCE_HEADER) resource: string | undefined,
    @Body() body: unknown,
  ): Promise<{ received: true }> {
    const sets = await this.secrets
      .getAll(SENTRY_WEBHOOK_PROVIDER)
      .catch(() => []);
    const keys = sets
      .map((s) => s.fields.clientSecret ?? '')
      .filter((k) => k.length > 0);
    if (keys.length === 0) throw this.notFound();
    // The raw bytes are what Sentry signed; its own Node example signs
    // JSON.stringify(body), so that form is accepted too.
    const forms = [
      req.rawBody,
      body === undefined ? undefined : Buffer.from(JSON.stringify(body)),
    ].filter((b): b is Buffer => !!b);
    const ok = keys.some((k) =>
      forms.some((raw) => sentrySignatureValid(raw, signature, k)),
    );
    if (!ok) throw this.notFound();
    const issue = sentryNewIssue(resource, body);
    if (issue) void this.ai.trigger('sentry', issue.id, issue.text);
    return { received: true };
  }

  private notFound(): NotFoundException {
    return new NotFoundException({
      code: ErrorCode.NOT_FOUND,
      message: 'Not found.',
    });
  }
}
