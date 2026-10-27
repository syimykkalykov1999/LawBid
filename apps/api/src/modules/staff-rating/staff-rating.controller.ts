import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ApiEnvelopeResponse,
  ApiErrors,
} from '../../common/dto/api-docs.decorators';
import { ErrorCode as E } from '../../common/errors/error-code.enum';
import {
  AdminEndpoint,
  CurrentAdmin,
  type AdminActor,
} from '../admin-auth/admin-auth.decorators';
import {
  StaffAdminParamDto,
  StaffPeopleListDto,
  StaffPeopleQueryDto,
  StaffPersonDetailDto,
  StaffShortlistDto,
  StaffShortlistQueryDto,
  StaffSuggestionListDto,
  StaffSuggestionsQueryDto,
} from './staff-rating.dto';
import {
  StaffRatingReadService,
  ratingScope,
} from './staff-rating-read.service';

/**
 * Staff package T5 (plan B3): `admin/staff/people` — the rating of the
 * staff, read from the nightly snapshots only. The owner reads every
 * workspace, a workspace head only their own; anybody else, and every
 * request while `staff.rating_enabled` is off, gets «not found».
 */
// flag: staff.rating_enabled — off (the default) answers 404, nothing is read
@ApiTags('admin-staff')
@AdminEndpoint('super_admin', 'moderator', 'verifier', 'support', 'finance')
@Controller('admin/staff/people')
export class StaffRatingController {
  constructor(private readonly read: StaffRatingReadService) {}

  @Get()
  @ApiOperation({
    summary: 'Staff rating list (latest nightly snapshot), worst first',
  })
  @ApiEnvelopeResponse(StaffPeopleListDto)
  @ApiErrors({ 400: [E.VALIDATION_ERROR], 404: [E.NOT_FOUND] })
  staffPeople(
    @CurrentAdmin() admin: AdminActor,
    @Query() q: StaffPeopleQueryDto,
  ): Promise<StaffPeopleListDto> {
    return this.read.people(ratingScope(admin, q.workspace), q);
  }

  @Get(':adminId')
  @ApiOperation({
    summary: 'One person: rating, components, evidence and suggestions',
  })
  @ApiEnvelopeResponse(StaffPersonDetailDto)
  @ApiErrors({ 400: [E.VALIDATION_ERROR], 404: [E.NOT_FOUND] })
  staffPerson(
    @CurrentAdmin() admin: AdminActor,
    @Param() p: StaffAdminParamDto,
  ): Promise<StaffPersonDetailDto> {
    return this.read.person(ratingScope(admin), p.adminId);
  }
}

/**
 * Staff package T5 (plan B3): `admin/staff/shortlist` («плохие» and
 * «лучшие», at most 20 each) and `admin/staff/suggestions` — what the
 * system suggests about people; a human applies it (T10).
 */
// flag: staff.rating_enabled — off (the default) answers 404, nothing is read
@ApiTags('admin-staff')
@AdminEndpoint('super_admin', 'moderator', 'verifier', 'support', 'finance')
@Controller('admin/staff')
export class StaffShortlistController {
  constructor(private readonly read: StaffRatingReadService) {}

  @Get('shortlist')
  @ApiOperation({
    summary: 'The short list: the worst and the best (≤ 20 each)',
  })
  @ApiEnvelopeResponse(StaffShortlistDto)
  @ApiErrors({ 400: [E.VALIDATION_ERROR], 404: [E.NOT_FOUND] })
  staffShortlist(
    @CurrentAdmin() admin: AdminActor,
    @Query() q: StaffShortlistQueryDto,
  ): Promise<StaffShortlistDto> {
    return this.read.shortlist(ratingScope(admin, q.workspace));
  }

  @Get('suggestions')
  @ApiOperation({
    summary: 'What the system suggests about people (open by default)',
  })
  @ApiEnvelopeResponse(StaffSuggestionListDto)
  @ApiErrors({ 400: [E.VALIDATION_ERROR], 404: [E.NOT_FOUND] })
  staffSuggestions(
    @CurrentAdmin() admin: AdminActor,
    @Query() q: StaffSuggestionsQueryDto,
  ): Promise<StaffSuggestionListDto> {
    return this.read.suggestions(ratingScope(admin, q.workspace), q);
  }
}
