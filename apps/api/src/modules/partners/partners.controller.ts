import { Controller, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ApiEnvelopeResponse,
  ApiErrors,
  AUTHENTICATED_ERRORS,
} from '../../common/dto/api-docs.decorators';
import { ErrorCode as E } from '../../common/errors/error-code.enum';
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

  @Post('me/join')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Become a partner myself (program and self-enrolment on); returns the dashboard with my link',
  })
  @ApiEnvelopeResponse(PartnerMeDto)
  @ApiErrors({
    403: [E.FEATURE_DISABLED],
    409: [E.PARTNER_INVALID_STATE],
  })
  joinPartnerProgram(@CurrentUser() user: RequestUser): Promise<PartnerMeDto> {
    return this.partners.join(user.sub);
  }
}
