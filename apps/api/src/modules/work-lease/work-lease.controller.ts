import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
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
import { AdminAuthService } from '../admin-auth/admin-auth.service';
import { StaffSettingsService } from '../staff-core/staff-settings.service';
import { canWorkQueue } from './lease-access';
import { LeaseTeamService } from './lease-team.service';
import {
  LeaseService,
  type LeaseView,
  type NextOutcome,
} from './lease.service';
import { StaffPresenceService } from './staff-presence.service';
import { StaffEventsPublisher } from './staff-events.publisher';
import { STAFF_SERVER_EVENTS } from '../../common/staff-events';
import {
  DeskStatusDto,
  LeaseDto,
  LeaseItemParamDto,
  LeaseKindBodyDto,
  LeaseOkDto,
  MyLeasesDto,
  NextLeaseResultDto,
  SetDeskStatusDto,
  SkipLeaseDto,
  SkipLeaseResultDto,
  TeamAdminParamDto,
  TeamReassignDto,
  TeamReleaseDto,
  TeamReleaseResultDto,
  TeamViewDto,
} from './work-lease.dto';

const E = ErrorCode;

const present = (l: LeaseView): LeaseDto => ({
  kind: l.kind,
  itemId: l.itemId,
  takenAt: l.takenAt.toISOString(),
  leasedUntil: l.leasedUntil.toISOString(),
  attempt: l.attempt,
});

function presentNext(r: NextOutcome): NextLeaseResultDto {
  switch (r.status) {
    case 'leased':
      return { status: 'leased', lease: present(r.lease) };
    case 'busy':
      return { status: 'busy', held: r.held.map(present) };
    case 'wrap_up':
      return { status: 'wrap_up', retryAfterSec: r.retryAfterSec };
    default:
      return { status: r.status };
  }
}

/**
 * Staff package: `admin/desk/lease/*` — routing leases («Следующий»,
 * release / skip / done, my leases) and the head's team view with force
 * release / reassign. Every route works only while `staff.lease_enabled`
 * and the queue's own switch are on (403 FEATURE_DISABLED otherwise — the
 * queues keep their old behaviour). One fresh 2FA code and an audit row
 * for the head's actions; no second admin.
 */
// flag: none admin routes under staff.lease_enabled + staff.lease_<queue>_enabled (all off by default), checked in LeaseService/guardQueue
@ApiTags('admin-staff')
@AdminEndpoint('super_admin', 'moderator', 'verifier', 'support', 'finance')
@Controller('admin/desk/lease')
export class WorkLeaseController {
  constructor(
    private readonly leases: LeaseService,
    private readonly team: LeaseTeamService,
    private readonly presence: StaffPresenceService,
    private readonly staff: StaffSettingsService,
    private readonly auth: AdminAuthService,
  ) {}

  /** 403 unless the queue is served by leases AND this admin may work it. */
  private async guardQueue(admin: AdminActor, kind: string): Promise<void> {
    if (!(await this.leases.servesQueue(kind))) {
      throw new ForbiddenException({
        code: E.FEATURE_DISABLED,
        message: 'Work leases are not switched on for this queue.',
      });
    }
    const wsOn = await this.staff.isOn('staff.workspaces_enabled');
    if (!canWorkQueue(admin, kind, wsOn)) {
      throw new NotFoundException({ code: E.NOT_FOUND, message: 'Not found.' });
    }
  }

  // --- head / owner: the team (before the `:kind/:id` routes: `team/…` must not match them)

  @Get('team')
  @ApiOperation({
    summary: 'Team tiles: status and «in work by X» (owner or workspace head)',
  })
  @ApiEnvelopeResponse(TeamViewDto)
  @ApiErrors({ 403: [E.FORBIDDEN] })
  async getLeaseTeam(@CurrentAdmin() admin: AdminActor): Promise<TeamViewDto> {
    await this.requireLeaseOn();
    return this.team.tiles(admin);
  }

