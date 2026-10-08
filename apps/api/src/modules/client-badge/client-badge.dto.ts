import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { PriceDiscountDto } from '../billing/price-discount.dto';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export const CLIENT_BADGE_STATUSES = [
  'none',
  'pending',
  'approved',
  'rejected',
  'revoked',
] as const;
export type ClientBadgeStatus = (typeof CLIENT_BADGE_STATUSES)[number];

export const CLIENT_BADGE_SUB_STATUSES = [
  'none',
  'active',
  'past_due',
  'canceled',
  'comped',
] as const;

export class ClientBadgeSubscriptionDto {
  @ApiProperty({ enum: CLIENT_BADGE_SUB_STATUSES })
  status!: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  currentPeriodEnd!: string | null;

  @ApiProperty()
  cancelAtPeriodEnd!: boolean;
}

export class ClientBadgeStateDto {
  @ApiProperty({
    enum: CLIENT_BADGE_STATUSES,
    enumName: 'ClientBadgeStatus',
    description: 'none = never applied.',
  })
  status!: ClientBadgeStatus;

  @ApiProperty({ description: 'The gold badge is on now.' })
  badgeActive!: boolean;

  @ApiProperty({ type: 'integer', description: 'Per month, in cents.' })
  priceCents!: number;

  @ApiProperty({
    type: PriceDiscountDto,
    nullable: true,
    description: 'Owner 2026-10-07: the strikethrough old price, or null.',
  })
  discount!: PriceDiscountDto | null;

  @ApiProperty({ example: 'usd' })
  currency!: string;

  @ApiProperty({
    description: 'Documents can be sent (none / rejected / revoked).',
  })
  canSubmit!: boolean;

  @ApiProperty({
    description: 'Approved and not paid: the checkout can start.',
  })
  canSubscribe!: boolean;

  @ApiProperty({
    description:
      "Owner 2026-10-05: the client's plan includes the badge — no separate payment; the badge shows once the documents are approved.",
  })
  includedInPlan!: boolean;

  @ApiPropertyOptional({ type: ClientBadgeSubscriptionDto, nullable: true })
  subscription!: ClientBadgeSubscriptionDto | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  submittedAt!: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  rejectReason!: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  revokeReason!: string | null;
}

export class SubmitClientBadgeDto {
  @ApiProperty({
    type: [String],
    format: 'uuid',
    description: 'Uploaded verification_document / verification_selfie files.',
  })
  @IsArray()
  @ArrayMinSize(1)
  // Hard ceiling; the live count is the admin's (bug 17, default 5).
  @ArrayMaxSize(10)
  @IsUUID('all', { each: true })
  fileIds!: string[];

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class ClientBadgeCheckoutDto {
  @ApiProperty({ description: 'Stripe checkout page; open it in the browser.' })
  checkoutUrl!: string;
}

// ---- admin ----------------------------------------------------------------

export class AdminClientBadgeQueryDto {
  @ApiPropertyOptional({ enum: ['pending', 'approved', 'rejected', 'revoked'] })
  @IsOptional()
  @IsIn(['pending', 'approved', 'rejected', 'revoked'])
  status?: 'pending' | 'approved' | 'rejected' | 'revoked';

  @ApiPropertyOptional({ enum: CLIENT_BADGE_SUB_STATUSES })
  @IsOptional()
  @IsIn(CLIENT_BADGE_SUB_STATUSES)
  subStatus?: (typeof CLIENT_BADGE_SUB_STATUSES)[number];

  @ApiPropertyOptional({ maxLength: 60, description: 'Name or @username.' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(60)
  q?: string;

  @ApiPropertyOptional({ description: 'meta.nextCursor of the previous page.' })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  cursor?: string;
}

export class AdminClientBadgeIdParamDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('all')
  id!: string;
}

export class AdminClientBadgeRowDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid' }) userId!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) displayName!:
    string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) username!:
    string | null;
  @ApiProperty({ enum: CLIENT_BADGE_STATUSES.filter((s) => s !== 'none') })
  status!: string;
  @ApiProperty({ enum: CLIENT_BADGE_SUB_STATUSES }) subStatus!: string;
  @ApiProperty() badgeActive!: boolean;
  @ApiProperty({ type: 'integer' }) documentsCount!: number;
  @ApiProperty() submittedAt!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) reviewedAt!:
    string | null;
}

export class AdminClientBadgeDocumentDto {
  @ApiProperty({ format: 'uuid' }) fileId!: string;
  @ApiPropertyOptional({ type: String, nullable: true })
  url!: string | null;
}

export class AdminClientBadgeDto extends AdminClientBadgeRowDto {
  @ApiPropertyOptional({ type: String, nullable: true }) note!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) rejectReason!:
    string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) revokeReason!:
    string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) currentPeriodEnd!:
    string | null;
  @ApiProperty() cancelAtPeriodEnd!: boolean;
  @ApiProperty({ type: [AdminClientBadgeDocumentDto] })
  @Type(() => AdminClientBadgeDocumentDto)
  documents!: AdminClientBadgeDocumentDto[];
}

export class AdminClientBadgeApproveDto {
  @ApiPropertyOptional({
    default: false,
    description: 'Give the badge free (no $10 subscription needed).',
  })
  @IsOptional()
  @IsBoolean()
  free?: boolean;
}

export class AdminClientBadgeReasonDto {
  @ApiPropertyOptional({ type: String, maxLength: 500 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(500)
  reason = '';
}

export class AdminClientBadgeBulkApproveDto extends AdminClientBadgeApproveDto {
  @ApiProperty({ type: [String], format: 'uuid', maxItems: 100 })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @IsUUID('all', { each: true })
  ids!: string[];
}

export class AdminClientBadgeBulkRejectDto extends AdminClientBadgeReasonDto {
  @ApiProperty({ type: [String], format: 'uuid', maxItems: 100 })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @IsUUID('all', { each: true })
  ids!: string[];
}

export class AdminClientBadgeBulkResultDto {
  @ApiProperty({ type: [String], format: 'uuid' })
  done!: string[];

  @ApiProperty({ description: 'Ids that were not in a state to change.' })
  skipped!: { id: string; reason: string }[];
}
