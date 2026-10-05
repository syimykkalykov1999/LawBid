import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ApiEnvelopeResponse,
  ApiErrors,
  AUTHENTICATED_ERRORS,
} from '../../common/dto/api-docs.decorators';
import {
  CurrentUser,
  type RequestUser,
} from '../auth/decorators/current-user.decorator';
import { PartnerMeDto } from './partners.dto';
import { PartnersService } from './partners.service';

/** Owner 2026-10-05: the partner's own screen (Settings → Partner program). */
@ApiTags('partners')
@ApiBearerAuth()
@ApiErrors(AUTHENTICATED_ERRORS)
@Controller('partners')
export class PartnersController {
  constructor(private readonly partners: PartnersService) {}

  @Get('me')
  @ApiOperation({
    summary:
      'My partner dashboard: link, rates, who joined, accrued and paid earnings (isPartner=false for everyone else)',
  })
  @ApiEnvelopeResponse(PartnerMeDto)
  getMyPartnerDashboard(
    @CurrentUser() user: RequestUser,
  ): Promise<PartnerMeDto> {
    return this.partners.me(user.sub);
  }
}
