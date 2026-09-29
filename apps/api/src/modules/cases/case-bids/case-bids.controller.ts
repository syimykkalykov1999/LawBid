import { Controller, Get, Param, Query } from '@nestjs/common';
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
import { CaseIdParamDto } from '../dto/case-requests.dto';
import { CaseBidsService } from './case-bids.service';
import {
  CaseBidItemDto,
  CaseBidsQueryDto,
  type CaseBidPage,
} from './dto/case-bids.dto';

const E = ErrorCode;

/** docs/04 §5.2, §15 (stage 4.5): GET /cases/:id/bids for the case owner. */
@ApiTags('cases')
@ApiBearerAuth()
@ApiErrors(AUTHENTICATED_ERRORS)
@Controller()
export class CaseBidsController {
  constructor(private readonly caseBids: CaseBidsService) {}

  @Get('cases/:id/bids')
  @ApiOperation({
    summary:
      'Bids on my case with the attorney summary (client, docs/04 §5.2; sort newest / lowest_price / highest_rating)',
  })
  @ApiEnvelopeResponse(CaseBidItemDto, { isArray: true })
  @ApiErrors({
    400: [E.VALIDATION_ERROR],
    403: [E.FORBIDDEN],
    404: [E.CASE_NOT_FOUND],
  })
  listCaseBids(
    @CurrentUser() user: RequestUser,
    @Param() params: CaseIdParamDto,
    @Query() query: CaseBidsQueryDto,
  ): Promise<CaseBidPage> {
    return this.caseBids.list(user, params.id, query);
  }
}
