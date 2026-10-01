import {
  Controller,
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
} from '../../../common/dto/api-docs.decorators';
import { ErrorCode } from '../../../common/errors/error-code.enum';
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
  constructor(private readonly mine: MineService) {}

  @Get('users/me/cases/:id')
  @ApiOperation({ summary: "Owner's case detail (docs/04 §11.1)" })
  @ApiEnvelopeResponse(OwnerCaseDetailDto)
  @ApiErrors({ 404: [E.CASE_NOT_FOUND] })
  getMyCase(
    @CurrentUser() user: RequestUser,
    @Param() params: MineCaseIdParamDto,
  ): Promise<OwnerCaseDetailDto> {
    return this.mine.ownerCase(user, params.id);
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
