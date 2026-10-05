import {
  Body,
  Controller,
  Get,
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
} from '../../../common/dto/api-docs.decorators';
import { ErrorCode } from '../../../common/errors/error-code.enum';
import { IdempotencyInterceptor } from '../../../idempotency/idempotency.interceptor';
import { AttorneyOnly } from '../../auth/assistant/assistant-context';
import {
  CurrentUser,
  type RequestUser,
} from '../../auth/decorators/current-user.decorator';
import { CaseIdParamDto } from '../dto/case-requests.dto';
import { CaseInvitesService } from './case-invites.service';
import {
  CaseInviteDto,
  CreateInviteDto,
  DeclineInviteDto,
  InviteIdParamDto,
  InviteListQueryDto,
  type CaseInvitePage,
} from './dto/case-invites.dto';

const E = ErrorCode;

/** Owner 2026-10-05: a client offers their case to a chosen attorney; the
 * attorney answers with a bid (POST /cases/:id/bids) or declines. */
@ApiTags('invites')
@ApiBearerAuth()
@ApiErrors(AUTHENTICATED_ERRORS)
@Controller()
export class CaseInvitesController {
  constructor(private readonly invites: CaseInvitesService) {}

  @Post('cases/:id/invites')
  @UseInterceptors(IdempotencyInterceptor)
  @ApiOperation({ summary: 'Offer my open case to an attorney (client)' })
  @ApiHeader({ name: 'Idempotency-Key', required: false })
  @ApiEnvelopeResponse(CaseInviteDto, { status: HttpStatus.CREATED })
  @ApiErrors({
    400: [E.VALIDATION_ERROR],
    403: [E.FORBIDDEN],
    404: [E.CASE_NOT_FOUND],
    409: [
      E.CASE_INVALID_STATE,
      E.INVITE_ATTORNEY_UNAVAILABLE,
      E.INVITE_ALREADY_PENDING,
      E.BID_ALREADY_EXISTS,
    ],
    429: [E.INVITE_LIMIT_REACHED],
  })
  createInvite(
    @CurrentUser() user: RequestUser,
    @Param() params: CaseIdParamDto,
    @Body() dto: CreateInviteDto,
  ): Promise<CaseInviteDto> {
    return this.invites.create(user, params.id, dto);
  }

  @Get('cases/:id/invites')
  @ApiOperation({
    summary:
      "Invites on a case: all of them for its client, the attorney's own for an attorney",
  })
  @ApiEnvelopeResponse(CaseInviteDto, { isArray: true })
  @ApiErrors({
    400: [E.VALIDATION_ERROR],
    403: [E.FORBIDDEN],
    404: [E.CASE_NOT_FOUND],
  })
  listCaseInvites(
    @CurrentUser() user: RequestUser,
    @Param() params: CaseIdParamDto,
  ): Promise<CaseInviteDto[]> {
    return this.invites.listForCase(user, params.id);
  }

  // OQ-049: or an assistant the attorney trusted.
  @AttorneyOnly('bids')
  @Get('invites')
  @ApiOperation({ summary: 'My invites from clients (attorney)' })
  @ApiEnvelopeResponse(CaseInviteDto, { isArray: true })
  @ApiErrors({ 400: [E.VALIDATION_ERROR], 403: [E.FORBIDDEN] })
  listMyInvites(
    @CurrentUser() user: RequestUser,
    @Query() query: InviteListQueryDto,
  ): Promise<CaseInvitePage> {
    return this.invites.listForAttorney(user, query);
  }

  @Get('invites/:id')
  @ApiOperation({ summary: 'One invite (its client or attorney)' })
  @ApiEnvelopeResponse(CaseInviteDto)
  @ApiErrors({ 400: [E.VALIDATION_ERROR], 404: [E.INVITE_NOT_FOUND] })
  getInvite(
    @CurrentUser() user: RequestUser,
    @Param() params: InviteIdParamDto,
  ): Promise<CaseInviteDto> {
    return this.invites.get(user, params.id);
  }

  // OQ-049: or an assistant the attorney trusted.
  @AttorneyOnly('bids')
  @Post('invites/:id/decline')
  @UseInterceptors(IdempotencyInterceptor)
  @ApiOperation({ summary: 'Decline an invite, optionally with a reason' })
  @ApiHeader({ name: 'Idempotency-Key', required: false })
  @ApiEnvelopeResponse(CaseInviteDto)
  @ApiErrors({
    400: [E.VALIDATION_ERROR],
    403: [E.FORBIDDEN],
    404: [E.INVITE_NOT_FOUND],
    409: [E.INVITE_INVALID_STATE],
  })
  declineInvite(
    @CurrentUser() user: RequestUser,
    @Param() params: InviteIdParamDto,
    @Body() dto: DeclineInviteDto,
  ): Promise<CaseInviteDto> {
    return this.invites.decline(user, params.id, dto);
  }

  @Post('invites/:id/cancel')
  @UseInterceptors(IdempotencyInterceptor)
  @ApiOperation({ summary: 'Cancel my pending invite (client)' })
  @ApiHeader({ name: 'Idempotency-Key', required: false })
  @ApiEnvelopeResponse(CaseInviteDto)
  @ApiErrors({
    400: [E.VALIDATION_ERROR],
    403: [E.FORBIDDEN],
    404: [E.INVITE_NOT_FOUND],
    409: [E.INVITE_INVALID_STATE],
  })
  cancelInvite(
    @CurrentUser() user: RequestUser,
    @Param() params: InviteIdParamDto,
  ): Promise<CaseInviteDto> {
    return this.invites.cancel(user, params.id);
  }
}
