import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Query,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiHeader,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import {
  ApiEnvelopeResponse,
  ApiErrors,
  AUTHENTICATED_ERRORS,
} from '../../common/dto/api-docs.decorators';
import { ErrorCode } from '../../common/errors/error-code.enum';
import { IdempotencyInterceptor } from '../../idempotency/idempotency.interceptor';
import {
  CurrentUser,
  type RequestUser,
} from '../auth/decorators/current-user.decorator';
import {
  AnswerBodyDto,
  AnswerDto,
  AnswerParamDto,
  AskQuestionDto,
  BestAnswerDto,
  QuestionDetailDto,
  QuestionDto,
  QuestionIdParamDto,
  QuestionsQueryDto,
  type QuestionPage,
} from './legal-qa.dto';
import { LegalQaService } from './legal-qa.service';

const E = ErrorCode;
const IDEMPOTENCY_HEADER = { name: 'Idempotency-Key', required: false };

/** Owner 2026-10-20: «Вопрос юристу». Reports go through `POST /reports`. */
@ApiTags('questions')
@ApiBearerAuth()
@ApiErrors(AUTHENTICATED_ERRORS)
@Controller('questions')
export class LegalQaController {
  constructor(private readonly qa: LegalQaService) {}

  @Get()
  @ApiOperation({ summary: 'Public questions to lawyers (search, filters)' })
  @ApiEnvelopeResponse(QuestionDto, { isArray: true })
  @ApiErrors({ 400: [E.VALIDATION_ERROR], 403: [E.FEATURE_DISABLED] })
  list(
    @CurrentUser() user: RequestUser,
    @Query() query: QuestionsQueryDto,
  ): Promise<QuestionPage> {
    return this.qa.list(user, query);
  }

  @Post()
  @UseInterceptors(IdempotencyInterceptor)
  @ApiOperation({ summary: 'Ask a question (client)' })
  @ApiHeader(IDEMPOTENCY_HEADER)
  @ApiEnvelopeResponse(QuestionDto, { status: HttpStatus.CREATED })
  @ApiErrors({
    400: [E.VALIDATION_ERROR],
    403: [E.FORBIDDEN, E.FEATURE_DISABLED],
    429: [E.RATE_LIMITED],
  })
  ask(@CurrentUser() user: RequestUser, @Body() dto: AskQuestionDto) {
    return this.qa.ask(user, dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'A question with its answers' })
  @ApiEnvelopeResponse(QuestionDetailDto)
  @ApiErrors({ 400: [E.VALIDATION_ERROR], 404: [E.NOT_FOUND] })
  get(@CurrentUser() user: RequestUser, @Param() p: QuestionIdParamDto) {
    return this.qa.get(user, p.id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete my question' })
  @ApiErrors({ 404: [E.NOT_FOUND] })
  remove(@CurrentUser() user: RequestUser, @Param() p: QuestionIdParamDto) {
    return this.qa.remove(user, p.id);
  }

  @Put(':id/answer')
  @ApiOperation({ summary: 'Answer (or edit my answer) — verified attorney' })
  @ApiEnvelopeResponse(AnswerDto)
  @ApiErrors({
    400: [E.VALIDATION_ERROR],
    403: [E.FORBIDDEN, E.ATTORNEY_NOT_VERIFIED, E.USER_BLOCKED],
    404: [E.NOT_FOUND],
    429: [E.RATE_LIMITED],
  })
  answer(
    @CurrentUser() user: RequestUser,
    @Param() p: QuestionIdParamDto,
    @Body() dto: AnswerBodyDto,
  ) {
    return this.qa.answer(user, p.id, dto.body);
  }

  @Delete(':id/answer')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete my answer' })
  @ApiErrors({ 404: [E.NOT_FOUND] })
  removeAnswer(@CurrentUser() user: RequestUser, @Param() p: QuestionIdParamDto) {
    return this.qa.removeAnswer(user, p.id);
  }

  @Put(':id/answers/:answerId/like')
  @ApiOperation({ summary: 'Like an answer' })
  @ApiEnvelopeResponse(AnswerDto)
  @ApiErrors({ 403: [E.FORBIDDEN, E.USER_BLOCKED], 404: [E.NOT_FOUND] })
  like(@CurrentUser() user: RequestUser, @Param() p: AnswerParamDto) {
    return this.qa.like(user, p.id, p.answerId);
  }

  @Delete(':id/answers/:answerId/like')
  @ApiOperation({ summary: 'Remove my like' })
  @ApiEnvelopeResponse(AnswerDto)
  @ApiErrors({ 404: [E.NOT_FOUND] })
  unlike(@CurrentUser() user: RequestUser, @Param() p: AnswerParamDto) {
    return this.qa.unlike(user, p.id, p.answerId);
  }

  @Put(':id/best')
  @ApiOperation({ summary: 'Mark the best answer (the question author)' })
  @ApiEnvelopeResponse(QuestionDetailDto)
  @ApiErrors({ 403: [E.FORBIDDEN], 404: [E.NOT_FOUND] })
  markBest(
    @CurrentUser() user: RequestUser,
    @Param() p: QuestionIdParamDto,
    @Body() dto: BestAnswerDto,
  ) {
    return this.qa.markBest(user, p.id, dto.answerId);
  }

  @Delete(':id/best')
  @ApiOperation({ summary: 'Clear the best-answer mark' })
  @ApiEnvelopeResponse(QuestionDetailDto)
  @ApiErrors({ 403: [E.FORBIDDEN], 404: [E.NOT_FOUND] })
  clearBest(@CurrentUser() user: RequestUser, @Param() p: QuestionIdParamDto) {
    return this.qa.clearBest(user, p.id);
  }
}
