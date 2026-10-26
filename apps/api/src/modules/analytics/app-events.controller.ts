import {
  Body,
  Controller,
  Req,
  HttpCode,
  HttpStatus,
  Post,
} from '@nestjs/common';
import type { Request } from 'express';
import { TokenService } from '../auth/auth.public';
import { AnalyticsConsentService } from './analytics-consent.service';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { ApiErrors } from '../../common/dto/api-docs.decorators';
import { ErrorCode } from '../../common/errors/error-code.enum';
import { Public } from '../auth/decorators/public.decorator';
import { AppEventBatchDto } from './app-events.dto';
import { AppEventsService } from './app-events.service';

/** Owner 2026-10-15: the phone sends its events here in batches (no token
 * needed: counts only, nothing about a person; rate limited).
 * Owner 2026-10-22 (audit #4 §5): when a token comes along and that
 * person's latest `analytics` consent is «no», the batch is dropped. */
@ApiTags('app-events')
@Controller('app-events')
export class AppEventsController {
  constructor(
    private readonly events: AppEventsService,
    private readonly consent: AnalyticsConsentService,
    private readonly tokens: TokenService,
  ) {}

  @Public()
  @Post()
  @HttpCode(HttpStatus.NO_CONTENT)
  @Throttle({ default: { limit: 12, ttl: 60_000 } })
  @ApiOperation({ summary: 'The app reports events (batch of up to 50)' })
  @ApiErrors({
    400: [ErrorCode.VALIDATION_ERROR],
    429: [ErrorCode.RATE_LIMITED],
  })
  async reportEvents(
    @Body() dto: AppEventBatchDto,
    // The optional bearer is read from the request (not a documented
    // header: the endpoint stays public and the client contract unchanged).
    @Req() req: Request,
  ): Promise<void> {
    const userId = this.userOf(req.headers.authorization);
    if (userId && !(await this.consent.allowed(userId))) return;
    await this.events.ingest(dto.events);
  }

  /** The signed-in person, if a valid access token was sent. */
  private userOf(authorization: string | undefined): string | null {
    const m = /^Bearer\s+(\S+)$/i.exec(authorization ?? '');
    if (!m) return null;
    try {
      return this.tokens.verifyAccessToken(m[1]).sub;
    } catch {
      return null;
    }
  }
}
