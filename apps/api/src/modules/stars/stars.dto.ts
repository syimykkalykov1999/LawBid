import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

// ── user side ───────────────────────────────────────────────────────────

export class StarPackDto {
  @ApiProperty() @Matches(/^[a-z][a-z0-9_]{1,39}$/) id!: string;
  @ApiProperty({ type: 'integer' })
  @IsInt()
  @Min(1)
  @Max(1_000_000)
  stars!: number;
  @ApiProperty({ type: 'integer', description: 'US cents' })
  @IsInt()
  @Min(50)
  @Max(10_000_000)
  priceCents!: number;
}

export class StarsOverviewDto {
  @ApiProperty() enabled!: boolean;
  @ApiProperty({ type: 'integer' }) balance!: number;
  @ApiProperty({ type: [StarPackDto] }) packs!: StarPackDto[];
  @ApiProperty({
    type: 'integer',
    description: 'Percent of a gift price a receiver gets turning it to stars.',
  })
  giftConvertPercent!: number;
  @ApiProperty({
    type: 'integer',
    description: 'Cents one star is worth (Boost price conversion).',
  })
  starCents!: number;
  @ApiProperty({
    type: 'integer',
    description: 'Stars a premium reaction costs.',
  })
  reactionStars!: number;
  @ApiProperty({ type: [String], description: 'Reactions charged in stars.' })
  premiumReactions!: string[];
  @ApiProperty({ type: [String], description: 'Reactions free for everyone.' })
  freeReactions!: string[];
}

export class StarsBuyDto {
  @ApiProperty() purchaseId!: string;
  @ApiProperty() checkoutUrl!: string;
}

export class StarsPurchaseDto {
  @ApiProperty({ enum: ['pending_payment', 'paid', 'canceled'] })
  status!: string;
  @ApiProperty({ type: 'integer' }) stars!: number;
  @ApiProperty({ type: 'integer' }) balance!: number;
}

export class StarLedgerItemDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ type: 'integer' }) delta!: number;
  @ApiProperty({ type: 'integer' }) balanceAfter!: number;
  @ApiProperty({
    enum: [
      'topup',
      'gift_sent',
      'gift_converted',
      'sticker_pack',
      'admin_grant',
      'refund',
    ],
  })
  kind!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) note!: string | null;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
}

export class StarsLedgerQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  cursor?: string;
}

export class GiftDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() title!: string;
  @ApiProperty({ type: 'integer' }) priceStars!: number;
  @ApiProperty({ type: String, nullable: true }) url!: string | null;
}

export class GiftSendDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ type: GiftDto }) gift!: GiftDto;
  @ApiPropertyOptional({ type: String, nullable: true, format: 'uuid' })
  senderId!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true })
  senderName!: string | null;
  @ApiProperty() anonymous!: boolean;
  @ApiPropertyOptional({ type: String, nullable: true })
  note!: string | null;
  @ApiProperty() shown!: boolean;
  @ApiPropertyOptional({ type: 'integer', nullable: true })
  convertedStars!: number | null;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
}

export class SendProfileGiftDto {
  @ApiProperty({ format: 'uuid' }) @IsUUID('all') recipientId!: string;
  @ApiPropertyOptional({ maxLength: 200 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(200)
  note?: string;
  @ApiPropertyOptional({ description: 'Hide who gave it from the receiver.' })
  @IsOptional()
  @IsBoolean()
  anonymous?: boolean;
}

export class GiftShowcaseQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  cursor?: string;
}

export class SetGiftShownDto {
  @ApiProperty() @IsBoolean() shown!: boolean;
}

export class ConvertGiftResultDto {
  @ApiProperty({ type: 'integer' }) stars!: number;
  @ApiProperty({ type: 'integer' }) balance!: number;
}

// ── admin side ──────────────────────────────────────────────────────────

export class StarsAdminSettingsDto {
  @ApiProperty({ type: [StarPackDto] }) packs!: StarPackDto[];
  @ApiProperty() enabled!: boolean;
  @ApiProperty({ type: 'integer' }) giftConvertPercent!: number;
  @ApiProperty({ type: 'integer' }) giftsPerDayMax!: number;
  @ApiProperty({
    type: 'integer',
    description: 'US cents one star is worth when a Boost is paid in stars.',
  })
  starCents!: number;
  @ApiProperty({
    type: 'integer',
    description: 'Stars one premium reaction costs.',
  })
  reactionStars!: number;
  @ApiProperty({ type: [String] }) premiumReactions!: string[];
}

export class SaveStarsSettingsDto {
  @ApiProperty({ type: [StarPackDto] })
  @IsArray()
  @ArrayMaxSize(12)
  @ValidateNested({ each: true })
  @Type(() => StarPackDto)
  packs!: StarPackDto[];

  @ApiProperty({ type: 'integer', minimum: 0, maximum: 100 })
  @IsInt()
  @Min(0)
  @Max(100)
  giftConvertPercent!: number;

  @ApiProperty({ type: 'integer', minimum: 1, maximum: 1000 })
  @IsInt()
  @Min(1)
  @Max(1000)
  giftsPerDayMax!: number;

