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
import {
  ApiBearerAuth,
  ApiOperation,
  ApiProperty,
  ApiTags,
} from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  Matches,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  ApiEnvelopeResponse,
  ApiErrors,
  AUTHENTICATED_ERRORS,
} from '../../common/dto/api-docs.decorators';
import { ErrorCode } from '../../common/errors/error-code.enum';
import { AdminEndpoint } from '../admin-auth/admin-auth.decorators';
import { AttorneyOnly } from '../auth/assistant/assistant-context';
import {
  CurrentUser,
  type RequestUser,
} from '../auth/decorators/current-user.decorator';
import { BidPacksService } from './bid-packs.service';

const E = ErrorCode;

export class BidPackDto {
  @ApiProperty() @Matches(/^[a-z][a-z0-9_]{1,39}$/) id!: string;
  @ApiProperty({ type: 'integer' }) @IsInt() @Min(1) @Max(10000) bids!: number;
  @ApiProperty({ type: 'integer', description: 'US cents' })
  @IsInt()
  @Min(100)
  @Max(10_000_000)
  priceCents!: number;
}

export class BidPacksDto {
  @ApiProperty() enabled!: boolean;
  @ApiProperty({ type: 'integer' }) balance!: number;
  @ApiProperty({ type: [BidPackDto] }) packs!: BidPackDto[];
}

export class BidPackBuyDto {
  @ApiProperty() purchaseId!: string;
  @ApiProperty() checkoutUrl!: string;
}

export class BidPackPurchaseDto {
  @ApiProperty({ enum: ['pending_payment', 'paid', 'canceled'] })
  status!: string;
  @ApiProperty({ type: 'integer' }) bids!: number;
  @ApiProperty({ type: 'integer' }) balance!: number;
}

export class SaveBidPacksDto {
  @ApiProperty({ type: [BidPackDto] })
  @IsArray()
  @ArrayMaxSize(8)
  @ValidateNested({ each: true })
  @Type(() => BidPackDto)
  packs!: BidPackDto[];
}

/** Owner 2026-10-14: extra offers bought on top of the plan's limit. */
@ApiTags('bid-packs')
@ApiBearerAuth()
@ApiErrors(AUTHENTICATED_ERRORS)
@Controller('bid-packs')
export class BidPacksController {
  constructor(private readonly packs: BidPacksService) {}

  @Get()
  @ApiOperation({ summary: 'Packs on offer and the credit balance' })
  @ApiEnvelopeResponse(BidPacksDto)
  bidPacksOverview(@CurrentUser() user: RequestUser): Promise<BidPacksDto> {
    return this.packs.overview(user.sub);
  }

  @AttorneyOnly()
  @Post(':packId/buy')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Start the payment for a pack' })
  @ApiEnvelopeResponse(BidPackBuyDto)
  @ApiErrors({
    403: [E.FORBIDDEN, E.ATTORNEY_NOT_VERIFIED],
    404: [E.NOT_FOUND],
    409: [E.FEATURE_DISABLED],
    503: [E.PAYMENTS_NOT_CONFIGURED],
  })
  buyBidPack(
    @CurrentUser() user: RequestUser,
    @Param('packId') packId: string,
  ): Promise<BidPackBuyDto> {
    return this.packs.buy(user.sub, packId);
  }

  @Get('purchases/:id')
  @ApiOperation({ summary: 'A purchase after the payment page' })
  @ApiEnvelopeResponse(BidPackPurchaseDto)
  @ApiErrors({ 404: [E.NOT_FOUND] })
  getBidPackPurchase(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
  ): Promise<BidPackPurchaseDto> {
    return this.packs.purchase(user.sub, id);
  }
}

/** The owner edits sizes and prices; the flag `bid_packs` switches it on. */
@ApiTags('admin-billing')
@AdminEndpoint('super_admin')
@Controller('admin/billing/bid-packs')
export class AdminBidPacksController {
  constructor(private readonly packs: BidPacksService) {}

  @Get()
  @ApiOperation({ summary: 'Offer packs: sizes and prices' })
  @ApiEnvelopeResponse(SaveBidPacksDto)
  async listBidPacks(): Promise<SaveBidPacksDto> {
    return { packs: await this.packs.packs() };
  }

  @Put()
  @ApiOperation({ summary: 'Save the offer packs' })
  @ApiEnvelopeResponse(SaveBidPacksDto)
  @ApiErrors({ 400: [E.VALIDATION_ERROR] })
  async saveBidPacks(@Body() dto: SaveBidPacksDto): Promise<SaveBidPacksDto> {
    return { packs: await this.packs.savePacks(dto.packs) };
  }
}
