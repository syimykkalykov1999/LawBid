import {
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Post,
  Req,
} from '@nestjs/common';
import { ApiExcludeEndpoint } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { ErrorCode } from '../../common/errors/error-code.enum';
import { Public } from '../auth/decorators/public.decorator';
import { CallsService } from './calls.service';

/**
 * Owner 2026-10-22: LiveKit to LawBid. `participant_left` / `room_finished`
 * feed the normal call lifecycle. The Authorization header is a JWT signed
 * with the LiveKit API secret that also carries a SHA-256 of the body; both
 * are checked by the official SDK on the exact raw body. Bad signature,
 * missing keys, an unknown room: a plain 404.
 */
@Controller('webhooks')
export class LiveKitWebhookController {
  constructor(private readonly calls: CallsService) {}

  @Public()
  @SkipThrottle()
  @Post('livekit')
  @HttpCode(HttpStatus.OK)
  @ApiExcludeEndpoint()
  async livekit(
    @Req() req: { rawBody?: Buffer },
    @Headers('authorization') authorization: string | undefined,
  ): Promise<{ received: true }> {
    if (!req.rawBody) {
      throw new NotFoundException({
        code: ErrorCode.CALL_NOT_FOUND,
        message: 'Not found.',
      });
    }
    await this.calls.receiveLivekitWebhook(
      req.rawBody.toString('utf8'),
      authorization,
    );
    return { received: true };
  }
}
