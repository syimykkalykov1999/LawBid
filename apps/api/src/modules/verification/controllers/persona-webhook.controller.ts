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
import { ApiExcludeEndpoint } from '@nestjs/swagger';
import { ErrorCode } from '../../../common/errors/error-code.enum';
import { Public } from '../../auth/decorators/public.decorator';
import {
  PERSONA_SIGNATURE_HEADER,
  PersonaClient,
  personaSignatureValid,
} from '../providers/persona.client';
import {
  parsePersonaEvent,
  PersonaVerificationService,
} from '../services/persona-verification.service';

/**
 * Owner 2026-11-08: Persona's inquiry webhook (Persona dashboard →
 * Webhooks → URL `https://<api>/api/v1/webhooks/persona`). Authentic only
 * with a valid `Persona-Signature` over the exact raw body, keyed with the
 * webhook secret saved on the admin card. No key, a bad or missing
 * signature, or an unreadable body = a plain 404 (like the Bunny hook).
 * Anything else answers 200 at once so Persona does not retry.
 */
@Controller('webhooks')
export class PersonaWebhookController {
  constructor(
    private readonly persona: PersonaClient,
    private readonly service: PersonaVerificationService,
  ) {}

  // flag: none a webhook with no effect until the Persona card has a key, template and webhook secret
  @Public()
  @Post('persona')
  @HttpCode(HttpStatus.OK)
  @ApiExcludeEndpoint()
  async receive(
    @Req() req: { rawBody?: Buffer },
    @Headers(PERSONA_SIGNATURE_HEADER) signature: string | undefined,
    @Body() body: unknown,
  ): Promise<{ received: true }> {
    const cfg = await this.persona.config();
    if (
      !cfg ||
      !req.rawBody ||
      !personaSignatureValid(req.rawBody, signature, cfg.webhookSecret)
    ) {
      throw notFound();
    }
    const event = parsePersonaEvent(body);
    if (event) await this.service.handle(event);
    return { received: true };
  }
}

function notFound(): NotFoundException {
  return new NotFoundException({
    code: ErrorCode.NOT_FOUND,
    message: 'Not found.',
  });
}