  @ApiProperty({ type: 'integer', minimum: 1, maximum: 1000 })
  @IsInt()
  @Min(1)
  @Max(1000)
  starCents!: number;

  @ApiProperty({ type: 'integer', minimum: 1, maximum: 1000 })
  @IsInt()
  @Min(1)
  @Max(1000)
  reactionStars!: number;

  @ApiProperty({ type: [String], maxItems: 24 })
  @IsArray()
  @ArrayMaxSize(24)
  @IsString({ each: true })
  @MaxLength(16, { each: true })
  premiumReactions!: string[];
}

export class AdminGiftDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() title!: string;
  @ApiProperty({ type: 'integer' }) priceStars!: number;
  @ApiProperty({ format: 'uuid' }) fileId!: string;
  @ApiProperty({ type: String, nullable: true }) url!: string | null;
  @ApiProperty({ type: 'integer' }) position!: number;
  @ApiProperty({ enum: ['active', 'hidden'] }) status!: string;
  @ApiProperty({ type: 'integer' }) sentCount!: number;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
}

export class CreateGiftDto {
  @ApiProperty({ minLength: 1, maxLength: 64 })
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  title!: string;

  @ApiProperty({ type: 'integer', minimum: 1, maximum: 1_000_000 })
  @IsInt()
  @Min(1)
  @Max(1_000_000)
  priceStars!: number;

  @ApiProperty({
    format: 'uuid',
    description: 'A clean `sticker` file uploaded by this admin.',
  })
  @IsUUID('all')
  fileId!: string;
}

export class UpdateGiftDto {
  @ApiPropertyOptional({ minLength: 1, maxLength: 64 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  title?: string;

  @ApiPropertyOptional({ type: 'integer', minimum: 1, maximum: 1_000_000 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1_000_000)
  priceStars?: number;

  @ApiPropertyOptional({ type: 'integer', minimum: 0, maximum: 10000 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10000)
  position?: number;

  @ApiPropertyOptional({ enum: ['active', 'hidden'] })
  @IsOptional()
  @IsIn(['active', 'hidden'])
  status?: string;
}

export class GrantStarsDto {
  @ApiProperty({ format: 'uuid' }) @IsUUID('all') userId!: string;
  @ApiProperty({
    type: 'integer',
    description: 'Positive adds, negative takes back (never below zero).',
  })
  @IsInt()
  @Min(-1_000_000)
  @Max(1_000_000)
  amount!: number;
  @ApiProperty({ maxLength: 120 })
  @Transform(trim)
  @IsString()
  @MinLength(3)
  @MaxLength(120)
  reason!: string;
}

export class StarsBalanceDto {
  @ApiProperty({ type: 'integer' }) balance!: number;
}

export class StarsKindTotalDto {
  @ApiProperty() kind!: string;
  @ApiProperty({ type: 'integer' }) stars!: number;
  @ApiProperty({ type: 'integer' }) count!: number;
}

export class StarsTopGiftDto {
  @ApiProperty() title!: string;
  @ApiProperty({ type: 'integer' }) sent!: number;
  @ApiProperty({ type: 'integer' }) stars!: number;
}

export class StarsDebtDto {
  @ApiProperty({ format: 'uuid' }) userId!: string;
  @ApiProperty({ type: 'integer', description: 'Stars still owed.' })
  debt!: number;
  @ApiProperty({ type: 'integer' }) balance!: number;
}

export class StarsReportDto {
  @ApiProperty({ type: 'integer' }) days!: number;
  @ApiProperty({ type: 'integer', description: 'Stars bought in the period.' })
  starsSold!: number;
  @ApiProperty({ type: 'integer', description: 'US cents paid for them.' })
  revenueCents!: number;
  @ApiProperty({ type: 'integer' }) purchases!: number;
  @ApiProperty({
    type: 'integer',
    description: 'Stars spent in the period (gifts, sticker packs).',
  })
  starsSpent!: number;
  @ApiProperty({
    type: 'integer',
    description: 'Stars users hold now — what we still owe in goods.',
  })
  outstandingStars!: number;
  @ApiProperty({
    type: 'integer',
    description: 'Stars owed after refunded top-ups that were already spent.',
  })
  debtStars!: number;
  @ApiProperty({ type: 'integer' }) debtUsers!: number;
  @ApiProperty({ type: 'integer' }) giftsSent!: number;
  @ApiProperty({
    type: 'integer',
    description: 'Stars handed back to receivers (the rest is our fee).',
  })
  starsConverted!: number;
  @ApiProperty({ type: [StarsKindTotalDto] }) byKind!: StarsKindTotalDto[];
  @ApiProperty({ type: [StarsTopGiftDto] }) topGifts!: StarsTopGiftDto[];
}

export class StarsReportQueryDto {
  @ApiPropertyOptional({ type: 'integer', minimum: 1, maximum: 365 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(365)
  days?: number;
}

export class AdminStarsLedgerQueryDto extends StarsLedgerQueryDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('all')
  userId?: string;
}

export class AdminGiftIdParamDto {
  @ApiProperty({ format: 'uuid' }) @IsUUID('all') id!: string;
}
