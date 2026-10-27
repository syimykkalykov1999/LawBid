import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ApiEnvelopeResponse,
  ApiErrors,
} from '../../common/dto/api-docs.decorators';
import { ErrorCode } from '../../common/errors/error-code.enum';
import {
  AdminEndpoint,
  ALL_ADMIN_ROLES,
  CurrentAdmin,
  SkipAutoAudit,
  type AdminActor,
} from '../admin-auth/admin-auth.decorators';
import { AdminAuthService } from '../admin-auth/admin-auth.service';
import {
  DisputePieceworkDto,
  PieceworkDayParamDto,
  PieceworkDisputeResultDto,
  PieceworkOverviewDto,
  PieceworkQueryDto,
  PieceworkRerunResultDto,
  SetStaffRateDto,
  StaffRateDto,
  StaffRateIdParamDto,
} from './staff-piecework.dto';
import { StaffPieceworkReadService } from './staff-piecework-read.service';
import { StaffPieceworkService } from './staff-piecework.service';
import { StaffRatesService } from './staff-rates.service';

const E = ErrorCode;

/**
 * Staff package T7: the owner's piecework rates. Super admin only (anyone
 * else gets 404 from the guard, as for any section without rights); every
 * change needs a fresh 2FA code like other payroll money edits, and writes
 * its own audit row. 404 while `staff.piecework_enabled` is off.
 */
// flag: none super-admin only and gated by the staff.piecework_enabled app setting (404 while off)
@ApiTags('admin-staff')
@AdminEndpoint('super_admin')
@SkipAutoAudit()
@Controller('admin/staff/rates')
export class StaffRatesController {
  constructor(
    private readonly rates: StaffRatesService,
    private readonly read: StaffPieceworkReadService,
    private readonly auth: AdminAuthService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Piecework rates, newest first (owner only)' })
  @ApiEnvelopeResponse(StaffRateDto, { isArray: true })
  @ApiErrors({ 404: [E.NOT_FOUND] })
  async listStaffRates(): Promise<StaffRateDto[]> {
    await this.read.assertEnabled();
    return this.rates.list();
  }

  @Put()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Set a rate: closes the open one of the same kind and workspace (owner only)',
  })
  @ApiEnvelopeResponse(StaffRateDto)
  @ApiErrors({
    400: [E.VALIDATION_ERROR],
    403: [E.ADMIN_STEP_UP_REQUIRED],
    404: [E.NOT_FOUND],
    409: [E.VALIDATION_ERROR],
  })
  async setStaffRate(
    @CurrentAdmin() admin: AdminActor,
    @Body() dto: SetStaffRateDto,
  ): Promise<StaffRateDto> {
    await this.read.assertEnabled();
    await this.auth.assertStepUp(admin.sessionId);
    return this.rates.set(admin, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'End a rate now (owner only)' })
  @ApiEnvelopeResponse(StaffRateDto)
  @ApiErrors({
    403: [E.ADMIN_STEP_UP_REQUIRED],
    404: [E.NOT_FOUND],
    409: [E.VALIDATION_ERROR],
  })
  async endStaffRate(
    @CurrentAdmin() admin: AdminActor,
    @Param() p: StaffRateIdParamDto,
  ): Promise<StaffRateDto> {
    await this.read.assertEnabled();
    await this.auth.assertStepUp(admin.sessionId);
    return this.rates.end(admin, p.id);
  }
}

/**
 * Staff package T7: piecework pay for the owner — everyone's totals and
 * days, the dispute hold and the recount of one day. Super admin only;
 * the money actions need a fresh 2FA code and write an audit row.
 */
// flag: none super-admin only and gated by the staff.piecework_enabled app setting (404 while off)
@ApiTags('admin-staff')
@AdminEndpoint('super_admin')
@SkipAutoAudit()
@Controller('admin/staff/piecework')
export class StaffPieceworkController {
  constructor(
    private readonly piecework: StaffPieceworkService,
    private readonly read: StaffPieceworkReadService,
    private readonly auth: AdminAuthService,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'Piecework pay of everyone for a month, with day lines and rates',
  })
  @ApiEnvelopeResponse(PieceworkOverviewDto)
  @ApiErrors({ 404: [E.NOT_FOUND] })
  staffPieceworkOverview(
    @CurrentAdmin() admin: AdminActor,
    @Query() q: PieceworkQueryDto,
  ): Promise<PieceworkOverviewDto> {
    return this.read.overview(admin, q.period);
  }

  @Post(':adminId/:day/dispute')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Hold a day: its pending payroll accrual is canceled, the nightly run leaves it',
  })
  @ApiEnvelopeResponse(PieceworkDisputeResultDto)
  @ApiErrors({
    400: [E.VALIDATION_ERROR],
    403: [E.ADMIN_STEP_UP_REQUIRED],
    404: [E.NOT_FOUND],
  })
  async disputeStaffPiecework(
    @CurrentAdmin() admin: AdminActor,
    @Param() p: PieceworkDayParamDto,
    @Body() dto: DisputePieceworkDto,
  ): Promise<PieceworkDisputeResultDto> {
    await this.read.assertEnabled();
    await this.auth.assertStepUp(admin.sessionId);
    return this.piecework.dispute(admin, p.adminId, p.day, dto.reason);
  }

  @Post(':adminId/:day/rerun')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Recount one finished day of one person (also lifts a dispute)',
  })
  @ApiEnvelopeResponse(PieceworkRerunResultDto)
  @ApiErrors({
    400: [E.VALIDATION_ERROR],
    403: [E.ADMIN_STEP_UP_REQUIRED],
    404: [E.NOT_FOUND],
  })
  async rerunStaffPiecework(
    @CurrentAdmin() admin: AdminActor,
    @Param() p: PieceworkDayParamDto,
  ): Promise<PieceworkRerunResultDto> {
    await this.read.assertEnabled();
    await this.auth.assertStepUp(admin.sessionId);
    return this.piecework.rerun(admin, p.adminId, p.day);
  }
}

/**
 * Staff package T7: «my piecework» for every admin. Scoped in the service:
 * a head sees the totals of their workspace (no rates, no per-person money),
 * everyone else only their own days. It sits under `admin/workspace` (open
 * to every signed-in admin, like the other personal pages).
 */
// flag: none gated by the staff.piecework_enabled app setting (404 for everyone while off)
@ApiTags('admin-workspace')
@AdminEndpoint(...ALL_ADMIN_ROLES)
@Controller('admin/workspace/piecework')
export class StaffPieceworkMineController {
  constructor(private readonly read: StaffPieceworkReadService) {}

  @Get()
  @ApiOperation({
    summary:
      'My piecework days (a head: the workspace totals; the owner: everyone)',
  })
  @ApiEnvelopeResponse(PieceworkOverviewDto)
  @ApiErrors({ 404: [E.NOT_FOUND] })
  myPiecework(
    @CurrentAdmin() admin: AdminActor,
    @Query() q: PieceworkQueryDto,
  ): Promise<PieceworkOverviewDto> {
    return this.read.overview(admin, q.period);
  }
}
