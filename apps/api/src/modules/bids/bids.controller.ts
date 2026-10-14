import {
  Body,
  Controller,
  HttpStatus,
  Param,
  Post,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
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
  BidIdParamDto,
  CaseIdParamDto,
  CounterOfferDto,
  CreateBidDto,
} from './dto/bid-requests.dto';
import { BidDto } from './dto/bid-responses.dto';
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
  ) {}

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

  // OQ-049: or an assistant the attorney trusted (their responsibility).
  @AttorneyOnly('bids')
  @Post('bids/:id/counter')
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
      E.IDEMPOTENCY_KEY_CONFLICT,
    ],
  })
  counter(
    @CurrentUser() user: RequestUser,
    @Param() params: BidIdParamDto,
    @Body() dto: CounterOfferDto,
  ): Promise<BidDto> {
    return this.bids.counter(user, params.id, dto);
  }
}
