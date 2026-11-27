import { Throttle } from '@nestjs/throttler';
import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ApiEnvelopeResponse,
  ApiErrors,
  AUTHENTICATED_ERRORS,
} from '../../../common/dto/api-docs.decorators';
import { ErrorCode } from '../../../common/errors/error-code.enum';
import {
  CurrentUser,
  type RequestUser,
} from '../../auth/decorators/current-user.decorator';
import { RequiresDuty } from '../../auth/assistant/assistant-context';
import {
  ClaimedKeyPackageDto,
  MlsCommitRowDto,
  MlsCommitsQueryDto,
  MlsEpochDto,
  MlsWelcomesQueryDto,
} from '../../chat/chat-e2ee.public';
import { GroupIdParamDto } from '../groups.dto';
import {
  CreateGroupMlsDto,
  GroupClaimKeyPackagesDto,
  GroupE2eeDto,
  GroupExternalCommitDto,
  GroupInfoResultDto,
  GroupMlsCommitDto,
  GroupMlsLeaseDto,
  GroupMlsLeaseResultDto,
  GroupMlsWelcomeDto,
} from './group-e2ee.dto';
import { GroupE2eeService } from './group-e2ee.service';

/** Group E2EE G1 (docs/architecture/GROUP_E2EE_DESIGN_2026-11-26.md §4.1):
 * the MLS Delivery Service for group chats — the chats' routes under
 * /e2ee/groups, plus GroupInfo, external commit and the commit lease.
 * Messages go through POST /groups/:id/messages with type=mls; a Welcome
 * is acknowledged with DELETE /e2ee/welcomes/:id as in the chats. */
@ApiTags('e2ee')
@ApiBearerAuth()
@ApiErrors(AUTHENTICATED_ERRORS)
@RequiresDuty('chats')
@Controller('e2ee/groups')
export class GroupE2eeController {
  constructor(private readonly e2ee: GroupE2eeService) {}

