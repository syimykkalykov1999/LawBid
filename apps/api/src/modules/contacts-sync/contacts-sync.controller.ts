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
  UploadContactHashesDto,
} from './contacts-sync.dto';
import { ContactsSyncService } from './contacts-sync.service';

/** Owner 2026-10-13: "Find people from your contacts". */
@ApiTags('contacts-sync')
@ApiBearerAuth()
@ApiErrors(AUTHENTICATED_ERRORS)
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
      'Upload SHA-256 hashes of address-book numbers (E.164); only matches with LawBid users are kept',
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
    return this.sync.upload(user.sub, dto.hashes, ip);
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
