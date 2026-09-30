import { Controller, Get, Param } from '@nestjs/common';
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
import { PublicClientProfileDto } from '../dto/client-profile.dto';
import { ClientProfilesService } from '../services/client-profiles.service';

/**
 * Owner decision 2026-09-29 (OQ-026): a client's public mini-profile by
 * @username — what People search opens. Signed-in users of both roles.
 */
@ApiTags('clients')
@ApiBearerAuth()
@ApiErrors(AUTHENTICATED_ERRORS)
@Controller('clients')
export class ClientsController {
  constructor(private readonly clients: ClientProfilesService) {}

  @Get(':username')
  @ApiOperation({ summary: 'Public client mini-profile (OQ-026)' })
  @ApiEnvelopeResponse(PublicClientProfileDto)
  @ApiErrors({ 404: [ErrorCode.NOT_FOUND] })
  async getClientProfile(
    @CurrentUser() user: RequestUser,
    @Param('username') username: string,
  ): Promise<PublicClientProfileDto> {
    return this.clients.getPublic(username, user.sub, user.role);
  }
}