  @Get('welcomes')
  @ApiOperation({ summary: 'Group Welcomes waiting for one of my devices' })
  @ApiEnvelopeResponse(GroupMlsWelcomeDto, { isArray: true })
  @ApiErrors({ 404: [ErrorCode.NOT_FOUND] })
  listGroupMlsWelcomes(
    @CurrentUser() user: RequestUser,
    @Query() q: MlsWelcomesQueryDto,
  ): Promise<GroupMlsWelcomeDto[]> {
    return this.e2ee.welcomes(user, q.deviceId);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Is this group end-to-end encrypted, and its MLS group',
  })
  @ApiEnvelopeResponse(GroupE2eeDto)
  @ApiErrors({
    403: [ErrorCode.FEATURE_DISABLED],
    404: [ErrorCode.GROUP_NOT_FOUND],
  })
  getGroupE2ee(
    @CurrentUser() user: RequestUser,
    @Param() p: GroupIdParamDto,
  ): Promise<GroupE2eeDto> {
    return this.e2ee.state(user, p.id);
  }

  @Post(':id/group')
  @ApiOperation({ summary: 'Create the group’s MLS group (epoch 0)' })
  @ApiEnvelopeResponse(GroupE2eeDto, { status: 201 })
  @ApiErrors({
    400: [ErrorCode.VALIDATION_ERROR],
    403: [ErrorCode.FEATURE_DISABLED],
    404: [ErrorCode.GROUP_NOT_FOUND, ErrorCode.NOT_FOUND],
    409: [ErrorCode.E2EE_OFF, ErrorCode.E2EE_EPOCH_CONFLICT],
  })
  createGroupMls(
    @CurrentUser() user: RequestUser,
    @Param() p: GroupIdParamDto,
    @Body() dto: CreateGroupMlsDto,
  ): Promise<GroupE2eeDto> {
    return this.e2ee.createGroup(user, p.id, dto);
  }

  @Post(':id/lease')
  @HttpCode(200)
  @ApiOperation({
    summary:
      'The right to commit in this group for a short time (one device at a time)',
  })
  @ApiEnvelopeResponse(GroupMlsLeaseResultDto)
  @ApiErrors({
    403: [ErrorCode.FEATURE_DISABLED],
    404: [ErrorCode.GROUP_NOT_FOUND, ErrorCode.NOT_FOUND],
    409: [ErrorCode.E2EE_OFF],
  })
  takeGroupMlsLease(
    @CurrentUser() user: RequestUser,
    @Param() p: GroupIdParamDto,
    @Body() dto: GroupMlsLeaseDto,
  ): Promise<GroupMlsLeaseResultDto> {
    return this.e2ee.lease(user, p.id, dto.deviceId);
  }

  @Post(':id/key-packages/claim')
  // RFC 9750 §6.3: a per-person limit on claims, as in the chats.
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @HttpCode(200)
  @ApiOperation({
    summary: 'One KeyPackage per device to add (lease holder only)',
  })
  @ApiEnvelopeResponse(ClaimedKeyPackageDto, { isArray: true })
  @ApiErrors({
    400: [ErrorCode.VALIDATION_ERROR, ErrorCode.E2EE_MEMBERSHIP_INVALID],
    403: [ErrorCode.FEATURE_DISABLED],
    404: [ErrorCode.GROUP_NOT_FOUND, ErrorCode.NOT_FOUND],
    409: [ErrorCode.E2EE_OFF, ErrorCode.E2EE_EPOCH_CONFLICT],
  })
  claimGroupMlsKeyPackages(
    @CurrentUser() user: RequestUser,
    @Param() p: GroupIdParamDto,
    @Body() dto: GroupClaimKeyPackagesDto,
  ): Promise<ClaimedKeyPackageDto[]> {
    return this.e2ee.claimKeyPackages(user, p.id, dto.deviceId, dto.deviceIds);
  }

  @Post(':id/commits')
  @ApiOperation({
    summary: 'A commit for the group’s current epoch, with the next GroupInfo',
  })
  @ApiEnvelopeResponse(MlsEpochDto, { status: 201 })
  @ApiErrors({
    400: [ErrorCode.VALIDATION_ERROR, ErrorCode.E2EE_MEMBERSHIP_INVALID],
    403: [ErrorCode.FEATURE_DISABLED],
    404: [ErrorCode.GROUP_NOT_FOUND, ErrorCode.NOT_FOUND],
    409: [ErrorCode.E2EE_OFF, ErrorCode.E2EE_EPOCH_CONFLICT],
  })
  postGroupMlsCommit(
    @CurrentUser() user: RequestUser,
    @Param() p: GroupIdParamDto,
    @Body() dto: GroupMlsCommitDto,
  ): Promise<MlsEpochDto> {
    return this.e2ee.commit(user, p.id, dto);
  }

  @Get(':id/commits')
  @ApiOperation({ summary: 'Group commits from an epoch on (catch up)' })
  @ApiEnvelopeResponse(MlsCommitRowDto, { isArray: true })
  @ApiErrors({
    400: [ErrorCode.VALIDATION_ERROR],
    403: [ErrorCode.FEATURE_DISABLED],
    404: [ErrorCode.GROUP_NOT_FOUND],
  })
  listGroupMlsCommits(
    @CurrentUser() user: RequestUser,
    @Param() p: GroupIdParamDto,
    @Query() q: MlsCommitsQueryDto,
  ): Promise<MlsCommitRowDto[]> {
    return this.e2ee.commits(user, p.id, q.after ?? 0);
  }

  @Get(':id/group-info')
  @ApiOperation({
    summary: 'The latest GroupInfo with the ratchet tree (external join)',
  })
  @ApiEnvelopeResponse(GroupInfoResultDto)
  @ApiErrors({
    403: [ErrorCode.FEATURE_DISABLED],
    404: [ErrorCode.GROUP_NOT_FOUND, ErrorCode.NOT_FOUND],
  })
  getGroupInfo(
    @CurrentUser() user: RequestUser,
    @Param() p: GroupIdParamDto,
  ): Promise<GroupInfoResultDto> {
    return this.e2ee.groupInfo(user, p.id);
  }

  @Post(':id/external-commit')
  @ApiOperation({
    summary:
      'My device joins (or resyncs into) the group by external commit (members only)',
  })
  @ApiEnvelopeResponse(MlsEpochDto, { status: 201 })
  @ApiErrors({
    400: [ErrorCode.VALIDATION_ERROR, ErrorCode.E2EE_MEMBERSHIP_INVALID],
    403: [ErrorCode.FEATURE_DISABLED],
    404: [ErrorCode.GROUP_NOT_FOUND, ErrorCode.NOT_FOUND],
    409: [ErrorCode.E2EE_OFF, ErrorCode.E2EE_EPOCH_CONFLICT],
  })
  postGroupExternalCommit(
    @CurrentUser() user: RequestUser,
    @Param() p: GroupIdParamDto,
    @Body() dto: GroupExternalCommitDto,
  ): Promise<MlsEpochDto> {
    return this.e2ee.externalCommit(user, p.id, dto);
  }
}
