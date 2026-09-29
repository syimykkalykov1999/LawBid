import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
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
  CaseDetailForAttorneyDto,
  CaseFeedItemDto,
  CaseIdParamDto,
  ListCasesFeedQueryDto,
  SavedItemDto,
  type CaseFeedPage,
} from './dto/cases-feed.dto';
import { CasesFeedService } from './services/cases-feed.service';

const E = ErrorCode;

/**
 * docs/04_CASES_BIDS.md §4 (stage 4.3): the attorney "Cases" tab, case
 * detail (no client field, ever) and view tracking, plus "Save"
 * (§4.3/§11.2). Kept out of CasesController (stage 4.2's client-facing
 * case creation/management) so the two stages don't edit the same file.
 *
 * `GET /cases/:id` is the one route both an owning client and an
 * eligible attorney can hit — docs/04 §15 "разные представления по
 * роли" — but stage 4.2's acceptance list only covers case creation and
 * `GET /users/me/cases`, not this route, so it is implemented here for
 * the attorney representation; CaseAccessPolicy.decide already resolves
 * both roles' access if a client-owner representation is added later.
 */
@ApiTags('cases')
@ApiBearerAuth()
@ApiErrors(AUTHENTICATED_ERRORS)
@Controller()
export class CasesFeedController {
  constructor(private readonly feed: CasesFeedService) {}

  @Get('cases')
  @ApiOperation({ summary: 'Attorney case feed (docs/04 §4.2)' })
  @ApiEnvelopeResponse(CaseFeedItemDto, { isArray: true })
  @ApiErrors({ 400: [E.VALIDATION_ERROR], 403: [E.FORBIDDEN] })
  list(
    @CurrentUser() user: RequestUser,
    @Query() query: ListCasesFeedQueryDto,
  ): Promise<CaseFeedPage> {
    return this.feed.listFeed({ userId: user.sub, role: user.role }, query);
  }

  @Get('cases/:id')
  @ApiOperation({
    summary: 'Case detail for an attorney (docs/04 §4.3, no client field)',
  })
  @ApiEnvelopeResponse(CaseDetailForAttorneyDto)
  @ApiErrors({ 404: [E.CASE_NOT_AVAILABLE] })
  detail(
    @CurrentUser() user: RequestUser,
    @Param() params: CaseIdParamDto,
  ): Promise<CaseDetailForAttorneyDto> {
    return this.feed.getDetailForAttorney(user.sub, params.id);
  }

  @Post('cases/:id/view')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Record a view, deduplicated per (attorney, case) (docs/04 §4.3)',
  })
  @ApiErrors({ 404: [E.CASE_NOT_AVAILABLE] })
  async view(
    @CurrentUser() user: RequestUser,
    @Param() params: CaseIdParamDto,
  ): Promise<void> {
    await this.feed.recordView(user.sub, params.id);
  }

  @Post('saved-items')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Save a case (docs/04 §4.3 "Сохранить", §11.2)' })
  @ApiErrors({
    400: [E.VALIDATION_ERROR],
    403: [E.FORBIDDEN],
    404: [E.CASE_NOT_AVAILABLE],
    501: [E.NOT_IMPLEMENTED],
  })
  async saveItem(
    @CurrentUser() user: RequestUser,
    @Body() dto: SavedItemDto,
  ): Promise<void> {
    await this.feed.save({ userId: user.sub, role: user.role }, dto);
  }

  @Delete('saved-items')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Unsave a case' })
  @ApiErrors({ 400: [E.VALIDATION_ERROR], 501: [E.NOT_IMPLEMENTED] })
  async unsaveItem(
    @CurrentUser() user: RequestUser,
    @Body() dto: SavedItemDto,
  ): Promise<void> {
    await this.feed.unsave({ userId: user.sub, role: user.role }, dto);
  }
}
