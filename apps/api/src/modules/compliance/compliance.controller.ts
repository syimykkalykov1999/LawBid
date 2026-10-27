import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Post,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiEnvelopeResponse } from '../../common/dto/api-docs.decorators';
import { ErrorCode } from '../../common/errors/error-code.enum';
import { PrismaService } from '../../prisma/prisma.service';
import {
  CurrentUser,
  type RequestUser,
} from '../auth/decorators/current-user.decorator';
import { Public } from '../auth/decorators/public.decorator';
import {
  AgeGateConfigDto,
  SmsConsentRequestDto,
  SmsConsentResultDto,
  SmsDisclosureDto,
} from './admin-compliance.dto';
import { AgeGateService } from './age-gate.service';
import { SmsComplianceService } from './sms-compliance.service';

/**
 * 2026-10-25: what the app needs to show (and send) for the 18+ checkbox
 * and the separate text-message consent. Both are inert until the app uses
 * them: the gate is `off` and marketing texts are switched off by default.
 */
@ApiTags('compliance')
@Controller('compliance')
export class ComplianceController {
  constructor(
    private readonly ageGate: AgeGateService,
    private readonly sms: SmsComplianceService,
    private readonly prisma: PrismaService,
  ) {}

  @Public()
  @Get('age-gate')
  @ApiOperation({
    summary: 'Sign-up age gate: mode, minimum age, wording version',
  })
  @ApiEnvelopeResponse(AgeGateConfigDto)
  async ageGateConfig(): Promise<AgeGateConfigDto> {
    const p = await this.ageGate.policy();
    return {
      mode: p.mode,
      minAge: p.minAge,
      textVersion: p.textVersion,
      requireBirthDate: p.requireBirthDate,
    };
  }

  @Get('sms-consent/disclosure')
  @ApiOperation({
    summary: 'The wording shown next to the text-message consent',
  })
  @ApiEnvelopeResponse(SmsDisclosureDto)
  disclosure(): Promise<SmsDisclosureDto> {
    return this.sms.disclosure();
  }

  @Post('sms-consent')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Record separate consent to get text messages (not needed for sign-in codes)',
  })
  @ApiEnvelopeResponse(SmsConsentResultDto)
  async consent(
    @CurrentUser() user: RequestUser,
    @Body() dto: SmsConsentRequestDto,
  ): Promise<SmsConsentResultDto> {
    if (dto.purpose !== 'marketing' && dto.purpose !== 'notifications') {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_ERROR,
        message: 'purpose must be marketing or notifications',
      });
    }
    const phone = await this.verifiedPhone(user.sub);
    const r = await this.sms.recordConsent({
      userId: user.sub,
      phone,
      purpose: dto.purpose,
      disclosureVersion: dto.disclosureVersion,
      source: 'app',
    });
    return { recorded: true, blockedUntilStart: r.blockedUntilStart };
  }

  @Delete('sms-consent')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Withdraw consent to text messages' })
  @ApiEnvelopeResponse(SmsConsentResultDto)
  async revoke(@CurrentUser() user: RequestUser): Promise<SmsConsentResultDto> {
    const phone = await this.verifiedPhone(user.sub);
    await this.sms.revokeConsent(phone, 'app');
    return { recorded: false, blockedUntilStart: false };
  }

  private async verifiedPhone(userId: string): Promise<string> {
    const u = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { phone_e164: true, phone_verified_at: true },
    });
    if (!u?.phone_e164 || !u.phone_verified_at) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_ERROR,
        message: 'Add and verify a phone number first.',
      });
    }
    return u.phone_e164;
  }
}
