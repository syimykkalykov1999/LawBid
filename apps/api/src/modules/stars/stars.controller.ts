import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsString, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import {
  ApiEnvelopeResponse,
  ApiErrors,
  AUTHENTICATED_ERRORS,
} from '../../common/dto/api-docs.decorators';
import { ErrorCode } from '../../common/errors/error-code.enum';
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
  AdminGiftDto,
  AdminGiftIdParamDto,
  AdminStarsLedgerQueryDto,
  ConvertGiftResultDto,
  CreateGiftDto,
  GiftDto,
  GiftSendDto,
  GiftShowcaseQueryDto,
  GrantStarsDto,
  SaveStarsSettingsDto,
  SendProfileGiftDto,
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
  UpdateGiftDto,
} from './stars.dto';
import { StarsService, type Page } from './stars.service';

const E = ErrorCode;

class PackIdParamDto {
  @ApiProperty() @IsString() @Matches(/^[a-z][a-z0-9_]{1,39}$/) packId!: string;
}

class UuidParamDto {
  @ApiProperty({ format: 'uuid' })
  @Matches(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)
  id!: string;
}

class GiftIdParamDto {
  @ApiProperty({ format: 'uuid' })
  @Matches(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)
  giftId!: string;
}

/** Owner 2026-10-20: stars — balance, web top-up, gifts. */
@ApiTags('stars')
@ApiBearerAuth()
@ApiErrors(AUTHENTICATED_ERRORS)
@Controller('stars')
export class StarsController {
  constructor(private readonly stars: StarsService) {}

  @Get()
  @ApiOperation({ summary: 'Stars balance and the packs on offer' })
  @ApiEnvelopeResponse(StarsOverviewDto)
  starsOverview(@CurrentUser() user: RequestUser): Promise<StarsOverviewDto> {
    return this.stars.overview(user.sub);
  }

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
  ): Promise<StarsBuyDto> {
    return this.stars.buy(user.sub, p.packId);
  }

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

  @Get('gifts')
  @ApiOperation({ summary: 'The gift catalog' })
  @ApiEnvelopeResponse(GiftDto, { isArray: true })
  listGifts(): Promise<GiftDto[]> {
    return this.stars.catalog();
  }

  @Post('gifts/:giftId/send')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Give a gift to a profile (paid in stars)' })
  @ApiEnvelopeResponse(GiftSendDto)
  @ApiErrors({
    400: [E.VALIDATION_ERROR],
    402: [E.INSUFFICIENT_STARS],
    403: [E.USER_BLOCKED],
    404: [E.NOT_FOUND],
    409: [E.FEATURE_DISABLED],
    429: [E.RATE_LIMITED],
  })
  sendGiftToProfile(
    @CurrentUser() user: RequestUser,
    @Param() p: GiftIdParamDto,
    @Body() dto: SendProfileGiftDto,
  ): Promise<GiftSendDto> {
    return this.stars.sendToProfile(user.sub, p.giftId, dto);
  }

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

/** The owner: pack sizes and prices, the gift catalog, the report. */
@ApiTags('admin-stars')
@AdminEndpoint('super_admin')
@Controller('admin/stars')
export class AdminStarsController {
  constructor(private readonly stars: StarsService) {}

  @Get('settings')
  @ApiOperation({ summary: 'Stars: packs, the gift fee, the daily brake' })
  @ApiEnvelopeResponse(StarsAdminSettingsDto)
  adminStarsSettings(): Promise<StarsAdminSettingsDto> {
    return this.stars.adminSettings();
  }

  @Put('settings')
  @ApiOperation({ summary: 'Save the stars packs and gift settings' })
  @ApiEnvelopeResponse(StarsAdminSettingsDto)
  @ApiErrors({ 400: [E.VALIDATION_ERROR] })
  saveAdminStarsSettings(
    @Body() dto: SaveStarsSettingsDto,
  ): Promise<StarsAdminSettingsDto> {
    return this.stars.saveSettings(dto);
  }

  @Get('gifts')
  @ApiOperation({ summary: 'The gift catalog with counts' })
  @ApiEnvelopeResponse(AdminGiftDto, { isArray: true })
  adminGifts(): Promise<AdminGiftDto[]> {
    return this.stars.adminGifts();
  }

  @Post('gifts')
  @ApiOperation({ summary: 'Add a gift (an uploaded clean image)' })
  @ApiEnvelopeResponse(AdminGiftDto, { status: HttpStatus.CREATED })
  @ApiErrors({
    400: [E.VALIDATION_ERROR],
    409: [E.FILE_NOT_ATTACHABLE],
  })
  createAdminGift(
    @CurrentAdmin() admin: AdminActor,
    @Body() dto: CreateGiftDto,
  ): Promise<AdminGiftDto> {
    return this.stars.createGift(admin, dto);
  }

  @Patch('gifts/:id')
  @ApiOperation({ summary: 'Change a gift: title, price, order, visibility' })
  @ApiEnvelopeResponse(AdminGiftDto)
  @ApiErrors({ 400: [E.VALIDATION_ERROR], 404: [E.NOT_FOUND] })
  updateAdminGift(
    @Param() p: AdminGiftIdParamDto,
    @Body() dto: UpdateGiftDto,
  ): Promise<AdminGiftDto> {
    return this.stars.updateGift(p.id, dto);
  }

  @Delete('gifts/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove a gift from the catalog' })
  @ApiErrors({ 404: [E.NOT_FOUND] })
  async deleteAdminGift(@Param() p: AdminGiftIdParamDto): Promise<void> {
    await this.stars.deleteGift(p.id);
  }

  @Get('report')
  @ApiOperation({ summary: 'Stars report for «Деньги»' })
  @ApiEnvelopeResponse(StarsReportDto)
  adminStarsReport(@Query() q: StarsReportQueryDto): Promise<StarsReportDto> {
    return this.stars.report(q.days ?? 30);
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
    404: [E.NOT_FOUND],
  })
  async grantStars(
    @CurrentAdmin() admin: AdminActor,
    @Body() dto: GrantStarsDto,
  ): Promise<StarsBalanceDto> {
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
