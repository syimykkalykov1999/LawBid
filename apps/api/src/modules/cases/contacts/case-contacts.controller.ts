import {
  Body,
  Controller,
  Get,
  HttpStatus,
  Param,
  Post,
  UseGuards,
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
} from '../../../common/dto/api-docs.decorators';
import { ErrorCode } from '../../../common/errors/error-code.enum';
import { IdempotencyInterceptor } from '../../../idempotency/idempotency.interceptor';
import { RequireIdempotencyKeyGuard } from '../../../idempotency/require-idempotency-key.guard';
import {
  CurrentUser,
  type RequestUser,
} from '../../auth/decorators/current-user.decorator';
import { CaseIdParamDto } from '../dto/case-requests.dto';
import { CaseContactsService } from './case-contacts.service';
import {
  ClientContactsDto,
  ContactIssueReportDto,
  CreateContactIssueDto,
} from './dto/case-contacts.dto';

const E = ErrorCode;

/** docs/04_CASES_BIDS.md §8 (stage 4.5): the attorney side of client
 * contacts — reading them and reporting "Не могу связаться". */
@ApiTags('cases')
@ApiBearerAuth()
@ApiErrors(AUTHENTICATED_ERRORS)
@Controller()
export class CaseContactsController {
  constructor(private readonly contacts: CaseContactsService) {}

  @Get('cases/:id/contacts')
  @ApiOperation({
    summary:
      'Client contacts for the attorney whose bid was accepted (active subscription required, docs/04 §8)',
  })
  @ApiEnvelopeResponse(ClientContactsDto)
  @ApiErrors({
    400: [E.VALIDATION_ERROR],
    403: [E.FORBIDDEN, E.CONTACTS_LOCKED, E.SUBSCRIPTION_REQUIRED],
    404: [E.CASE_NOT_FOUND],
  })
  getCaseContacts(
    @CurrentUser() user: RequestUser,
    @Param() params: CaseIdParamDto,
  ): Promise<ClientContactsDto> {
    return this.contacts.get(user, params.id);
  }

  @Post('cases/:id/contact-issues')
  @UseGuards(RequireIdempotencyKeyGuard)
  @UseInterceptors(IdempotencyInterceptor)
  @ApiOperation({
    summary: '"Can’t reach the client" report (attorney, docs/04 §8.4)',
  })
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiEnvelopeResponse(ContactIssueReportDto, { status: HttpStatus.CREATED })
  @ApiErrors({
    400: [E.VALIDATION_ERROR, E.IDEMPOTENCY_KEY_REQUIRED],
    403: [E.FORBIDDEN, E.CONTACTS_LOCKED],
    404: [E.CASE_NOT_FOUND],
    409: [E.CONTACT_ISSUE_ALREADY_OPEN, E.IDEMPOTENCY_KEY_CONFLICT],
  })
  reportContactIssue(
    @CurrentUser() user: RequestUser,
    @Param() params: CaseIdParamDto,
    @Body() dto: CreateContactIssueDto,
  ): Promise<ContactIssueReportDto> {
    return this.contacts.report(user, params.id, dto);
  }
}
