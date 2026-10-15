import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { ApiErrors } from '../../common/dto/api-docs.decorators';
import { ErrorCode } from '../../common/errors/error-code.enum';
import { Public } from '../auth/decorators/public.decorator';
import { AppEventBatchDto } from './app-events.dto';
import { AppEventsService } from './app-events.service';

/** Owner 2026-10-15: the phone sends its events here in batches (no token
 * needed: counts only, nothing about a person; rate limited). */
@ApiTags('app-events')
@Controller('app-events')
export class AppEventsController {
  constructor(private readonly events: AppEventsService) {}

  @Public()
  @Post()
  @HttpCode(HttpStatus.NO_CONTENT)
  @Throttle({ default: { limit: 12, ttl: 60_000 } })
  @ApiOperation({ summary: 'The app reports events (batch of up to 50)' })
  @ApiErrors({
    400: [ErrorCode.VALIDATION_ERROR],
    429: [ErrorCode.RATE_LIMITED],
  })
  async reportEvents(@Body() dto: AppEventBatchDto): Promise<void> {
    await this.events.ingest(dto.events);
  }
}
