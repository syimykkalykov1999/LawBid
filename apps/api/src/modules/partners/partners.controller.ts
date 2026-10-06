import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
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
import { JoinPartnerDto, PartnerMeDto } from './partners.dto';
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
    400: [E.VALIDATION_ERROR],
    403: [E.FEATURE_DISABLED],
    409: [E.PARTNER_INVALID_STATE],
  })
  joinPartnerProgram(
    @CurrentUser() user: RequestUser,
    @Body() dto: JoinPartnerDto,
    @Req() req: Request,
  ): Promise<PartnerMeDto> {
    // Owner 2026-10-05 (legal): the acceptance keeps the request IP, like
    // user consents (consents.service.ts).
    return this.partners.join(user.sub, {
      termsAccepted: dto.termsAccepted,
      ip: req.ip ?? null,
    });
  }

  @Post('me/accept-terms')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Accept the current partner rules (existing partners; termsAcceptedVersion was null)',
  })
  @ApiEnvelopeResponse(PartnerMeDto)
  @ApiErrors({ 409: [E.PARTNER_INVALID_STATE] })
  acceptPartnerTerms(
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
  ): Promise<PartnerMeDto> {
    return this.partners.acceptTerms(user.sub, req.ip ?? null);
  }
}
