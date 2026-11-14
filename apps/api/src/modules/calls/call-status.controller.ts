import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { ApiExcludeEndpoint } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../auth/decorators/public.decorator';
import {
  ringTicketTracker,
  ThrottleSetting,
} from '../../throttler/throttle-setting';
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
  // A ring is ~60 s, asked every few seconds by each rung phone. D1-19
  // (13.11): counted per call and person by the ticket (not per address:
  // many phones share a carrier NAT), and the limit is the admin setting.
  @Throttle({
    default: { limit: 60, ttl: 60_000, getTracker: ringTicketTracker },
  })
  @ThrottleSetting('calls.ring_status_rate_limit_per_minute')
  @Get('calls/:id/status')
  @ApiExcludeEndpoint()
  status(
    @Param() p: CallIdParamDto,
    @Query() q: CallStatusQueryDto,
  ): Promise<{ state: 'ringing' | 'active' | 'ended' }> {
    return this.calls.ringStatus(p.id, q.t);
  }

  /** Owner 2026-11-03: «Decline» on a closed iPhone (AppDelegate.onDecline)
   * — the same decline as POST /calls/:id/decline, with the ring ticket
   * (`{ t }` in the body) instead of a session. Idempotent. */
  @Public()
  // One tap per ring plus one retry, per IP — many phones share one
  // carrier NAT address.
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post('calls/:id/status/decline')
  @HttpCode(200)
  @ApiExcludeEndpoint()
  decline(
    @Param() p: CallIdParamDto,
    @Body() b: CallStatusQueryDto,
  ): Promise<{ state: 'ringing' | 'active' | 'ended' }> {
    return this.calls.declineByTicket(p.id, b.t);
  }
}
