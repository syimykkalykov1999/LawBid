import {
  Body,
  Controller,
  ForbiddenException,
  HttpCode,
  HttpStatus,
  Post,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ApiEnvelopeResponse,
  ApiErrors,
} from '../../common/dto/api-docs.decorators';
import { ErrorCode } from '../../common/errors/error-code.enum';
import {
  AdminEndpoint,
  CurrentAdmin,
  SkipAutoAudit,
  type AdminActor,
} from '../admin-auth/admin-auth.decorators';
import { StaffSettingsService } from '../staff-core/staff-settings.service';
import { StaffPresenceService } from '../work-lease/staff-presence.service';
import { DeskHeartbeatDto, DeskHeartbeatResultDto } from './staff-desk.dto';

/**
 * Staff package: `admin/desk/*` — the desk's own routes next to the lease
 * routes of work-lease (`admin/desk/lease/*`, `admin/desk/status`).
 *
 * `POST admin/desk/heartbeat` is the desk's presence signal every 15 s. It
 * is the twin of the `presence:hb` event of the `/staff` socket and calls
 * the very same StaffPresenceService.heartbeat (one Redis pipeline, no
 * database write). The browser desk uses this route because the admin's
 * token never leaves the httpOnly cookie (every call goes through the
 * panel's proxy); a socket would have to hand the token to page scripts.
 */
// flag: none admin route under staff.presence_enabled (off by default), checked in the handler
@ApiTags('admin-staff')
@AdminEndpoint('super_admin', 'moderator', 'verifier', 'support', 'finance')
@Controller('admin/desk')
export class StaffDeskController {
  constructor(
    private readonly presence: StaffPresenceService,
    private readonly staff: StaffSettingsService,
  ) {}

  @Post('heartbeat')
  @HttpCode(HttpStatus.OK)
  // a signal every 15 s per open desk: an audit row each would only add hash-chain writes
  @SkipAutoAudit()
  @ApiOperation({
    summary:
      'Presence signal of an open desk (every 15 s): online / away / offline',
  })
  @ApiEnvelopeResponse(DeskHeartbeatResultDto)
  @ApiErrors({ 403: [ErrorCode.FEATURE_DISABLED] })
  async deskHeartbeat(
    @CurrentAdmin() admin: AdminActor,
    @Body() dto: DeskHeartbeatDto,
  ): Promise<DeskHeartbeatResultDto> {
    if (!(await this.staff.isOn('staff.presence_enabled'))) {
      throw new ForbiddenException({
        code: ErrorCode.FEATURE_DISABLED,
        message: 'Presence is not switched on.',
      });
    }
    return { status: await this.presence.heartbeat(admin.id, dto.active) };
  }
}
