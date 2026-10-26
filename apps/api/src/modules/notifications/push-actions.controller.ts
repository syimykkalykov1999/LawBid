import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { ApiErrors } from '../../common/dto/api-docs.decorators';
import { ErrorCode } from '../../common/errors/error-code.enum';
import { Public } from '../auth/decorators/public.decorator';
import { PushActionDto } from './push-actions.dto';
import { PushActionsService } from './push-actions.service';

/** Owner 2026-10-26: the buttons of a chat notification («Ответить» /
 * «Прочитано»). No session header — a notification button runs while the
 * app may be closed; the signed ticket of the push + this device's FCM
 * token stand in for it (push-actions.service). */
@ApiTags('notifications')
@Controller('push-actions')
export class PushActionsController {
  constructor(private readonly actions: PushActionsService) {}

  @Public()
  @Post()
  @HttpCode(204)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @ApiOperation({ summary: 'Reply / mark read from a chat notification' })
  @ApiErrors({
    400: [ErrorCode.VALIDATION_ERROR],
    401: [ErrorCode.UNAUTHORIZED],
    429: [ErrorCode.RATE_LIMITED],
  })
  async pushAction(@Body() dto: PushActionDto): Promise<void> {
    await this.actions.act(dto);
  }
}
