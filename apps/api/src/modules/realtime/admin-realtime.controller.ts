import { randomBytes } from 'node:crypto';
import { Controller, HttpCode, HttpStatus, Inject, Post } from '@nestjs/common';
import { ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';
import type Redis from 'ioredis';
import { AppSettingsService } from '../../common/app-settings/app-settings.service';
import { ApiEnvelopeResponse } from '../../common/dto/api-docs.decorators';
import { REDIS_CLIENT } from '../../redis/redis.constants';
import {
  ALL_ADMIN_ROLES,
  type AdminActor,
  AdminEndpoint,
  CurrentAdmin,
} from '../admin-auth/admin-auth.decorators';
import {
  ADMIN_RT_NAMESPACE,
  ADMIN_TICKET_TTL_SEC,
  adminTicketKey,
} from './realtime-publisher.service';

/** What the panel needs to open its socket (AdminRealtimeGateway). */
export class AdminRealtimeTicketDto {
  @ApiProperty({
    description:
      'false: the switch `realtime.admin_events_enabled` is off — keep polling.',
  })
  enabled!: boolean;

  @ApiProperty({
    nullable: true,
    description:
      'One-shot handshake ticket (`auth.ticket`), valid `ttlSec` seconds; null when disabled.',
  })
  ticket!: string | null;

  @ApiProperty({ description: 'The Socket.IO namespace to connect to.' })
  namespace!: string;

  @ApiProperty({ description: 'Seconds the ticket stays redeemable.' })
  ttlSec!: number;
}

/** What a ticket stands for (stored in Redis for ADMIN_TICKET_TTL_SEC). */
export interface AdminTicket {
  adminId: string;
  sessionId: string;
  countries: string[] | null;
}

/**
 * Speed matrix 2026-11-09 (§3 #5): the admin JWT lives in an httpOnly
 * cookie and every call goes through the panel's proxy, so the browser
 * cannot present the JWT at a socket handshake. Instead the proxy asks here
 * (authenticated like any admin call) for a one-shot ticket bound to the
 * admin session; the browser hands the ticket to the `/admin` namespace,
 * where it is redeemed once (GETDEL) and checked against the live session.
 * Same shape as the website's QR sign-in socket: the socket proves nothing
 * by itself and only listens.
 */
@ApiTags('admin-realtime')
@AdminEndpoint(...ALL_ADMIN_ROLES)
@Controller('admin/realtime')
export class AdminRealtimeController {
  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly settings: AppSettingsService,
  ) {}

  @Post('ticket')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'One-shot ticket for the admin live-updates socket (namespace /admin)',
  })
  @ApiEnvelopeResponse(AdminRealtimeTicketDto)
  async ticket(
    @CurrentAdmin() admin: AdminActor,
  ): Promise<AdminRealtimeTicketDto> {
    if (!(await this.settings.boolean('realtime.admin_events_enabled'))) {
      return {
        enabled: false,
        ticket: null,
        namespace: ADMIN_RT_NAMESPACE,
        ttlSec: 0,
      };
    }
    const ticket = randomBytes(24).toString('base64url');
    const stored: AdminTicket = {
      adminId: admin.id,
      sessionId: admin.sessionId,
      countries: admin.countries ?? null,
    };
    await this.redis.set(
      adminTicketKey(ticket),
      JSON.stringify(stored),
      'EX',
      ADMIN_TICKET_TTL_SEC,
    );
    return {
      enabled: true,
      ticket,
      namespace: ADMIN_RT_NAMESPACE,
      ttlSec: ADMIN_TICKET_TTL_SEC,
    };
  }
}
