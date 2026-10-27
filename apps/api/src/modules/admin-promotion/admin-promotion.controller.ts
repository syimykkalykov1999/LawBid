import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
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
  SkipAutoAudit,
  type AdminActor,
  ALL_ADMIN_ROLES,
} from '../admin-auth/admin-auth.decorators';
import { UpdateConfigDto } from '../admin-config/admin-config.dto';
import {
  PromotionDryRunResultDto,
  PromotionKeyParamDto,
  PromotionOverviewDto,
  PromotionSettingDto,
} from './promotion.dto';
import { PromotionService } from './promotion.service';

const E = ErrorCode;

/**
 * Owner 2026-10-27: admin page «Продвижение». Area `promotion` (route
 * segment `promotion`): the super admin always, any other admin only when
 * the owner switched the area on (everyone else gets 404). Writes go
 * through AdminConfigService, which keeps the before/after audit row.
 */
@ApiTags('admin-promotion')
@AdminEndpoint(...ALL_ADMIN_ROLES)
@SkipAutoAudit()
@Controller('admin/promotion')
export class AdminPromotionController {
  constructor(private readonly promotion: PromotionService) {}

  @Get()
  @ApiOperation({
    summary:
      'SEO switches, channel checklist, last-build status from seo-manifest.json',
  })
  @ApiEnvelopeResponse(PromotionOverviewDto)
  promotionOverview(): Promise<PromotionOverviewDto> {
    return this.promotion.overview();
  }

  @Put('settings/:key')
  @ApiOperation({
    summary: 'Set one SEO switch or tick one checklist item (seo.* only)',
  })
  @ApiEnvelopeResponse(PromotionSettingDto)
  @ApiErrors({ 400: [E.VALIDATION_ERROR] })
  updatePromotionSetting(
    @CurrentAdmin() admin: AdminActor,
    @Param() params: PromotionKeyParamDto,
    @Body() dto: UpdateConfigDto,
  ): Promise<PromotionSettingDto> {
    return this.promotion.update(admin, params.key, dto.value);
  }

  @Post('dry-run')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Start the SEO workflow as a dry run (publishes nothing), or return the command to run by hand',
  })
  @ApiEnvelopeResponse(PromotionDryRunResultDto)
  @ApiErrors({ 429: [E.RATE_LIMITED] })
  startSeoDryRun(
    @CurrentAdmin() admin: AdminActor,
  ): Promise<PromotionDryRunResultDto> {
    return this.promotion.dryRun(admin);
  }
}
