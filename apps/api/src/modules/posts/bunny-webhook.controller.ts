import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
} from '@nestjs/common';
import { ApiExcludeEndpoint } from '@nestjs/swagger';
import { timingSafeEqual } from 'node:crypto';
import { ErrorCode } from '../../common/errors/error-code.enum';
import { Public } from '../auth/decorators/public.decorator';
import { BunnyStreamClient } from '../videos/bunny-stream.client';
import { PostVideosService } from './post-videos.service';

/**
 * Owner 2026-10-01 — `POST /webhooks/bunny/:token`. Bunny sends no auth
 * header, so the secret token lives in the URL (Admin → Integrations →
 * Bunny → webhook token). A wrong token is a plain 404; the payload's
 * status is never trusted — the video is re-read from Bunny.
 */
@Controller('webhooks')
export class BunnyWebhookController {
  constructor(
    private readonly bunny: BunnyStreamClient,
    private readonly postVideos: PostVideosService,
  ) {}

  @Public()
  @Post('bunny/:token')
  @HttpCode(HttpStatus.OK)
  @ApiExcludeEndpoint()
  async bunnyWebhook(
    @Param('token') token: string,
    @Body() body: { VideoGuid?: unknown },
  ): Promise<{ received: true }> {
    const keys = await this.bunny.keys();
    const a = Buffer.from(token ?? '');
    const b = Buffer.from(keys?.webhookToken ?? '');
    if (!keys || a.length !== b.length || !timingSafeEqual(a, b)) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'Not found.',
      });
    }
    const guid = typeof body?.VideoGuid === 'string' ? body.VideoGuid : null;
    if (guid && /^[0-9a-f-]{36}$/i.test(guid)) {
      await this.postVideos.onWebhook(guid);
    }
    return { received: true };
  }
}
