import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ApiEnvelopeResponse,
  ApiErrors,
  AUTHENTICATED_ERRORS,
} from '../../../common/dto/api-docs.decorators';
import { ErrorCode } from '../../../common/errors/error-code.enum';
import { conditionalGet } from '../../../common/sync/cheap-etag';
import { VersionEtagService } from '../../../common/sync/version-etag.service';
import {
  CurrentUser,
  type RequestUser,
} from '../../auth/decorators/current-user.decorator';
import {
  CaseConversationDto,
  ListMyBidsQueryDto,
  ListMyWorkQueryDto,
  ListSavedCasesQueryDto,
  MineCaseIdParamDto,
  MyBidItemDto,
  OwnerCaseDetailDto,
  SavedCaseItemDto,
  WorkItemDto,
  type Page,
} from './dto/mine.dto';
import { MineService } from './mine.service';

const E = ErrorCode;

/**
 * docs/04 §11 "Моё" + §15 (stages 4.9/4.10). The owner's case detail is
 * `GET /users/me/cases/:id` (the typed contract needs one response shape
 * per route; `GET /cases/:id` stays the attorney representation, §4.3).
 */
@ApiTags('mine')
@ApiBearerAuth()
@ApiErrors(AUTHENTICATED_ERRORS)
@Controller()
export class MineController {
  constructor(
    private readonly mine: MineService,
    private readonly versionEtag: VersionEtagService,
  ) {}

  @Get('users/me/cases/:id')
  @ApiOperation({ summary: "Owner's case detail (docs/04 §11.1)" })
  @ApiEnvelopeResponse(OwnerCaseDetailDto)
  @ApiErrors({ 404: [E.CASE_NOT_FOUND] })
  async getMyCase(
    @CurrentUser() user: RequestUser,
    @Param() params: MineCaseIdParamDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<OwnerCaseDetailDto | undefined> {
    // Owner 2026-10-25 (S2-12): a version tag computed before the queries;
    // a match is a 304 once ownership is checked and the "opened" ping
    // (OQ-054) is recorded, exactly as the full path does.
    return conditionalGet(
      req,
      res,
      user.role === 'client'
        ? await this.versionEtag.caseDetail(user.sub, params.id, 'owner')
        : null,
      () => this.mine.touchOwnerCase(user, params.id),
      () => this.mine.ownerCase(user, params.id),
    );
  }

  @Get('users/me/bids')
  @ApiOperation({ summary: '"My bids" (attorney, docs/04 §11.2)' })
  @ApiEnvelopeResponse(MyBidItemDto, { isArray: true })
  @ApiErrors({ 400: [E.VALIDATION_ERROR], 403: [E.FORBIDDEN] })
  listMyBids(
    @CurrentUser() user: RequestUser,
    @Query() query: ListMyBidsQueryDto,
  ): Promise<Page<MyBidItemDto>> {
    return this.mine.myBids(
      user,
      query.filter ?? 'active',
      query.cursor,
      query.limit,
      query,
      query.updatedSince,
    );
  }

  @Get('users/me/work')
  @ApiOperation({ summary: '"In progress" / "Completed" (attorney, §11.2)' })
  @ApiEnvelopeResponse(WorkItemDto, { isArray: true })
  @ApiErrors({ 400: [E.VALIDATION_ERROR], 403: [E.FORBIDDEN] })
  listMyWork(
    @CurrentUser() user: RequestUser,
    @Query() query: ListMyWorkQueryDto,
  ): Promise<Page<WorkItemDto>> {
    return this.mine.myWork(
      user,
      query.filter ?? 'active',
      query.cursor,
      query.limit,
      query,
      query.updatedSince,
    );
  }

  @Get('saved-items')
  @ApiOperation({ summary: 'Saved cases (docs/04 §11.2 "Сохранённое")' })
  @ApiEnvelopeResponse(SavedCaseItemDto, { isArray: true })
  @ApiErrors({ 400: [E.VALIDATION_ERROR] })
  listSavedItems(
    @CurrentUser() user: RequestUser,
    @Query() query: ListSavedCasesQueryDto,
  ): Promise<Page<SavedCaseItemDto>> {
    return this.mine.savedCases(user, query.cursor, query.limit, query);
  }

  @Post('cases/:id/conversation')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '"Message the client" (attorney, docs/04 §9)' })
  @ApiEnvelopeResponse(CaseConversationDto)
  @ApiErrors({
    403: [E.FORBIDDEN, E.SUBSCRIPTION_REQUIRED],
    404: [E.CASE_NOT_AVAILABLE],
    409: [E.CASE_INVALID_STATE],
  })
  openCaseConversation(
    @CurrentUser() user: RequestUser,
    @Param() params: MineCaseIdParamDto,
  ): Promise<CaseConversationDto> {
    return this.mine.openConversation(user, params.id);
  }
}
