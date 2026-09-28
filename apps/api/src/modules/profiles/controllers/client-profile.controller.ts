import { Body, Controller, Get, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
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
import {
  ClientProfileDto,
  UpdateClientProfileDto,
  UpdateContactPreferencesDto,
} from '../dto/client-profile.dto';
import { ClientProfilesService } from '../services/client-profiles.service';

const E = ErrorCode;

/**
 * docs/03 §5 client profile API: `GET/PATCH /users/me/profile`, `PATCH
 * /users/me/contact-preferences`. Own profile only — there is no route
 * that reads another user's client profile; non-clients get 404.
 */
@ApiTags('profiles')
@ApiBearerAuth()
@ApiErrors(AUTHENTICATED_ERRORS)
@Controller('users/me')
export class ClientProfileController {
  constructor(private readonly clients: ClientProfilesService) {}

  @Get('profile')
  @ApiEnvelopeResponse(ClientProfileDto)
  @ApiErrors({ 404: [E.NOT_FOUND] })
  async getMyClientProfile(
    @CurrentUser() user: RequestUser,
  ): Promise<ClientProfileDto> {
    return this.clients.getOwn(user.sub);
  }

  @Patch('profile')
  @ApiEnvelopeResponse(ClientProfileDto)
  @ApiErrors({ 400: [E.VALIDATION_ERROR], 404: [E.NOT_FOUND] })
  async updateMyClientProfile(
    @CurrentUser() user: RequestUser,
    @Body() dto: UpdateClientProfileDto,
  ): Promise<ClientProfileDto> {
    return this.clients.update(user.sub, dto);
  }

  @Patch('contact-preferences')
  @ApiEnvelopeResponse(ClientProfileDto)
  @ApiErrors({ 400: [E.VALIDATION_ERROR], 404: [E.NOT_FOUND] })
  async updateMyContactPreferences(
    @CurrentUser() user: RequestUser,
    @Body() dto: UpdateContactPreferencesDto,
  ): Promise<ClientProfileDto> {
    return this.clients.update(user.sub, dto);
  }
}
