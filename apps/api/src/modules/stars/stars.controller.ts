import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsString, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import {
  ApiEnvelopeResponse,
  ApiErrors,
  AUTHENTICATED_ERRORS,
} from '../../common/dto/api-docs.decorators';
import type { Request } from 'express';
import { apiBaseOf } from '../billing/pay-link.service';
import { ErrorCode } from '../../common/errors/error-code.enum';
import { RequireAppCheck } from '../auth/auth.public';
import {
  AdminEndpoint,
  CurrentAdmin,
  type AdminActor,
} from '../admin-auth/admin-auth.decorators';
import {
  CurrentUser,
  type RequestUser,
} from '../auth/decorators/current-user.decorator';
import {
  AdminStarsLedgerQueryDto,
  ConvertGiftResultDto,
  GiftSendDto,
  GiftShowcaseQueryDto,
  StarsDebtDto,
  GrantStarsDto,
  SaveStarsSettingsDto,
  SetGiftShownDto,
  StarLedgerItemDto,
  StarsAdminSettingsDto,
  StarsBalanceDto,
  StarsBuyDto,
  StarsLedgerQueryDto,
  StarsOverviewDto,
  StarsPurchaseDto,
  StarsReportDto,
  StarsReportQueryDto,
} from './stars.dto';
import { StarsService, type Page } from './stars.service';
import { AdminAuthService } from '../admin-auth/admin-auth.service';
import {
  AssistantAllowed,
  AttorneyOnly,
} from '../auth/assistant/assistant-context';

const E = ErrorCode;

class PackIdParamDto {
  @ApiProperty() @IsString() @Matches(/^[a-z][a-z0-9_]{1,39}$/) packId!: string;
}

class UuidParamDto {
  @ApiProperty({ format: 'uuid' })
  @Matches(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)
  id!: string;
}

/** Owner 2026-10-20: stars — balance, web top-up. Owner 26.11: gifts are
 * gone; only received gifts can still be listed, hidden or turned into stars. */
@ApiTags('stars')
@ApiBearerAuth()
@ApiErrors(AUTHENTICATED_ERRORS)
@Controller('stars')
export class StarsController {
  constructor(private readonly stars: StarsService) {}

  @AttorneyOnly()
  @Get()
  @ApiOperation({ summary: 'Stars balance and the packs on offer' })
  @ApiEnvelopeResponse(StarsOverviewDto)
  starsOverview(@CurrentUser() user: RequestUser): Promise<StarsOverviewDto> {
    return this.stars.overview(user.sub);
  }

  @AttorneyOnly()
  @Get('history')
  @ApiOperation({ summary: 'My stars history, newest first' })
  @ApiEnvelopeResponse(StarLedgerItemDto, { isArray: true })
  @ApiErrors({ 400: [E.VALIDATION_ERROR] })
  starsHistory(
    @CurrentUser() user: RequestUser,
    @Query() q: StarsLedgerQueryDto,
  ): Promise<Page<StarLedgerItemDto>> {
    return this.stars.history(user.sub, q.cursor);
  }

  // Owner 2026-10-22 (security audit #3, finding 3): stars are the
  // attorney's money — an assistant must not buy them, send gifts bought
  // with them to their own profile, or convert received gifts into stars.
  @AttorneyOnly()
  // Item 13 (L2, 2026-11-25): starting a payment carries the bot check
  // (admin security.app_check.payments.mode; log only by default).
  @RequireAppCheck({
    group: 'payments',
    signedIn: true,
    consumeWhen: () => true,
  })
  @Post('packs/:packId/buy')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Start the payment (web page) for a stars pack' })
  @ApiEnvelopeResponse(StarsBuyDto)
  @ApiErrors({
    404: [E.NOT_FOUND],
    409: [E.FEATURE_DISABLED],
    503: [E.PAYMENTS_NOT_CONFIGURED],
  })
  buyStars(
    @CurrentUser() user: RequestUser,
    @Param() p: PackIdParamDto,
    @Req() req: Request,
  ): Promise<StarsBuyDto> {
    return this.stars.buy(user.sub, p.packId, apiBaseOf(req));
  }

  @AttorneyOnly()
  @Get('purchases/:id')
  @ApiOperation({ summary: 'A stars purchase after the payment page' })
  @ApiEnvelopeResponse(StarsPurchaseDto)
  @ApiErrors({ 404: [E.NOT_FOUND] })
  getStarsPurchase(
    @CurrentUser() user: RequestUser,
    @Param() p: UuidParamDto,
  ): Promise<StarsPurchaseDto> {
    return this.stars.purchase(user.sub, p.id);
  }

