import { Controller, Get, Param } from '@nestjs/common';
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
import { BidsService } from '../../bids/bids.service';
import { BidIdParamDto } from '../../bids/dto/bid-requests.dto';
import { BidDto } from '../../bids/dto/bid-responses.dto';
import { CaseBidsService } from './case-bids.service';

const E = ErrorCode;

/** GET /bids/:id (docs/04 §15). Lives here, not in BidsController, because
 * the attorney summary needs FilesService (avatar links), which BidsModule
 * (also loaded by the worker) deliberately doesn't wire. */
@ApiTags('bids')
@ApiBearerAuth()
@ApiErrors(AUTHENTICATED_ERRORS)
@Controller()
export class BidDetailController {
  constructor(
    private readonly bids: BidsService,
    private readonly caseBids: CaseBidsService,
  ) {}

  @Get('bids/:id')
  @ApiOperation({
    summary: 'Bid details, full negotiation history and the attorney summary',
  })
  @ApiEnvelopeResponse(BidDto)
  @ApiErrors({ 400: [E.VALIDATION_ERROR], 404: [E.NOT_FOUND] })
  async getBid(
    @CurrentUser() user: RequestUser,
    @Param() params: BidIdParamDto,
  ): Promise<BidDto> {
    // BidsService.get() allows only the bid's two parties.
    const bid = await this.bids.get(user, params.id);
    return { ...bid, attorney: await this.caseBids.attorneySummaryOf(bid.id) };
  }
}
