import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ApiEnvelopeResponse,
  ApiErrors,
} from '../../common/dto/api-docs.decorators';
import { ErrorCode } from '../../common/errors/error-code.enum';
import { AdminEndpoint } from '../admin-auth/admin-auth.decorators';
import {
  AdminQaListQueryDto,
  AdminQaQuestionDetailDto,
  AdminQaQuestionDto,
  type AdminQaPage,
} from './admin-legal-qa.dto';
import { AdminLegalQaService } from './admin-legal-qa.service';
import { QuestionIdParamDto } from './legal-qa.dto';

const E = ErrorCode;

/** Admin → «Вопрос юристу». Same people as moderation (§2.2); hide /
 * remove / restore of a question or an answer are the moderation actions. */
@ApiTags('admin-legal-qa')
@AdminEndpoint('super_admin', 'moderator')
@Controller('admin/legal-qa')
export class AdminLegalQaController {
  constructor(private readonly qa: AdminLegalQaService) {}

  @Get('questions')
  @ApiOperation({ summary: 'All questions, hidden and removed too (search)' })
  @ApiEnvelopeResponse(AdminQaQuestionDto, { isArray: true })
  @ApiErrors({ 400: [E.VALIDATION_ERROR] })
  listAdminQuestions(@Query() q: AdminQaListQueryDto): Promise<AdminQaPage> {
    return this.qa.list(q);
  }

  @Get('questions/:id')
  @ApiOperation({ summary: 'A question with all its answers' })
  @ApiEnvelopeResponse(AdminQaQuestionDetailDto)
  @ApiErrors({ 400: [E.VALIDATION_ERROR], 404: [E.NOT_FOUND] })
  getAdminQuestion(
    @Param() p: QuestionIdParamDto,
  ): Promise<AdminQaQuestionDetailDto> {
    return this.qa.get(p.id);
  }

  @Post('questions/:id/clear-best')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Take the «best answer» mark off' })
  @ApiEnvelopeResponse(AdminQaQuestionDetailDto)
  @ApiErrors({ 400: [E.VALIDATION_ERROR], 404: [E.NOT_FOUND] })
  clearAdminQuestionBest(
    @Param() p: QuestionIdParamDto,
  ): Promise<AdminQaQuestionDetailDto> {
    return this.qa.clearBest(p.id);
  }
}
