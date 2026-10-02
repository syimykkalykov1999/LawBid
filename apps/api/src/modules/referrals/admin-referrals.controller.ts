import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ApiEnvelopeResponse,
  ApiErrors,
} from '../../common/dto/api-docs.decorators';
import { ErrorCode } from '../../common/errors/error-code.enum';
import {
  AdminEndpoint,
  CurrentAdmin,
  Roles,
  SkipAutoAudit,
  type AdminActor,
} from '../admin-auth/admin-auth.decorators';
import { AdminReferralsService } from './admin-referrals.service';
import {
  AdminReferralIdParamDto,
  AdminReferralReasonDto,
  AdminReferralRowDto,
  AdminReferralsQueryDto,
  AdminReferralStatsDto,
  ReferralSettingsDto,
} from './referrals.dto';
import type { ReferralProgramSettings } from './referrals.settings';

const E = ErrorCode;
type Page<T> = { items: T[]; nextCursor: string | null };

/** Owner 2026-10-02: referral program in the admin (money: super_admin +
 * finance; support reads). */
@ApiTags('admin-referrals')
@AdminEndpoint('super_admin', 'finance', 'support')
@Controller('admin/referrals')
export class AdminReferralsController {
  constructor(private readonly referrals: AdminReferralsService) {}

  @Get()
  @ApiOperation({ summary: 'Referrals, newest first' })
  @ApiEnvelopeResponse(AdminReferralRowDto, { isArray: true })
  @ApiErrors({ 400: [E.VALIDATION_ERROR] })
  listAdminReferrals(
    @Query() q: AdminReferralsQueryDto,
  ): Promise<Page<AdminReferralRowDto>> {
    return this.referrals.list(q);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Referral totals and rewards issued' })
  @ApiEnvelopeResponse(AdminReferralStatsDto)
  getAdminReferralStats(): Promise<AdminReferralStatsDto> {
    return this.referrals.stats();
  }

  @Get('settings')
  @ApiOperation({ summary: 'Referral program settings' })
  @ApiEnvelopeResponse(ReferralSettingsDto)
  getReferralSettings(): Promise<ReferralProgramSettings> {
    return this.referrals.getSettings();
  }

  @Roles('super_admin')
  @Put('settings')
  @SkipAutoAudit()
  @ApiOperation({ summary: 'Change the referral program (super admin)' })
  @ApiEnvelopeResponse(ReferralSettingsDto)
  @ApiErrors({ 400: [E.VALIDATION_ERROR] })
  updateReferralSettings(
    @CurrentAdmin() admin: AdminActor,
    @Body() dto: ReferralSettingsDto,
  ): Promise<ReferralProgramSettings> {
    return this.referrals.updateSettings(admin, dto);
  }

  @Roles('super_admin', 'finance')
  @Post(':id/qualify')
  @HttpCode(HttpStatus.OK)
  @SkipAutoAudit()
  @ApiOperation({ summary: 'Qualify a pending referral and issue rewards' })
  @ApiEnvelopeResponse(AdminReferralRowDto)
  @ApiErrors({
    400: [E.VALIDATION_ERROR],
    404: [E.NOT_FOUND],
    409: [E.REFERRAL_INVALID_STATE],
  })
  qualifyAdminReferral(
    @CurrentAdmin() admin: AdminActor,
    @Param() p: AdminReferralIdParamDto,
    @Body() dto: AdminReferralReasonDto,
  ): Promise<AdminReferralRowDto> {
    return this.referrals.qualify(admin, p.id, dto.reason);
  }

  @Roles('super_admin', 'finance')
  @Post(':id/reward')
  @HttpCode(HttpStatus.OK)
  @SkipAutoAudit()
  @ApiOperation({ summary: 'Issue the rewards of a qualified referral' })
  @ApiEnvelopeResponse(AdminReferralRowDto)
  @ApiErrors({
    400: [E.VALIDATION_ERROR],
    404: [E.NOT_FOUND],
    409: [E.REFERRAL_INVALID_STATE],
  })
  rewardAdminReferral(
    @CurrentAdmin() admin: AdminActor,
    @Param() p: AdminReferralIdParamDto,
    @Body() dto: AdminReferralReasonDto,
  ): Promise<AdminReferralRowDto> {
    return this.referrals.reward(admin, p.id, dto.reason);
  }

  @Roles('super_admin', 'finance')
  @Post(':id/reject')
  @HttpCode(HttpStatus.OK)
  @SkipAutoAudit()
  @ApiOperation({ summary: 'Reject a referral (fraud, abuse)' })
  @ApiEnvelopeResponse(AdminReferralRowDto)
  @ApiErrors({
    400: [E.VALIDATION_ERROR],
    404: [E.NOT_FOUND],
    409: [E.REFERRAL_INVALID_STATE],
  })
  rejectAdminReferral(
    @CurrentAdmin() admin: AdminActor,
    @Param() p: AdminReferralIdParamDto,
    @Body() dto: AdminReferralReasonDto,
  ): Promise<AdminReferralRowDto> {
    return this.referrals.reject(admin, p.id, dto.reason);
  }
}
