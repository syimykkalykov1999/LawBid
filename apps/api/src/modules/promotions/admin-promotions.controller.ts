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
import { AdminPromotionsService } from './admin-promotions.service';
import {
  AdminCancelPromotionDto,
  AdminExtendPromotionDto,
  AdminGrantPromotionDto,
  AdminPromotionActionResultDto,
  AdminPromotionIdParamDto,
  AdminPromotionRowDto,
  AdminPromotionsQueryDto,
  AdminPromotionStatsDto,
  PromotionSettingsDto,
} from './promotions.dto';
import type { PromotionSettings } from './promotions.settings';

const E = ErrorCode;
type Page<T> = { items: T[]; nextCursor: string | null };

/** Owner 2026-10-02: case promotions in the admin (money: super_admin +
 * finance; support and moderators read). */
@ApiTags('admin-promotions')
@AdminEndpoint('super_admin', 'finance', 'support', 'moderator')
@Controller('admin/promotions')
export class AdminPromotionsController {
  constructor(private readonly promotions: AdminPromotionsService) {}

  @Get()
  @ApiOperation({ summary: 'Case promotions, newest first' })
  @ApiEnvelopeResponse(AdminPromotionRowDto, { isArray: true })
  @ApiErrors({ 400: [E.VALIDATION_ERROR] })
  listAdminPromotions(
    @Query() q: AdminPromotionsQueryDto,
  ): Promise<Page<AdminPromotionRowDto>> {
    return this.promotions.list(q);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Active promotions and 30-day revenue' })
  @ApiEnvelopeResponse(AdminPromotionStatsDto)
  getAdminPromotionStats(): Promise<AdminPromotionStatsDto> {
    return this.promotions.stats();
  }

  @Get('settings')
  @ApiOperation({ summary: 'Case promotion settings' })
  @ApiEnvelopeResponse(PromotionSettingsDto)
  getPromotionSettings(): Promise<PromotionSettings> {
    return this.promotions.getSettings();
  }

  @Roles('super_admin')
  @Put('settings')
  @SkipAutoAudit()
  @ApiOperation({ summary: 'Change price / limits / on-off (super admin)' })
  @ApiEnvelopeResponse(PromotionSettingsDto)
  @ApiErrors({ 400: [E.VALIDATION_ERROR] })
  updatePromotionSettings(
    @CurrentAdmin() admin: AdminActor,
    @Body() dto: PromotionSettingsDto,
  ): Promise<PromotionSettings> {
    return this.promotions.updateSettings(admin, dto);
  }

  @Roles('super_admin', 'finance')
  @Post('grant')
  @SkipAutoAudit()
  @ApiOperation({ summary: 'Promote a case for free' })
  @ApiEnvelopeResponse(AdminPromotionActionResultDto, { status: 201 })
  @ApiErrors({
    400: [E.VALIDATION_ERROR],
    404: [E.CASE_NOT_FOUND],
    409: [E.CASE_INVALID_STATE, E.PROMOTION_ALREADY_ACTIVE],
  })
  grantAdminPromotion(
    @CurrentAdmin() admin: AdminActor,
    @Body() dto: AdminGrantPromotionDto,
  ): Promise<AdminPromotionActionResultDto> {
    return this.promotions.grant(admin, dto.caseId, dto.days, dto.reason);
  }

  @Roles('super_admin', 'finance')
  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @SkipAutoAudit()
  @ApiOperation({
    summary:
      'Cancel a promotion (a paid one is refunded from the Payments screen)',
  })
  @ApiEnvelopeResponse(AdminPromotionActionResultDto)
  @ApiErrors({
    400: [E.VALIDATION_ERROR],
    404: [E.NOT_FOUND],
    409: [E.PROMOTION_INVALID_STATE],
  })
  cancelAdminPromotion(
    @CurrentAdmin() admin: AdminActor,
    @Param() p: AdminPromotionIdParamDto,
    @Body() dto: AdminCancelPromotionDto,
  ): Promise<AdminPromotionActionResultDto> {
    return this.promotions.cancel(admin, p.id, dto.reason);
  }

  @Roles('super_admin', 'finance')
  @Post(':id/extend')
  @HttpCode(HttpStatus.OK)
  @SkipAutoAudit()
  @ApiOperation({ summary: 'Add days to a running promotion' })
  @ApiEnvelopeResponse(AdminPromotionActionResultDto)
  @ApiErrors({
    400: [E.VALIDATION_ERROR],
    404: [E.NOT_FOUND],
    409: [E.PROMOTION_INVALID_STATE],
  })
  extendAdminPromotion(
    @CurrentAdmin() admin: AdminActor,
    @Param() p: AdminPromotionIdParamDto,
    @Body() dto: AdminExtendPromotionDto,
  ): Promise<AdminPromotionActionResultDto> {
    return this.promotions.extend(admin, p.id, dto.days, dto.reason);
  }
}
