import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiEnvelopeResponse } from '../../common/dto/api-docs.decorators';
import {
  AdminEndpoint,
  CurrentAdmin,
  SkipAutoAudit,
  type AdminActor,
} from '../admin-auth/admin-auth.decorators';
import { AdminAuthService } from '../admin-auth/admin-auth.service';
import {
  StaffAppealDetailDto,
  StaffAppealItemDto,
  StaffAppealListDto,
  StaffAppealListQueryDto,
  StaffAppealReceiptDto,
  StaffCreateAppealDto,
  StaffDecideAppealDto,
  StaffDecideResultDto,
  StaffFlagDecisionDto,
  StaffFlagDecisionResultDto,
  StaffFlagListDto,
  StaffFlagListQueryDto,
  StaffMyAppealDto,
  StaffRevealResultDto,
  StaffSignalListDto,
} from './staff-appeals.dto';
import { StaffAppealsService } from './staff-appeals.service';

/**
 * Staff package T6 (plan B3): the owner's inbox of complaints against the
 * heads. Super admin only: for everyone else (the head, the trusted deputy,
 * other workspaces) every route answers 404, as if it did not exist (the
 * guard closes the unknown area; the service checks the role again). The
 * service writes its own audit rows (an anonymous author is never named in
 * them). Deciding, revealing a name and reversing a hold ask for a fresh
 * 2FA code (no second admin). Nothing here deletes an appeal.
 */
// flag: none owner-only inbox behind the staff.appeals_enabled switch (off: 404 everywhere)
@ApiTags('admin-staff')
@AdminEndpoint('super_admin')
@SkipAutoAudit()
@Controller('admin/appeals')
export class StaffAppealsController {
  constructor(
    private readonly appeals: StaffAppealsService,
    private readonly auth: AdminAuthService,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'Complaints against heads (open / decided), anonymity applied',
  })
  @ApiEnvelopeResponse(StaffAppealItemDto, { isArray: true })
  listAppeals(
    @CurrentAdmin() admin: AdminActor,
    @Query() q: StaffAppealListQueryDto,
  ): Promise<StaffAppealListDto> {
    return this.appeals.list(admin, q);
  }

  @Get('flags')
  @ApiOperation({ summary: 'Retaliation red marks (open / closed)' })
  @ApiEnvelopeResponse(StaffFlagListDto)
  listFlags(
    @CurrentAdmin() admin: AdminActor,
    @Query() q: StaffFlagListQueryDto,
  ): Promise<StaffFlagListDto> {
    return this.appeals.flags(admin, q);
  }

  @Get('signals')
  @ApiOperation({
    summary: 'Owner-inbox signals about heads and removals (last 30 days)',
  })
  @ApiEnvelopeResponse(StaffSignalListDto)
  listSignals(@CurrentAdmin() admin: AdminActor): Promise<StaffSignalListDto> {
    return this.appeals.signals(admin);
  }

  @Post('flags/:id/reverse')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Reverse a retaliation hold: the person works again (2FA)',
  })
  @ApiEnvelopeResponse(StaffFlagDecisionResultDto)
  async reverseFlag(
    @CurrentAdmin() admin: AdminActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: StaffFlagDecisionDto,
  ): Promise<StaffFlagDecisionResultDto> {
    await this.auth.assertStepUp(admin.sessionId);
    return this.appeals.reverse(admin, id, dto.note);
  }

  @Post('flags/:id/uphold')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Agree with the head: the removal stands, the hold ends (2FA)',
  })
  @ApiEnvelopeResponse(StaffFlagDecisionResultDto)
  async upholdFlag(
    @CurrentAdmin() admin: AdminActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: StaffFlagDecisionDto,
  ): Promise<StaffFlagDecisionResultDto> {
    await this.auth.assertStepUp(admin.sessionId);
    return this.appeals.uphold(admin, id, dto.note);
  }

  @Get(':id')
  @ApiOperation({ summary: 'One complaint (marks it as seen)' })
  @ApiEnvelopeResponse(StaffAppealDetailDto)
  getAppeal(
    @CurrentAdmin() admin: AdminActor,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<StaffAppealDetailDto> {
    return this.appeals.get(admin, id);
  }

  @Post(':id/decide')
  @HttpCode(200)
  @ApiOperation({
    summary:
      'Decide: fire the head / fire the worker / nothing. Records the decision and names the admin-management call (2FA)',
  })
  @ApiEnvelopeResponse(StaffDecideResultDto)
  async decideAppeal(
    @CurrentAdmin() admin: AdminActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: StaffDecideAppealDto,
  ): Promise<StaffDecideResultDto> {
    await this.auth.assertStepUp(admin.sessionId);
    return this.appeals.decide(admin, id, dto);
  }

  @Post(':id/reveal')
  @HttpCode(200)
  @ApiOperation({
    summary:
      'Reveal the name of an anonymous author (2FA, own audit row, daily cap)',
  })
  @ApiEnvelopeResponse(StaffRevealResultDto)
  async revealAuthor(
    @CurrentAdmin() admin: AdminActor,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<StaffRevealResultDto> {
    await this.auth.assertStepUp(admin.sessionId);
    return this.appeals.reveal(admin, id);
  }
}

/**
 * Staff package T6: the worker's side — file a complaint against the head
 * of the workspace and read the status of one's own. Sits under
 * `admin/workspace/*` (the area every signed-in admin reaches); the head
 * and the owner get 404. The author never sees anyone else's complaint.
 */
// flag: none staff.appeals_enabled gates it (off: 404); only a worker of a workspace with a head can file
@ApiTags('admin-staff')
@AdminEndpoint('moderator', 'verifier', 'support', 'finance', 'super_admin')
@SkipAutoAudit()
@Controller('admin/workspace/appeals')
export class StaffAppealsAuthorController {
  constructor(private readonly appeals: StaffAppealsService) {}

  @Post()
  @ApiOperation({
    summary: 'File a complaint against the head of my workspace',
  })
  @ApiEnvelopeResponse(StaffAppealReceiptDto, { status: HttpStatus.CREATED })
  fileAppeal(
    @CurrentAdmin() admin: AdminActor,
    @Body() dto: StaffCreateAppealDto,
  ): Promise<StaffAppealReceiptDto> {
    return this.appeals.file(admin, dto);
  }

  @Get('mine')
  @ApiOperation({ summary: 'My complaints and their status' })
  @ApiEnvelopeResponse(StaffMyAppealDto, { isArray: true })
  myAppeals(@CurrentAdmin() admin: AdminActor): Promise<StaffMyAppealDto[]> {
    return this.appeals.mine(admin);
  }
}