  @AssistantAllowed()
  @Get('users/:id/gifts')
  @ApiOperation({ summary: "A profile's gifts (the owner sees all of theirs)" })
  @ApiEnvelopeResponse(GiftSendDto, { isArray: true })
  @ApiErrors({ 403: [E.USER_BLOCKED] })
  giftShowcase(
    @CurrentUser() user: RequestUser,
    @Param() p: UuidParamDto,
    @Query() q: GiftShowcaseQueryDto,
  ): Promise<Page<GiftSendDto>> {
    return this.stars.showcase(user.sub, p.id, q.cursor);
  }

  @AttorneyOnly()
  @Patch('received-gifts/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Show a received gift on my profile, or hide it' })
  @ApiErrors({ 404: [E.NOT_FOUND] })
  async setGiftShown(
    @CurrentUser() user: RequestUser,
    @Param() p: UuidParamDto,
    @Body() dto: SetGiftShownDto,
  ): Promise<void> {
    await this.stars.setShown(user.sub, p.id, dto.shown);
  }

  @AttorneyOnly()
  @Post('received-gifts/:id/convert')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Turn a received gift into stars' })
  @ApiEnvelopeResponse(ConvertGiftResultDto)
  @ApiErrors({
    403: [E.FORBIDDEN],
    404: [E.NOT_FOUND],
    409: [E.CONTENT_INVALID_STATE, E.FEATURE_DISABLED],
  })
  convertGift(
    @CurrentUser() user: RequestUser,
    @Param() p: UuidParamDto,
  ): Promise<ConvertGiftResultDto> {
    return this.stars.convert(user.sub, p.id);
  }
}

/** The owner: pack sizes and prices, the report. */
@ApiTags('admin-stars')
@AdminEndpoint('super_admin')
@Controller('admin/stars')
export class AdminStarsController {
  constructor(
    private readonly stars: StarsService,
    private readonly auth: AdminAuthService,
  ) {}

  @Get('settings')
  @ApiOperation({ summary: 'Stars: packs, the gift fee, the daily brake' })
  @ApiEnvelopeResponse(StarsAdminSettingsDto)
  adminStarsSettings(): Promise<StarsAdminSettingsDto> {
    return this.stars.adminSettings();
  }

  @Put('settings')
  @ApiOperation({ summary: 'Save the stars packs and gift settings' })
  @ApiEnvelopeResponse(StarsAdminSettingsDto)
  @ApiErrors({ 400: [E.VALIDATION_ERROR], 403: [E.ADMIN_STEP_UP_REQUIRED] })
  async saveAdminStarsSettings(
    @CurrentAdmin() admin: AdminActor,
    @Body() dto: SaveStarsSettingsDto,
  ): Promise<StarsAdminSettingsDto> {
    // Round 4 (25.11, С2): star pack prices and the gift fee are money.
    await this.auth.assertStepUp(admin.sessionId);
    return this.stars.saveSettings(dto);
  }

  @Get('report')
  @ApiOperation({ summary: 'Stars report for «Деньги»' })
  @ApiEnvelopeResponse(StarsReportDto)
  adminStarsReport(@Query() q: StarsReportQueryDto): Promise<StarsReportDto> {
    return this.stars.report(q.days ?? 30);
  }

  @Get('debts')
  @ApiOperation({ summary: 'Accounts that owe stars after a refund' })
  @ApiEnvelopeResponse(StarsDebtDto, { isArray: true })
  adminStarsDebts(): Promise<StarsDebtDto[]> {
    return this.stars.debts();
  }

  @Get('ledger')
  @ApiOperation({ summary: 'Stars history of everyone, or of one user' })
  @ApiEnvelopeResponse(StarLedgerItemDto, { isArray: true })
  @ApiErrors({ 400: [E.VALIDATION_ERROR] })
  adminStarsLedger(
    @Query() q: AdminStarsLedgerQueryDto,
  ): Promise<Page<StarLedgerItemDto>> {
    return this.stars.ledgerPage(
      q.userId ? { user_id: q.userId } : {},
      q.cursor,
    );
  }

  @Post('grant')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Add or take back stars by hand, with a reason' })
  @ApiEnvelopeResponse(StarsBalanceDto)
  @ApiErrors({
    400: [E.VALIDATION_ERROR],
    402: [E.INSUFFICIENT_STARS],
    403: [E.ADMIN_STEP_UP_REQUIRED],
    404: [E.NOT_FOUND],
  })
  async grantStars(
    @CurrentAdmin() admin: AdminActor,
    @Body() dto: GrantStarsDto,
  ): Promise<StarsBalanceDto> {
    // Owner 2026-10-22: stars are bought with money — a fresh 2FA code.
    await this.auth.assertStepUp(admin.sessionId);
    return {
      balance: await this.stars.grant(
        admin,
        dto.userId,
        dto.amount,
        dto.reason,
      ),
    };
  }
}
