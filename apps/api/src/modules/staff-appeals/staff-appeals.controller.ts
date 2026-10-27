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
  AppealDetailDto,
  AppealItemDto,
  AppealListDto,
  AppealListQueryDto,
  AppealReceiptDto,
  CreateAppealDto,
  DecideAppealDto,
  DecideResultDto,
  FlagDecisionDto,
  FlagDecisionResultDto,
  FlagListDto,
  FlagListQueryDto,
  MyAppealDto,
  RevealResultDto,
  SignalListDto,
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
  @ApiEnvelopeResponse(AppealItemDto, { isArray: true })
  listAppeals(
    @CurrentAdmin() admin: AdminActor,
    @Query() q: AppealListQueryDto,
  ): Promise<AppealListDto> {
    return this.appeals.list(admin, q);
  }

  @Get('flags')
  @ApiOperation({ summary: 'Retaliation red marks (open / closed)' })
  @ApiEnvelopeResponse(FlagListDto)
  listFlags(
    @CurrentAdmin() admin: AdminActor,
    @Query() q: FlagListQueryDto,
  ): Promise<FlagListDto> {
    return this.appeals.flags(admin, q);
  }

  @Get('signals')
  @ApiOperation({
    summary: 'Owner-inbox signals about heads and removals (last 30 days)',
  })
  @ApiEnvelopeResponse(SignalListDto)
  listSignals(@CurrentAdmin() admin: AdminActor): Promise<SignalListDto> {
    return this.appeals.signals(admin);
  }

  @Post('flags/:id/reverse')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Reverse a retaliation hold: the person works again (2FA)',
  })
  @ApiEnvelopeResponse(FlagDecisionResultDto)
  async reverseFlag(
    @CurrentAdmin() admin: AdminActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: FlagDecisionDto,
  ): Promise<FlagDecisionResultDto> {
    await this.auth.assertStepUp(admin.sessionId);
    return this.appeals.reverse(admin, id, dto.note);
  }

  @Post('flags/:id/uphold')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Agree with the head: the removal stands, the hold ends (2FA)',
  })
  @ApiEnvelopeResponse(FlagDecisionResultDto)
  async upholdFlag(
    @CurrentAdmin() admin: AdminActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: FlagDecisionDto,
  ): Promise<FlagDecisionResultDto> {
    await this.auth.assertStepUp(admin.sessionId);
    return this.appeals.uphold(admin, id, dto.note);
  }

  @Get(':id')
  @ApiOperation({ summary: 'One complaint (marks it as seen)' })
  @ApiEnvelopeResponse(AppealDetailDto)
  getAppeal(
    @CurrentAdmin() admin: AdminActor,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<AppealDetailDto> {
    return this.appeals.get(admin, id);
  }

  @Post(':id/decide')
  @HttpCode(200)
  @ApiOperation({
    summary:
      'Decide: fire the head / fire the worker / nothing. Records the decision and names the admin-management call (2FA)',
  })
  @ApiEnvelopeResponse(DecideResultDto)
  async decideAppeal(
    @CurrentAdmin() admin: AdminActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DecideAppealDto,
  ): Promise<DecideResultDto> {
    await this.auth.assertStepUp(admin.sessionId);
    return this.appeals.decide(admin, id, dto);
  }

  @Post(':id/reveal')
  @HttpCode(200)
  @ApiOperation({
    summary:
      'Reveal the name of an anonymous author (2FA, own audit row, daily cap)',
  })
  @ApiEnvelopeResponse(RevealResultDto)
  async revealAuthor(
    @CurrentAdmin() admin: AdminActor,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<RevealResultDto> {
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
  @ApiEnvelopeResponse(AppealReceiptDto, { status: HttpStatus.CREATED })
  fileAppeal(
    @CurrentAdmin() admin: AdminActor,
    @Body() dto: CreateAppealDto,
  ): Promise<AppealReceiptDto> {
    return this.appeals.file(admin, dto);
  }

  @Get('mine')
  @ApiOperation({ summary: 'My complaints and their status' })
  @ApiEnvelopeResponse(MyAppealDto, { isArray: true })
  myAppeals(@CurrentAdmin() admin: AdminActor): Promise<MyAppealDto[]> {
    return this.appeals.mine(admin);
  }
}
