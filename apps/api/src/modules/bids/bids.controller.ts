import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpStatus,
  Param,
  Post,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiIfMatchVersion,
  ExpectedVersion,
} from '../../common/concurrency/optimistic-lock';
import { RequireLegalAcceptance } from '../legal-documents/legal-acceptance.guard';
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
import { RequireIdempotencyKeyGuard } from '../../idempotency/require-idempotency-key.guard';
import {
  CurrentUser,
  type RequestUser,
} from '../auth/decorators/current-user.decorator';
import { FirmsService } from '../firms/firms.service';
import { BidsService } from './bids.service';
import {
  ConflictCheckDto,
  ConflictCheckService,
} from './conflict/conflict-check.service';
import {
  BidIdParamDto,
  CaseIdParamDto,
  ChangeBidDto,
  CounterOfferDto,
  CreateBidDto,
} from './dto/bid-requests.dto';
import { BidCaseChangeDto, BidDto } from './dto/bid-responses.dto';
import { AttorneyOnly } from '../auth/assistant/assistant-context';

const E = ErrorCode;

/**
 * docs/04_CASES_BIDS.md §5–§6 (stage 4.4). Every route needs a bearer
 * token (global JwtAuthGuard); §7 acceptance (contacts disclosure) is
 * stage 4.5's own endpoint, not here.
 */
@ApiTags('bids')
@ApiBearerAuth()
@ApiErrors(AUTHENTICATED_ERRORS)
@Controller()
export class BidsController {
  constructor(
    private readonly bids: BidsService,
    private readonly firms: FirmsService,
    private readonly conflicts: ConflictCheckService,
  ) {}

  // Owner 2026-10-20: a conflict-of-interest warning before the bid.
  @AttorneyOnly('bids')
  @Get('cases/:caseId/conflict-check')
  @ApiOperation({
    summary:
      'Attorney: does this case clash with a client or a case of yours? (a warning, never a block)',
  })
  @ApiEnvelopeResponse(ConflictCheckDto)
  @ApiErrors({
    400: [E.VALIDATION_ERROR],
    403: [E.USER_BLOCKED],
    404: [E.CASE_NOT_FOUND],
    429: [E.RATE_LIMITED],
  })
  async conflictCheck(
    @CurrentUser() user: RequestUser,
    @Param() params: CaseIdParamDto,
  ): Promise<ConflictCheckDto> {
    if (user.role !== 'attorney') {
      throw new ForbiddenException({
        code: E.FORBIDDEN,
        message: 'Only attorneys can check a case for a conflict.',
      });
    }
    // Owner 2026-10-22 (security audit #3, finding 7): only a case this
    // attorney may open, and no block either way — before anything loads.
    await this.conflicts.assertAllowed(user.sub, params.caseId);
    await this.conflicts.assertQuota(user.sub);
    const result = await this.conflicts.check(user.sub, params.caseId);
    await this.conflicts
      .record(user.sub, params.caseId, 'view', result)
      .catch(() => undefined);
    return result;
  }

  // OQ-049: or an assistant the attorney trusted (their responsibility).
  @AttorneyOnly('bids')
  @Post('cases/:caseId/bids')
  @RequireLegalAcceptance()
  @UseGuards(RequireIdempotencyKeyGuard)
  @UseInterceptors(IdempotencyInterceptor)
  @ApiOperation({ summary: 'Place a bid on an open case (attorney)' })
  @ApiHeader({
    name: 'Idempotency-Key',
    required: true,
    description: 'A retry with the same key and body replays the first bid.',
  })
  @ApiEnvelopeResponse(BidDto, { status: HttpStatus.CREATED })
  @ApiErrors({
    400: [E.VALIDATION_ERROR, E.IDEMPOTENCY_KEY_REQUIRED],
    403: [E.FORBIDDEN, E.SUBSCRIPTION_REQUIRED, E.LEGAL_REACCEPT_REQUIRED],
    404: [E.CASE_NOT_FOUND],
    409: [
      E.CASE_INVALID_STATE,
      E.BID_ALREADY_EXISTS,
      E.IDEMPOTENCY_KEY_CONFLICT,
    ],
  })
  async createBid(
    @CurrentUser() user: RequestUser,
    @Param() params: CaseIdParamDto,
    @Body() dto: CreateBidDto,
  ): Promise<BidDto> {
    const sender = dto.sendAsAttorneyId
      ? await this.firms.resolveSender(
          user.sub,
          dto.sendAsAttorneyId,
          params.caseId,
        )
      : null;
    // The bid is the firm lawyer's: their licence, plan and limits.
    return this.bids.create(
      sender ? { ...user, sub: sender } : user,
      params.caseId,
      dto,
    );
  }