  @Post('team/:adminId/release')
  @HttpCode(HttpStatus.OK)
  @SkipAutoAudit()
  @ApiOperation({
    summary:
      'Take an item (or everything) away from a person; fresh 2FA code + audit row',
  })
  @ApiEnvelopeResponse(TeamReleaseResultDto)
  @ApiErrors({
    403: [E.FORBIDDEN, E.ADMIN_STEP_UP_REQUIRED],
    404: [E.NOT_FOUND],
  })
  async releaseLeaseTeamMember(
    @CurrentAdmin() admin: AdminActor,
    @Param() p: TeamAdminParamDto,
    @Body() dto: TeamReleaseDto,
  ): Promise<TeamReleaseResultDto> {
    await this.requireLeaseOn();
    await this.auth.assertStepUp(admin.sessionId);
    return { released: await this.team.release(admin, p.adminId, dto) };
  }

  @Post('team/:adminId/reassign')
  @HttpCode(HttpStatus.OK)
  @SkipAutoAudit()
  @ApiOperation({
    summary: 'Hand a held item to another person; fresh 2FA code + audit row',
  })
  @ApiEnvelopeResponse(LeaseDto)
  @ApiErrors({
    403: [E.FORBIDDEN, E.ADMIN_STEP_UP_REQUIRED],
    404: [E.NOT_FOUND],
  })
  async reassignLeaseTeamMember(
    @CurrentAdmin() admin: AdminActor,
    @Param() p: TeamAdminParamDto,
    @Body() dto: TeamReassignDto,
  ): Promise<LeaseDto> {
    await this.requireLeaseOn();
    await this.auth.assertStepUp(admin.sessionId);
    return this.team.reassign(admin, p.adminId, dto);
  }

  @Get('me')
  @ApiOperation({
    summary: 'My status, the items in my hands, capacity and wrap-up',
  })
  @ApiEnvelopeResponse(MyLeasesDto)
  async getMyDeskLeases(
    @CurrentAdmin() admin: AdminActor,
  ): Promise<MyLeasesDto> {
    const [leases, status, cfg, wrapUpSec] = await Promise.all([
      this.leases.mine(admin.id),
      this.presence.status(admin.id),
      this.staff.get(),
      this.leases.wrapUpLeft(admin.id),
    ]);
    return {
      status,
      leases: leases.map(present),
      capacity: {
        chat: cfg.numbers['staff.lease.chat_capacity'],
        other: cfg.numbers['staff.lease.capacity'],
      },
      wrapUpSec,
    };
  }

  @Post('next')
  @HttpCode(HttpStatus.OK)
  // work_lease_events is the journal of these; a generic audit row per click would only add a serial hash-chain write
  @SkipAutoAudit()
  @ApiOperation({
    summary:
      '«Следующий»: leases the oldest free item of the queue to me (one item, one worker)',
  })
  @ApiEnvelopeResponse(NextLeaseResultDto)
  @ApiErrors({ 403: [E.FEATURE_DISABLED], 404: [E.NOT_FOUND] })
  async nextDeskLease(
    @CurrentAdmin() admin: AdminActor,
    @Body() dto: LeaseKindBodyDto,
  ): Promise<NextLeaseResultDto> {
    await this.guardQueue(admin, dto.kind);
    return presentNext(
      await this.leases.next(dto.kind, {
        adminId: admin.id,
        countries: admin.countries ?? null,
      }),
    );
  }

  @Post(':kind/:id/renew')
  @HttpCode(HttpStatus.OK)
  // work_lease_events is the journal of these; a generic audit row per click would only add a serial hash-chain write
  @SkipAutoAudit()
  @ApiOperation({ summary: 'I am still working on it: the lease runs again' })
  @ApiEnvelopeResponse(LeaseDto)
  @ApiErrors({ 403: [E.FEATURE_DISABLED], 404: [E.NOT_FOUND] })
  async renewDeskLease(
    @CurrentAdmin() admin: AdminActor,
    @Param() p: LeaseItemParamDto,
  ): Promise<LeaseDto> {
    await this.guardQueue(admin, p.kind);
    const l = await this.leases.renew(p.kind, p.id, admin.id);
    if (!l) throw gone();
    return present(l);
  }

