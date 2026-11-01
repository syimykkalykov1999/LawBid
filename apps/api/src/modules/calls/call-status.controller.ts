import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiExcludeEndpoint } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../auth/decorators/public.decorator';
import { CallIdParamDto, CallStatusQueryDto } from './calls.dto';
import { CallsService } from './calls.service';

/**
 * Owner 2026-10-28 (a locked Samsung rang on after the caller hung up):
 * the phone's native ring watcher asks «does this call still ring?» while
 * the app sleeps — no session header (the app may be closed or still
 * signing in), the ring push's short-lived ticket instead. Answers only
 * `{ state }`. Not part of the app's generated API (the native side calls
 * it), like the LiveKit webhook.
 */
@Controller()
export class CallStatusController {
  constructor(private readonly calls: CallsService) {}

  @Public()
  // A ring is ~60 s, asked every few seconds by each rung phone.
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Get('calls/:id/status')
  @ApiExcludeEndpoint()
  status(
    @Param() p: CallIdParamDto,
    @Query() q: CallStatusQueryDto,
  ): Promise<{ state: 'ringing' | 'active' | 'ended' }> {
    return this.calls.ringStatus(p.id, q.t);
  }
}
