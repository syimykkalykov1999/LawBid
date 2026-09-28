import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Put,
  Query,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { Throttle } from '@nestjs/throttler';
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
  OwnAttorneyProfileDto,
  PublicAttorneyProfileDto,
  UpdateAttorneyProfileDto,
  UsernameAvailabilityDto,
  UsernameAvailableQueryDto,
} from '../dto/attorney-profile.dto';
import {
  ReplacePracticeAreasDto,
  SelectedPracticeAreaDto,
} from '../dto/practice-areas.dto';
import { AttorneyProfilesService } from '../services/attorney-profiles.service';
import { PracticeAreasService } from '../services/practice-areas.service';

const E = ErrorCode;

/**
 * docs/03 §4.3 attorney profile API (stages 3.5–3.6). Every route needs
 * a bearer token (global JwtAuthGuard). Static paths are declared before
 * `:username`; `me` and `username-available` can never be usernames
 * (`me` is reserved, `-` is not an allowed character).
 */
@ApiTags('attorneys')
@ApiBearerAuth()
@ApiErrors(AUTHENTICATED_ERRORS)
@Controller('attorneys')
export class AttorneysController {
  constructor(
    private readonly profiles: AttorneyProfilesService,
    private readonly practices: PracticeAreasService,
  ) {}

  @Get('me/profile')
  @ApiEnvelopeResponse(OwnAttorneyProfileDto)
  @ApiErrors({ 403: [E.FORBIDDEN], 404: [E.NOT_FOUND] })
  async getMyAttorneyProfile(
    @CurrentUser() user: RequestUser,
  ): Promise<OwnAttorneyProfileDto> {
    return this.profiles.getOwn(user.sub);
  }

  @Patch('me/profile')
  @ApiEnvelopeResponse(OwnAttorneyProfileDto)
  @ApiErrors({
    400: [E.VALIDATION_ERROR, E.USERNAME_RESERVED],
    403: [E.FORBIDDEN],
    404: [E.NOT_FOUND],
    409: [E.USERNAME_TAKEN, E.USERNAME_CHANGE_TOO_SOON],
  })
  async updateMyAttorneyProfile(
    @CurrentUser() user: RequestUser,
    @Body() dto: UpdateAttorneyProfileDto,
  ): Promise<OwnAttorneyProfileDto> {
    return this.profiles.updateOwn(user.sub, dto);
  }

  @Get('me/practice-areas')
  @ApiEnvelopeResponse(SelectedPracticeAreaDto, { isArray: true })
  @ApiErrors({ 403: [E.FORBIDDEN], 404: [E.NOT_FOUND] })
  async getMyPracticeAreas(
    @CurrentUser() user: RequestUser,
  ): Promise<SelectedPracticeAreaDto[]> {
    return this.practices.selected(user.sub);
  }

  @Put('me/practice-areas')
  @ApiEnvelopeResponse(SelectedPracticeAreaDto, { isArray: true })
  @ApiErrors({
    400: [E.VALIDATION_ERROR],
    403: [E.FORBIDDEN, E.ATTORNEY_NOT_VERIFIED],
    404: [E.NOT_FOUND],
  })
  async replaceMyPracticeAreas(
    @CurrentUser() user: RequestUser,
    @Body() dto: ReplacePracticeAreasDto,
    @Req() req: Request,
  ): Promise<SelectedPracticeAreaDto[]> {
    return this.practices.replace(user.sub, dto.practiceAreaIds, req.ip);
  }

  /** Rate-limited (§4.3): an enumeration aid otherwise. */
  @Get('username-available')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @ApiEnvelopeResponse(UsernameAvailabilityDto)
  @ApiErrors({ 400: [E.VALIDATION_ERROR] })
  async checkUsernameAvailable(
    @CurrentUser() user: RequestUser,
    @Query() query: UsernameAvailableQueryDto,
  ): Promise<UsernameAvailabilityDto> {
    return this.profiles.availability(query.u, user.sub);
  }

  @Get(':username')
  @ApiEnvelopeResponse(PublicAttorneyProfileDto)
  @ApiErrors({ 404: [E.NOT_FOUND] })
  async getAttorneyProfile(
    @CurrentUser() user: RequestUser,
    @Param('username') username: string,
  ): Promise<PublicAttorneyProfileDto> {
    return this.profiles.getPublic(username, user.sub);
  }
}
