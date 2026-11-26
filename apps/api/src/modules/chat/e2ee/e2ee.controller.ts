import { Throttle } from '@nestjs/throttler';
import {
  Body,
  Controller,
  Delete,
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
import { ConversationIdParamDto } from '../chat.dto';
import {
  ClaimedKeyPackageDto,
  ClaimKeyPackagesDto,
  ConversationE2eeDto,
  CreateMlsGroupDto,
  E2eeBackupDto,
  E2eeBackupPutDto,
  E2eeDeviceIdParamDto,
  E2eeReportDto,
  E2eeReportResultDto,
  KeyPackageCountDto,
  MlsCommitDto,
  MlsCommitRowDto,
  MlsCommitsQueryDto,
  MlsDeviceDto,
  MlsEpochDto,
  MlsRejoinDto,
  MlsWelcomeDto,
  MlsWelcomesQueryDto,
  RegisterMlsDeviceDto,
  UploadKeyPackagesDto,
} from './e2ee.dto';
import { E2eeService } from './e2ee.service';

/** Item 25 (docs/architecture/E2EE_MLS_PLAN_2026-11-25.md §3): the MLS
 * Delivery Service. Messages themselves go through
 * POST /conversations/:id/messages with type=mls. */
@ApiTags('e2ee')
@ApiBearerAuth()
@ApiErrors(AUTHENTICATED_ERRORS)
@RequiresDuty('chats')
@Controller('e2ee')
export class E2eeController {
  constructor(private readonly e2ee: E2eeService) {}

  @Post('devices')
  @ApiOperation({ summary: 'Register this device’s MLS signature key' })
  @ApiEnvelopeResponse(MlsDeviceDto, { status: 201 })
  @ApiErrors({
    400: [ErrorCode.VALIDATION_ERROR],
    409: [ErrorCode.E2EE_DEVICE_LIMIT, ErrorCode.E2EE_MEMBERSHIP_INVALID],
  })
  registerMlsDevice(
    @CurrentUser() user: RequestUser,
    @Body() dto: RegisterMlsDeviceDto,
  ): Promise<MlsDeviceDto> {
    return this.e2ee.registerDevice(user, dto);
  }

  @Get('devices')
  @ApiOperation({ summary: 'My devices that read encrypted chats' })
  @ApiEnvelopeResponse(MlsDeviceDto, { isArray: true })
  listMlsDevices(@CurrentUser() user: RequestUser): Promise<MlsDeviceDto[]> {
    return this.e2ee.myDevices(user);
  }

  @Delete('devices/:id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Sign a device out of encrypted chats' })
  @ApiErrors({ 404: [ErrorCode.NOT_FOUND] })
  revokeMlsDevice(
    @CurrentUser() user: RequestUser,
    @Param() p: E2eeDeviceIdParamDto,
  ): Promise<void> {
    return this.e2ee.revokeDevice(user, p.id);
  }

  @Post('devices/:id/key-packages')
  @HttpCode(200)
  @ApiOperation({ summary: 'Upload one-time and last-resort KeyPackages' })
  @ApiEnvelopeResponse(KeyPackageCountDto)
  @ApiErrors({
    400: [ErrorCode.VALIDATION_ERROR],
    404: [ErrorCode.NOT_FOUND],
  })
  uploadMlsKeyPackages(
    @CurrentUser() user: RequestUser,
    @Param() p: E2eeDeviceIdParamDto,
    @Body() dto: UploadKeyPackagesDto,
  ): Promise<KeyPackageCountDto> {
    return this.e2ee.uploadKeyPackages(user, p.id, dto);
  }

  @Get('devices/:id/key-packages/count')
  @ApiOperation({ summary: 'How many KeyPackages this device has left' })
  @ApiEnvelopeResponse(KeyPackageCountDto)
  @ApiErrors({ 404: [ErrorCode.NOT_FOUND] })
  countMlsKeyPackages(
    @CurrentUser() user: RequestUser,
    @Param() p: E2eeDeviceIdParamDto,
  ): Promise<KeyPackageCountDto> {
    return this.e2ee.keyPackageCount(user, p.id);
  }

  @Get('welcomes')
  @ApiOperation({ summary: 'Welcomes waiting for one of my devices' })
  @ApiEnvelopeResponse(MlsWelcomeDto, { isArray: true })
  @ApiErrors({ 404: [ErrorCode.NOT_FOUND] })
  listMlsWelcomes(
    @CurrentUser() user: RequestUser,
    @Query() q: MlsWelcomesQueryDto,
  ): Promise<MlsWelcomeDto[]> {
    return this.e2ee.welcomes(user, q.deviceId);
  }

  @Delete('welcomes/:id')
  @HttpCode(204)
  @ApiOperation({ summary: 'The device joined from this Welcome' })
  @ApiErrors({ 404: [ErrorCode.NOT_FOUND] })
  ackMlsWelcome(
    @CurrentUser() user: RequestUser,
    @Param() p: E2eeDeviceIdParamDto,
  ): Promise<void> {
    return this.e2ee.ackWelcome(user, p.id);
  }

  @Get('conversations/:id')
  @ApiOperation({ summary: 'Is this chat end-to-end encrypted, and its group' })
  @ApiEnvelopeResponse(ConversationE2eeDto)
  @ApiErrors({ 404: [ErrorCode.CONVERSATION_NOT_FOUND] })
  getConversationE2ee(
    @CurrentUser() user: RequestUser,
    @Param() p: ConversationIdParamDto,
  ): Promise<ConversationE2eeDto> {
    return this.e2ee.conversationState(user, p.id);
  }

  @Post('conversations/:id/group')
  @ApiOperation({ summary: 'Create the chat’s MLS group (epoch 0)' })
  @ApiEnvelopeResponse(ConversationE2eeDto, { status: 201 })
  @ApiErrors({
    400: [ErrorCode.VALIDATION_ERROR],
    404: [ErrorCode.CONVERSATION_NOT_FOUND, ErrorCode.NOT_FOUND],
    409: [ErrorCode.E2EE_OFF, ErrorCode.E2EE_EPOCH_CONFLICT],
  })
  createMlsGroup(
    @CurrentUser() user: RequestUser,
    @Param() p: ConversationIdParamDto,
    @Body() dto: CreateMlsGroupDto,
  ): Promise<ConversationE2eeDto> {
    return this.e2ee.createGroup(user, p.id, dto);
  }

  @Post('conversations/:id/key-packages/claim')
  // RFC 9750 §6.3: a per-person limit on claims (a real add takes one
  // claim per commit), so nobody drains another person's KeyPackages.
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @HttpCode(200)
  @ApiOperation({ summary: 'One KeyPackage per device to add' })
  @ApiEnvelopeResponse(ClaimedKeyPackageDto, { isArray: true })
  @ApiErrors({
    400: [ErrorCode.VALIDATION_ERROR, ErrorCode.E2EE_MEMBERSHIP_INVALID],
    404: [ErrorCode.CONVERSATION_NOT_FOUND],
  })
  claimMlsKeyPackages(
    @CurrentUser() user: RequestUser,
    @Param() p: ConversationIdParamDto,
    @Body() dto: ClaimKeyPackagesDto,
  ): Promise<ClaimedKeyPackageDto[]> {
    return this.e2ee.claimKeyPackages(user, p.id, dto.deviceIds);
  }

  @Post('conversations/:id/rejoin')
  @HttpCode(204)
  @ApiOperation({
    summary: 'My device could not join from its Welcome: re-add it',
  })
  @ApiErrors({
    400: [ErrorCode.VALIDATION_ERROR],
    404: [ErrorCode.CONVERSATION_NOT_FOUND, ErrorCode.NOT_FOUND],
  })
  requestMlsRejoin(
    @CurrentUser() user: RequestUser,
    @Param() p: ConversationIdParamDto,
    @Body() dto: MlsRejoinDto,
  ): Promise<void> {
    return this.e2ee.requestRejoin(user, p.id, dto.deviceId);
  }

  @Post('conversations/:id/commits')
  @ApiOperation({
    summary: 'A commit for the group’s current epoch (adds / removes)',
  })
  @ApiEnvelopeResponse(MlsEpochDto, { status: 201 })
  @ApiErrors({
    400: [ErrorCode.VALIDATION_ERROR, ErrorCode.E2EE_MEMBERSHIP_INVALID],
    404: [ErrorCode.CONVERSATION_NOT_FOUND, ErrorCode.NOT_FOUND],
    409: [ErrorCode.E2EE_OFF, ErrorCode.E2EE_EPOCH_CONFLICT],
  })
  postMlsCommit(
    @CurrentUser() user: RequestUser,
    @Param() p: ConversationIdParamDto,
    @Body() dto: MlsCommitDto,
  ): Promise<MlsEpochDto> {
    return this.e2ee.commit(user, p.id, dto);
  }

  @Post('conversations/:id/reports')
  @ApiOperation({
    summary:
      'Report a person of an encrypted chat with their last messages (WhatsApp)',
  })
  @ApiEnvelopeResponse(E2eeReportResultDto, { status: 201 })
  @ApiErrors({
    400: [ErrorCode.VALIDATION_ERROR, ErrorCode.E2EE_MEMBERSHIP_INVALID],
    404: [ErrorCode.CONVERSATION_NOT_FOUND],
  })
  reportInE2eeChat(
    @CurrentUser() user: RequestUser,
    @Param() p: ConversationIdParamDto,
    @Body() dto: E2eeReportDto,
  ): Promise<E2eeReportResultDto> {
    return this.e2ee.report(user, p.id, dto);
  }

  @Get('backup')
  @ApiOperation({ summary: 'My encrypted chat backup' })
  @ApiEnvelopeResponse(E2eeBackupDto)
  @ApiErrors({ 404: [ErrorCode.NOT_FOUND] })
  getE2eeBackup(@CurrentUser() user: RequestUser): Promise<E2eeBackupDto> {
    return this.e2ee.backup(user);
  }

  @Post('backup')
  @HttpCode(200)
  @ApiOperation({ summary: 'Keep this encrypted file as my backup' })
  @ApiEnvelopeResponse(E2eeBackupDto)
  @ApiErrors({
    400: [ErrorCode.VALIDATION_ERROR],
    404: [ErrorCode.NOT_FOUND],
  })
  putE2eeBackup(
    @CurrentUser() user: RequestUser,
    @Body() dto: E2eeBackupPutDto,
  ): Promise<E2eeBackupDto> {
    return this.e2ee.putBackup(user, dto.fileId, dto.keyId);
  }

  @Delete('backup')
  @HttpCode(204)
  @ApiOperation({ summary: 'Delete my encrypted chat backup' })
  deleteE2eeBackup(@CurrentUser() user: RequestUser): Promise<void> {
    return this.e2ee.deleteBackup(user);
  }

  @Get('conversations/:id/commits')
  @ApiOperation({ summary: 'Commits from an epoch on (catch up)' })
  @ApiEnvelopeResponse(MlsCommitRowDto, { isArray: true })
  @ApiErrors({
    400: [ErrorCode.VALIDATION_ERROR],
    404: [ErrorCode.CONVERSATION_NOT_FOUND],
  })
  listMlsCommits(
    @CurrentUser() user: RequestUser,
    @Param() p: ConversationIdParamDto,
    @Query() q: MlsCommitsQueryDto,
  ): Promise<MlsCommitRowDto[]> {
    return this.e2ee.commits(user, p.id, q.after ?? 0);
  }
}
