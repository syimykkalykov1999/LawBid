import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
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
  CreateSupportTicketDto,
  SupportCursorQueryDto,
  SupportMessageBodyDto,
  SupportMessageDto,
  SupportTicketDetailDto,
  SupportTicketDto,
  SupportTicketIdParamDto,
} from './support.dto';
import { SupportService } from './support.service';

const E = ErrorCode;
type Page<T> = { items: T[]; nextCursor: string | null };

/** Owner 2026-10-02: "Help & support" in the app — own tickets only. */
@ApiTags('support')
@ApiBearerAuth()
@ApiErrors(AUTHENTICATED_ERRORS)
@Controller('support/tickets')
export class SupportController {
  constructor(private readonly support: SupportService) {}

  @Post()
  @UseInterceptors(IdempotencyInterceptor)
  @ApiOperation({ summary: 'Open a support ticket with the first message' })
  @ApiHeader({
    name: 'Idempotency-Key',
    required: false,
    description:
      'A retry with the same key and body creates the ticket once (IdempotencyInterceptor).',
  })
  @ApiEnvelopeResponse(SupportTicketDetailDto, { status: HttpStatus.CREATED })
  @ApiErrors({
    400: [E.VALIDATION_ERROR],
    409: [E.IDEMPOTENCY_KEY_CONFLICT],
    429: [E.RATE_LIMITED],
  })
  createSupportTicket(
    @CurrentUser() user: RequestUser,
    @Body() dto: CreateSupportTicketDto,
  ): Promise<SupportTicketDetailDto> {
    return this.support.create(user.sub, dto);
  }

  @Get()
  @ApiOperation({ summary: 'My tickets, latest activity first' })
  @ApiEnvelopeResponse(SupportTicketDto, { isArray: true })
  @ApiErrors({ 400: [E.VALIDATION_ERROR] })
  listMySupportTickets(
    @CurrentUser() user: RequestUser,
    @Query() q: SupportCursorQueryDto,
  ): Promise<Page<SupportTicketDto>> {
    return this.support.list(user.sub, q.cursor);
  }

  @Get(':id')
  @ApiOperation({ summary: 'One of my tickets with its messages (marks read)' })
  @ApiEnvelopeResponse(SupportTicketDetailDto)
  @ApiErrors({ 400: [E.VALIDATION_ERROR], 404: [E.NOT_FOUND] })
  getMySupportTicket(
    @CurrentUser() user: RequestUser,
    @Param() p: SupportTicketIdParamDto,
  ): Promise<SupportTicketDetailDto> {
    return this.support.get(user.sub, p.id);
  }

  @Post(':id/messages')
  @ApiOperation({
    summary: 'Write to support (reopens a resolved ticket; closed → 409)',
  })
  @ApiEnvelopeResponse(SupportMessageDto, { status: HttpStatus.CREATED })
  @ApiErrors({
    400: [E.VALIDATION_ERROR],
    404: [E.NOT_FOUND],
    409: [E.SUPPORT_TICKET_CLOSED],
    429: [E.RATE_LIMITED],
  })
  replyToSupportTicket(
    @CurrentUser() user: RequestUser,
    @Param() p: SupportTicketIdParamDto,
    @Body() dto: SupportMessageBodyDto,
  ): Promise<SupportMessageDto> {
    return this.support.reply(user.sub, p.id, dto.body);
  }

  @Post(':id/close')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Close my ticket (no more replies)' })
  @ApiEnvelopeResponse(SupportTicketDto)
  @ApiErrors({ 400: [E.VALIDATION_ERROR], 404: [E.NOT_FOUND] })
  closeMySupportTicket(
    @CurrentUser() user: RequestUser,
    @Param() p: SupportTicketIdParamDto,
  ): Promise<SupportTicketDto> {
    return this.support.close(user.sub, p.id);
  }
}