  // OQ-049: or an assistant the attorney trusted (their responsibility).
  @AttorneyOnly('bids')
  @Post('bids/:id/withdraw')
  @UseInterceptors(IdempotencyInterceptor)
  @ApiOperation({ summary: 'Withdraw a bid (attorney, while active)' })
  @ApiHeader({ name: 'Idempotency-Key', required: false })
  @ApiEnvelopeResponse(BidDto)
  @ApiErrors({
    400: [E.VALIDATION_ERROR],
    404: [E.NOT_FOUND],
    409: [E.BID_INVALID_STATE, E.IDEMPOTENCY_KEY_CONFLICT],
  })
  withdraw(
    @CurrentUser() user: RequestUser,
    @Param() params: BidIdParamDto,
  ): Promise<BidDto> {
    return this.bids.withdraw(user, params.id);
  }

  // OQ-049: or an assistant the attorney trusted (their responsibility).
  @AttorneyOnly('bids')
  @Post('bids/:id/decline')
  @UseInterceptors(IdempotencyInterceptor)
  @ApiOperation({ summary: 'Decline a bid (client)' })
  @ApiHeader({ name: 'Idempotency-Key', required: false })
  @ApiEnvelopeResponse(BidDto)
  @ApiErrors({
    400: [E.VALIDATION_ERROR],
    404: [E.NOT_FOUND],
    409: [E.BID_INVALID_STATE, E.IDEMPOTENCY_KEY_CONFLICT],
  })
  decline(
    @CurrentUser() user: RequestUser,
    @Param() params: BidIdParamDto,
  ): Promise<BidDto> {
    return this.bids.decline(user, params.id);
  }

  // Owner 2026-11-05: the attorney keeps the bid after the client changed the case.
  @AttorneyOnly('bids')
  @Post('bids/:id/confirm')
  @UseInterceptors(IdempotencyInterceptor)
  @ApiOperation({ summary: 'Keep a bid after the client changed the case' })
  @ApiHeader({ name: 'Idempotency-Key', required: false })
  @ApiEnvelopeResponse(BidDto)
  @ApiErrors({
    400: [E.VALIDATION_ERROR],
    404: [E.NOT_FOUND],
    409: [E.BID_INVALID_STATE, E.IDEMPOTENCY_KEY_CONFLICT],
  })
  confirmBid(
    @CurrentUser() user: RequestUser,
    @Param() params: BidIdParamDto,
  ): Promise<BidDto> {
    return this.bids.confirm(user, params.id);
  }

  @AttorneyOnly('bids')
  @Post('bids/:id/change')
  @ApiIfMatchVersion()
  @UseInterceptors(IdempotencyInterceptor)
  @ApiOperation({
    summary:
      'Change a bid: free and out of turn after the client changed the case, else a counter-offer',
  })
  @ApiHeader({ name: 'Idempotency-Key', required: false })
  @ApiEnvelopeResponse(BidDto)
  @ApiErrors({
    400: [E.VALIDATION_ERROR],
    404: [E.NOT_FOUND],
    409: [
      E.BID_INVALID_STATE,
      E.BID_NOT_YOUR_TURN,
      E.BID_MAX_ROUNDS_REACHED,
      E.BID_COUNTER_NOT_ALLOWED,
      E.STALE_VERSION,
      E.IDEMPOTENCY_KEY_CONFLICT,
    ],
  })
  changeBid(
    @CurrentUser() user: RequestUser,
    @Param() params: BidIdParamDto,
    @Body() dto: ChangeBidDto,
    @ExpectedVersion() expectedVersion?: number,
  ): Promise<BidDto> {
    return this.bids.change(user, params.id, dto, expectedVersion);
  }

  @AttorneyOnly('bids')
  @Get('bids/:id/case-changes')
  @ApiOperation({ summary: 'What the client changed since this bid' })
  @ApiEnvelopeResponse(BidCaseChangeDto, { isArray: true })
  @ApiErrors({ 404: [E.NOT_FOUND] })
  bidCaseChanges(
    @CurrentUser() user: RequestUser,
    @Param() params: BidIdParamDto,
  ): Promise<BidCaseChangeDto[]> {
    return this.bids.caseChanges(user, params.id);
  }

  // OQ-049: or an assistant the attorney trusted (their responsibility).
  @AttorneyOnly('bids')
  @Post('bids/:id/counter')
  @ApiIfMatchVersion()
  @UseInterceptors(IdempotencyInterceptor)
  @ApiOperation({
    summary: "Counter-offer, whichever party's turn it is (max 5 rounds)",
  })
  @ApiHeader({ name: 'Idempotency-Key', required: false })
  @ApiEnvelopeResponse(BidDto)
  @ApiErrors({
    400: [E.VALIDATION_ERROR],
    404: [E.NOT_FOUND],
    409: [
      E.BID_INVALID_STATE,
      E.BID_NOT_YOUR_TURN,
      E.BID_MAX_ROUNDS_REACHED,
      E.BID_COUNTER_NOT_ALLOWED,
      E.STALE_VERSION,
      E.IDEMPOTENCY_KEY_CONFLICT,
    ],
  })
  counter(
    @CurrentUser() user: RequestUser,
    @Param() params: BidIdParamDto,
    @Body() dto: CounterOfferDto,
    @ExpectedVersion() expectedVersion?: number,
  ): Promise<BidDto> {
    return this.bids.counter(user, params.id, dto, expectedVersion);
  }
}
