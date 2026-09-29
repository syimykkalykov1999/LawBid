import {
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
  UseInterceptors,
} from '@nestjs/common';
import type { Request } from 'express';
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
import {
  CurrentUser,
  type RequestUser,
} from '../../auth/decorators/current-user.decorator';
import type { RequestMeta } from '../../auth/services/session.service';
import { BidIdParamDto } from '../dto/bid-requests.dto';
import { BidDto } from '../dto/bid-responses.dto';
import { BidAcceptanceService } from './bid-acceptance.service';

const E = ErrorCode;

/** docs/04_CASES_BIDS.md §7 (stage 4.5): POST /bids/:id/accept. */
@ApiTags('bids')
@ApiBearerAuth()
@ApiErrors(AUTHENTICATED_ERRORS)
@Controller()
export class BidAcceptanceController {
  constructor(private readonly acceptance: BidAcceptanceService) {}

  @Post('bids/:id/accept')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(IdempotencyInterceptor)
  @ApiOperation({
    summary:
      "Accept a bid (whichever party's turn it is): case → in_progress, other bids auto-rejected, contacts disclosed",
  })
  @ApiHeader({ name: 'Idempotency-Key', required: false })
  @ApiEnvelopeResponse(BidDto)
  @ApiErrors({
    400: [E.VALIDATION_ERROR],
    404: [E.NOT_FOUND, E.CASE_NOT_FOUND],
    409: [
      E.CASE_INVALID_STATE,
      E.BID_INVALID_STATE,
      E.BID_NOT_YOUR_TURN,
      E.BID_ATTORNEY_INACTIVE,
      E.IDEMPOTENCY_KEY_CONFLICT,
    ],
  })
  acceptBid(
    @CurrentUser() user: RequestUser,
    @Param() params: BidIdParamDto,
    @Req() req: Request,
  ): Promise<BidDto> {
    return this.acceptance.accept(user, params.id, requestMeta(req));
  }
}

function requestMeta(req: Request): RequestMeta {
  return {
    ip: req.ip,
    userAgent: req.header('user-agent'),
    deviceId: req.header('x-device-id'),
  };
}
