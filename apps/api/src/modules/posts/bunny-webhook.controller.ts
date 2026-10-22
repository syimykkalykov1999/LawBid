import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Logger,
  NotFoundException,
  Param,
  Post,
  Req,
} from '@nestjs/common';
import { ApiExcludeEndpoint } from '@nestjs/swagger';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { ErrorCode } from '../../common/errors/error-code.enum';
import { Public } from '../auth/decorators/public.decorator';
import { BunnyStreamClient } from '../videos/bunny-stream.client';
import { PostVideosService } from './post-videos.service';

/** Bunny Stream's signature header: lowercase hex HMAC-SHA256 of the raw
 * body, keyed with the library's Read-Only API key (signature `v1`). */
export const BUNNY_SIGNATURE_HEADER = 'x-bunnystream-signature';

/** Constant-time check of a Bunny Stream `v1` signature. */
export function bunnySignatureValid(
  rawBody: Buffer,
  signature: string | undefined,
  signingKey: string,
): boolean {
  const sig = signature?.trim() ?? '';
  if (!/^[0-9a-f]{64}$/i.test(sig)) return false;
  const expected = createHmac('sha256', signingKey).update(rawBody).digest();
  const got = Buffer.from(sig.toLowerCase(), 'hex');
  return got.length === expected.length && timingSafeEqual(got, expected);
}

function sameToken(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length > 0 && x.length === y.length && timingSafeEqual(x, y);
}

/**
 * Owner 2026-10-01 — Bunny Stream "video encoded" webhook. The payload's
 * status is never trusted: the video is re-read from Bunny.
 *
 * Audit #4 (2026-10-22): authentication is the `X-BunnyStream-Signature`
 * HMAC whenever the Read-Only API key is saved (Admin → Integrations →
 * Bunny → «Read-only API key»). The URL token is then not needed, and a
 * leaked one (ALB access logs record the path) is useless:
 * `POST /webhooks/bunny` works without it. While no signing key is
 * configured the old secret path token (`POST /webhooks/bunny/:token`) is
 * the fallback, with a one-time warning. Any failure is a plain 404.
 */
@Controller('webhooks')
export class BunnyWebhookController {
  private readonly logger = new Logger(BunnyWebhookController.name);
  private warnedNoSignature = false;

  constructor(
    private readonly bunny: BunnyStreamClient,
    private readonly postVideos: PostVideosService,
  ) {}

  @Public()
  @Post('bunny')
  @HttpCode(HttpStatus.OK)
  @ApiExcludeEndpoint()
  async bunnySigned(
    @Req() req: { rawBody?: Buffer },
    @Headers(BUNNY_SIGNATURE_HEADER) signature: string | undefined,
    @Body() body: { VideoGuid?: unknown },
  ): Promise<{ received: true }> {
    return this.receive(req.rawBody, signature, null, body);
  }

  @Public()
  @Post('bunny/:token')
  @HttpCode(HttpStatus.OK)
  @ApiExcludeEndpoint()
  async bunnyWebhook(
    @Param('token') token: string,
    @Req() req: { rawBody?: Buffer },
    @Headers(BUNNY_SIGNATURE_HEADER) signature: string | undefined,
    @Body() body: { VideoGuid?: unknown },
  ): Promise<{ received: true }> {
    return this.receive(req.rawBody, signature, token ?? '', body);
  }

  private async receive(
    rawBody: Buffer | undefined,
    signature: string | undefined,
    token: string | null,
    body: { VideoGuid?: unknown },
  ): Promise<{ received: true }> {
    const keys = await this.bunny.keys();
    if (!keys) throw this.notFound();
    const signingKey = keys.webhookSigningKey;
    if (signingKey) {
      // The raw body is required: re-serialised JSON would not match.
      if (!rawBody || !bunnySignatureValid(rawBody, signature, signingKey)) {
        throw this.notFound();
      }
    } else {
      if (token === null || !sameToken(token, keys.webhookToken)) {
        throw this.notFound();
      }
      if (!this.warnedNoSignature) {
        this.warnedNoSignature = true;
        this.logger.warn(
          'Bunny webhook accepted by the URL token only: save the Bunny Read-Only API key (Admin → Integrations → Bunny) to verify X-BunnyStream-Signature.',
        );
      }
    }
    const guid = typeof body?.VideoGuid === 'string' ? body.VideoGuid : null;
    if (guid && /^[0-9a-f-]{36}$/i.test(guid)) {
      await this.postVideos.onWebhook(guid);
    }
    return { received: true };
  }

  private notFound(): NotFoundException {
    return new NotFoundException({
      code: ErrorCode.NOT_FOUND,
      message: 'Not found.',
    });
  }
}