  @Post(':kind/:id/release')
  @HttpCode(HttpStatus.OK)
  // work_lease_events is the journal of these; a generic audit row per click would only add a serial hash-chain write
  @SkipAutoAudit()
  @ApiOperation({ summary: 'Let go: the item goes back to the queue' })
  @ApiEnvelopeResponse(LeaseOkDto)
  @ApiErrors({ 403: [E.FEATURE_DISABLED], 404: [E.NOT_FOUND] })
  async releaseDeskLease(
    @CurrentAdmin() admin: AdminActor,
    @Param() p: LeaseItemParamDto,
  ): Promise<LeaseOkDto> {
    await this.guardQueue(admin, p.kind);
    return { ok: await this.leases.release(p.kind, p.id, admin.id) };
  }

  @Post(':kind/:id/skip')
  @HttpCode(HttpStatus.OK)
  // work_lease_events is the journal of these; a generic audit row per click would only add a serial hash-chain write
  @SkipAutoAudit()
  @ApiOperation({
    summary:
      '«Пропустить» with a reason from the list (a few per hour); the item goes to someone else',
  })
  @ApiEnvelopeResponse(SkipLeaseResultDto)
  @ApiErrors({ 403: [E.FEATURE_DISABLED], 404: [E.NOT_FOUND] })
  async skipDeskLease(
    @CurrentAdmin() admin: AdminActor,
    @Param() p: LeaseItemParamDto,
    @Body() dto: SkipLeaseDto,
  ): Promise<SkipLeaseResultDto> {
    await this.guardQueue(admin, p.kind);
    return this.leases.skip(p.kind, p.id, admin.id, dto.reason);
  }

  @Post(':kind/:id/done')
  @HttpCode(HttpStatus.OK)
  // work_lease_events is the journal of these; a generic audit row per click would only add a serial hash-chain write
  @SkipAutoAudit()
  @ApiOperation({
    summary:
      'The item is closed: the lease ends (support gets a short wrap-up before the next one)',
  })
  @ApiEnvelopeResponse(LeaseOkDto)
  @ApiErrors({ 403: [E.FEATURE_DISABLED], 404: [E.NOT_FOUND] })
  async doneDeskLease(
    @CurrentAdmin() admin: AdminActor,
    @Param() p: LeaseItemParamDto,
  ): Promise<LeaseOkDto> {
    await this.guardQueue(admin, p.kind);
    await this.leases.done(p.kind, p.id, admin.id);
    return { ok: true };
  }

  private async requireLeaseOn(): Promise<void> {
    if (!(await this.staff.isOn('staff.lease_enabled'))) {
      throw new ForbiddenException({
        code: E.FEATURE_DISABLED,
        message: 'Work leases are not switched on.',
      });
    }
  }
}

/** `admin/desk/status`: «отошёл» by hand. */
// flag: none admin route under staff.presence_enabled (off by default), checked in the handler
@ApiTags('admin-staff')
@AdminEndpoint('super_admin', 'moderator', 'verifier', 'support', 'finance')
@Controller('admin/desk/status')
export class DeskStatusController {
  constructor(
    private readonly presence: StaffPresenceService,
    private readonly staff: StaffSettingsService,
    private readonly events: StaffEventsPublisher,
  ) {}

  @Get()
  @ApiOperation({ summary: 'My status: online / away / offline' })
  @ApiEnvelopeResponse(DeskStatusDto)
  async getDeskStatus(
    @CurrentAdmin() admin: AdminActor,
  ): Promise<DeskStatusDto> {
    return { status: await this.presence.status(admin.id) };
  }

  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '«Отошёл» by hand (true) or back on (false)' })
  @ApiEnvelopeResponse(DeskStatusDto)
  @ApiErrors({ 403: [E.FEATURE_DISABLED] })
  async setDeskStatus(
    @CurrentAdmin() admin: AdminActor,
    @Body() dto: SetDeskStatusDto,
  ): Promise<DeskStatusDto> {
    if (!(await this.staff.isOn('staff.presence_enabled'))) {
      throw new ForbiddenException({
        code: E.FEATURE_DISABLED,
        message: 'Presence is not switched on.',
      });
    }
    await this.presence.setAway(admin.id, dto.away);
    const status = await this.presence.status(admin.id);
    this.events.toAdmin(admin.id, STAFF_SERVER_EVENTS.statusChanged, {
      status,
    });
    return { status };
  }
}

function gone(): NotFoundException {
  return new NotFoundException({
    code: ErrorCode.NOT_FOUND,
    message: 'This item is no longer in your hands.',
  });
}
