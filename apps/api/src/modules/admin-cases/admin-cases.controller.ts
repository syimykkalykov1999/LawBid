import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ApiEnvelopeResponse,
  ApiErrors,
} from '../../common/dto/api-docs.decorators';
import { ErrorCode } from '../../common/errors/error-code.enum';
import { AdminEndpoint } from '../admin-auth/admin-auth.decorators';
import {
  AdminContactIssueCardDto,
  AdminContactIssueDto,
  AdminDisputeCardDto,
  AdminDisputeDto,
  AdminIdParamDto,
  ContactIssuesQueueQueryDto,
  DisputesQueueQueryDto,
  type Page,
} from './admin-cases.dto';
import { AdminCasesService } from './admin-cases.service';

const E = ErrorCode;

/** docs/06 §2.3 item 5 queues — support and super_admin (§2.2 "Кейсы").
 * Decisions: POST /admin/case-disputes/:id/resolve and
 * POST /admin/contact-issues/:id/resolve (file 04). */
@ApiTags('admin-cases')
@AdminEndpoint('support', 'super_admin')
@Controller('admin')
export class AdminCasesController {
  constructor(private readonly cases: AdminCasesService) {}

  @Get('case-disputes')
  @ApiOperation({ summary: 'Dispute queue, oldest first' })
  @ApiEnvelopeResponse(AdminDisputeDto, { isArray: true })
  @ApiErrors({ 400: [E.VALIDATION_ERROR] })
  listCaseDisputes(
    @Query() query: DisputesQueueQueryDto,
  ): Promise<Page<AdminDisputeDto>> {
    return this.cases.disputes(query);
  }

  @Get('case-disputes/:id')
  @ApiOperation({ summary: 'Dispute with the case journal chronology' })
  @ApiEnvelopeResponse(AdminDisputeCardDto)
  @ApiErrors({ 400: [E.VALIDATION_ERROR], 404: [E.NOT_FOUND] })
  getCaseDispute(
    @Param() params: AdminIdParamDto,
  ): Promise<AdminDisputeCardDto> {
    return this.cases.dispute(params.id);
  }

  @Get('contact-issues')
  @ApiOperation({ summary: '"Не могу связаться" queue, oldest first' })
  @ApiEnvelopeResponse(AdminContactIssueDto, { isArray: true })
  @ApiErrors({ 400: [E.VALIDATION_ERROR] })
  listContactIssues(
    @Query() query: ContactIssuesQueueQueryDto,
  ): Promise<Page<AdminContactIssueDto>> {
    return this.cases.contactIssues(query);
  }

  @Get('contact-issues/:id')
  @ApiOperation({
    summary: 'Report with disclosure details and the client history',
  })
  @ApiEnvelopeResponse(AdminContactIssueCardDto)
  @ApiErrors({ 400: [E.VALIDATION_ERROR], 404: [E.NOT_FOUND] })
  getContactIssue(
    @Param() params: AdminIdParamDto,
  ): Promise<AdminContactIssueCardDto> {
    return this.cases.contactIssue(params.id);
  }
}
