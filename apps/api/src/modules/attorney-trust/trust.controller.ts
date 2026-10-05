import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  HttpCode,
  HttpStatus,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ApiEnvelopeResponse,
  ApiErrors,
  AUTHENTICATED_ERRORS,
} from '../../common/dto/api-docs.decorators';
import { ErrorCode } from '../../common/errors/error-code.enum';
import { PrismaService } from '../../prisma/prisma.service';
import {
  CurrentUser,
  type RequestUser,
} from '../auth/decorators/current-user.decorator';
import { AttorneyOnly } from '../auth/assistant/assistant-context';
import {
  FirmEmailConfirmDto,
  FirmEmailRequestDto,
  FirmEmailResultDto,
  OwnTrustDto,
  PublicTrustDto,
  TrustAttorneyIdParamDto,
} from './attorney-trust.dto';
import { AttorneyTrustService } from './attorney-trust.service';
import { FirmEmailService } from './firm-email.service';
import { registryLinks, toOwnTrust, toPublicTrust } from './trust-presenter';

const E = ErrorCode;

/**
 * Owner 2026-10-05: what has actually been checked about an attorney. A
 * client reads it on the attorney's card and before the first payment;
 * the attorney reads their own level and what raises it.
 */
@ApiTags('trust')
@ApiBearerAuth()
@ApiErrors(AUTHENTICATED_ERRORS)
@Controller('trust')
export class TrustController {
  constructor(
    private readonly trust: AttorneyTrustService,
    private readonly firmEmail: FirmEmailService,
    private readonly prisma: PrismaService,
  ) {}

  @Post('me/firm-email')
  @HttpCode(HttpStatus.OK)
  @AttorneyOnly()
  @ApiOperation({
    summary: 'Send a code to my address at the firm (firm link)',
  })
  @ApiEnvelopeResponse(FirmEmailResultDto)
  @ApiErrors({
    400: [E.VALIDATION_ERROR],
    403: [E.FORBIDDEN],
    429: [E.RATE_LIMITED],
  })
  requestFirmEmailCode(
    @CurrentUser() user: RequestUser,
    @Body() dto: FirmEmailRequestDto,
  ): Promise<FirmEmailResultDto> {
    return this.firmEmail.request(user.sub, dto.email, 'en');
  }

  @Post('me/firm-email/confirm')
  @HttpCode(HttpStatus.OK)
  @AttorneyOnly()
  @ApiOperation({ summary: 'Confirm the firm e-mail code' })
  @ApiEnvelopeResponse(FirmEmailResultDto)
  @ApiErrors({ 400: [E.VALIDATION_ERROR], 403: [E.FORBIDDEN] })
  confirmFirmEmailCode(
    @CurrentUser() user: RequestUser,
    @Body() dto: FirmEmailConfirmDto,
  ): Promise<FirmEmailResultDto> {
    return this.firmEmail.confirm(user.sub, dto.code);
  }

  @Get('me')
  @AttorneyOnly()
  @ApiOperation({ summary: 'My trust level, gates and next steps (attorney)' })
  @ApiEnvelopeResponse(OwnTrustDto)
  @ApiErrors({ 403: [E.FORBIDDEN], 404: [E.NOT_FOUND] })
  async getMyTrust(@CurrentUser() user: RequestUser): Promise<OwnTrustDto> {
    const snap = await this.trust.recompute(user.sub, {
      type: 'attorney',
      id: user.sub,
    });
    if (!snap) throw notFound();
    return toOwnTrust(snap, await this.links(user.sub));
  }

  @Get('attorneys/:attorneyId')
  @ApiOperation({
    summary:
      "An attorney's trust level: what LawBid checked (any signed-in user)",
  })
  @ApiEnvelopeResponse(PublicTrustDto)
  @ApiErrors({ 400: [E.VALIDATION_ERROR], 404: [E.NOT_FOUND] })
  async getAttorneyTrust(
    @Param() params: TrustAttorneyIdParamDto,
  ): Promise<PublicTrustDto> {
    const snap = await this.trust.snapshot(params.attorneyId);
    if (!snap) throw notFound();
    return toPublicTrust(snap, await this.links(params.attorneyId));
  }

  private async links(attorneyId: string) {
    const licenses = await this.prisma.attorneyLicense.findMany({
      where: { attorney_id: attorneyId },
      select: {
        state_code: true,
        bar_number: true,
        license_status: true,
        state: { select: { name: true } },
      },
      orderBy: { state_code: 'asc' },
    });
    return registryLinks(licenses);
  }
}

function notFound(): NotFoundException {
  return new NotFoundException({
    code: ErrorCode.NOT_FOUND,
    message: 'Attorney not found.',
  });
}
