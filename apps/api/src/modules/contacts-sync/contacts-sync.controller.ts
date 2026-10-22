import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Ip,
  Post,
  Put,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ApiEnvelopeResponse,
  ApiErrors,
  AUTHENTICATED_ERRORS,
} from '../../common/dto/api-docs.decorators';
import { ErrorCode } from '../../common/errors/error-code.enum';
import {
  CurrentUser,
  type RequestUser,
} from '../auth/decorators/current-user.decorator';
import {
  ContactSyncStatusDto,
  ContactUploadResultDto,
  SetFindByPhoneDto,
  SetNotifyJoinedDto,
  UploadContactHashesDto,
} from './contacts-sync.dto';
import { ContactsSyncService } from './contacts-sync.service';
import { AssistantSelf } from '../auth/assistant/assistant-context';

/** Owner 2026-10-13: "Find people from your contacts". */
@ApiTags('contacts-sync')
@ApiBearerAuth()
@ApiErrors(AUTHENTICATED_ERRORS)
// Owner 2026-10-22 (security audit #3): the address book on an assistant's
// phone is the assistant's own — it must not be stored under (or matched
// for) the attorney's account. The assistant syncs as themself.
@AssistantSelf()
@Controller()
export class ContactsSyncController {
  constructor(private readonly sync: ContactsSyncService) {}

  @Get('contacts/sync')
  @ApiOperation({ summary: 'Contacts sync: on/off, matches, last sync' })
  @ApiEnvelopeResponse(ContactSyncStatusDto)
  status(@CurrentUser() user: RequestUser): Promise<ContactSyncStatusDto> {
    return this.sync.status(user.sub);
  }

  @Post('contacts/sync')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Contacts sync: "changed?" by book hash, then only added / removed SHA-256 hashes of E.164 numbers (old builds: {hashes})',
  })
  @ApiEnvelopeResponse(ContactUploadResultDto)
  @ApiErrors({
    400: [ErrorCode.VALIDATION_ERROR],
    429: [ErrorCode.RATE_LIMITED],
  })
  upload(
    @CurrentUser() user: RequestUser,
    @Body() dto: UploadContactHashesDto,
    @Ip() ip: string,
  ): Promise<ContactUploadResultDto> {
    // Owner 2026-10-22: old builds send {hashes}; new ones the hash-checked
    // delta (UploadContactHashesDto).
    return dto.hashes
      ? this.sync.upload(user.sub, dto.hashes, ip)
      : this.sync.sync(user.sub, dto, ip);
  }

  @Put('contacts/sync/notify-joined')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: '«Notify me when contacts join LawBid» on or off',
  })
  @ApiErrors({ 400: [ErrorCode.VALIDATION_ERROR] })
  setNotifyJoined(
    @CurrentUser() user: RequestUser,
    @Body() dto: SetNotifyJoinedDto,
  ): Promise<void> {
    return this.sync.setNotifyJoined(user.sub, dto.enabled);
  }

  @Put('contacts/sync/find-by-phone')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary:
      'Clients: allow or forbid being found by people who have my number',
  })
  @ApiErrors({ 400: [ErrorCode.VALIDATION_ERROR] })
  setFindByPhone(
    @CurrentUser() user: RequestUser,
    @Body() dto: SetFindByPhoneDto,
  ): Promise<void> {
    return this.sync.setFindByPhone(user.sub, dto.enabled);
  }

  @Delete('contacts/sync')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Turn contacts sync off and delete every match (idempotent)',
  })
  remove(@CurrentUser() user: RequestUser): Promise<void> {
    return this.sync.remove(user.sub);
  }
}
