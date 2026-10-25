import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Put,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { AnonymousCache } from '../../../common/cache/http-cache';
import { OptionalAuth } from '../../auth/decorators/optional-auth.decorator';
import type { Request, Response } from 'express';
import { notModified } from '../../../common/sync/cheap-etag';
import { Throttle } from '@nestjs/throttler';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  ApiEnvelopeResponse,
  ApiErrors,
  AUTHENTICATED_ERRORS,
} from '../../../common/dto/api-docs.decorators';
import {
  ApiIfMatchVersion,
  ExpectedVersion,
} from '../../../common/concurrency/optimistic-lock';
import { ErrorCode } from '../../../common/errors/error-code.enum';
import {
  CurrentUser,
  type RequestUser,
} from '../../auth/decorators/current-user.decorator';
import { AttorneyStatsDto } from '../dto/attorney-stats.dto';
import {
  OwnAttorneyProfileDto,
  PublicAttorneyProfileDto,
  UpdateAttorneyProfileDto,
  UsernameAvailabilityDto,
  UsernameAvailableQueryDto,
  UsernameSuggestionsDto,
  UsernameSuggestionsQueryDto,
} from '../dto/attorney-profile.dto';
import {
  ReplacePracticeAreasDto,
  SelectedPracticeAreaDto,
} from '../dto/practice-areas.dto';
import { AttorneyProfilesService } from '../services/attorney-profiles.service';
import { PracticeAreasService } from '../services/practice-areas.service';
import { AttorneyOnly } from '../../auth/assistant/assistant-context';

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

  @Get('me/stats')
  @ApiEnvelopeResponse(AttorneyStatsDto)
  @ApiErrors({ 403: [E.FORBIDDEN] })
  async getMyStats(
    @CurrentUser() user: RequestUser,
  ): Promise<AttorneyStatsDto> {
    return this.profiles.stats(user.sub);
  }

  @AttorneyOnly()
  @Patch('me/profile')
  @ApiIfMatchVersion()
  @ApiEnvelopeResponse(OwnAttorneyProfileDto)
  @ApiErrors({
    400: [E.VALIDATION_ERROR, E.USERNAME_RESERVED],
    403: [E.FORBIDDEN],
    404: [E.NOT_FOUND],
    409: [E.USERNAME_TAKEN, E.USERNAME_CHANGE_TOO_SOON, E.STALE_VERSION],
  })
  async updateMyAttorneyProfile(
    @CurrentUser() user: RequestUser,
    @Body() dto: UpdateAttorneyProfileDto,
    @ExpectedVersion() expectedVersion?: number,
  ): Promise<OwnAttorneyProfileDto> {
    return this.profiles.updateOwn(user.sub, dto, new Date(), expectedVersion);
  }

  @Get('me/practice-areas')
  @ApiEnvelopeResponse(SelectedPracticeAreaDto, { isArray: true })
  @ApiErrors({ 403: [E.FORBIDDEN], 404: [E.NOT_FOUND] })
  async getMyPracticeAreas(
    @CurrentUser() user: RequestUser,
  ): Promise<SelectedPracticeAreaDto[]> {
    return this.practices.selected(user.sub);
  }

  @AttorneyOnly()
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
    return this.profiles.availability(query.u, user.sub, {
      first: query.first,
      last: query.last,
    });
  }

  /** Owner 2026-10-18 («как в инсте»): free handles for the sign-up and
   * edit forms. Rate-limited like the availability check. */
  @Get('username-suggestions')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @ApiEnvelopeResponse(UsernameSuggestionsDto)
  @ApiErrors({ 400: [E.VALIDATION_ERROR] })
  async usernameSuggestions(
    @CurrentUser() user: RequestUser,
    @Query() query: UsernameSuggestionsQueryDto,
  ): Promise<UsernameSuggestionsDto> {
    return {
      suggestions: await this.profiles.suggestions(user.sub, {
        first: query.first,
        last: query.last,
        typed: query.u,
      }),
    };
  }

  @OptionalAuth()
  @AnonymousCache(30)
  @Get(':username')
  @ApiEnvelopeResponse(PublicAttorneyProfileDto)
  @ApiErrors({ 404: [E.NOT_FOUND] })
  async getAttorneyProfile(
    @CurrentUser() user: RequestUser,
    @Param('username') username: string,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<PublicAttorneyProfileDto | undefined> {
    // Owner 2026-10-22 (client economy plan, package D): the cheap ETag is
    // checked before the profile queries run; a match is a 304 (0 further
    // queries, no body).
    const tag = await this.profiles.publicEtag(username, user.sub);
    if (tag && notModified(req, res, tag)) return undefined;
    return this.profiles.getPublic(username, user.sub);
  }
}
