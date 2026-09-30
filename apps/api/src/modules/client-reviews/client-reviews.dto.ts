import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export const CLIENT_REVIEW_BODY_MAX = 2000;

/** PUT /cases/:id/client-review (OQ-038). */
export class UpsertClientReviewDto {
  @ApiProperty({ minimum: 1, maximum: 5 })
  @IsInt()
  @Min(1)
  @Max(5)
  rating!: number;

  @ApiPropertyOptional({ maxLength: CLIENT_REVIEW_BODY_MAX })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MaxLength(CLIENT_REVIEW_BODY_MAX)
  body?: string;
}

export class ClientIdParamDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('all')
  id!: string;
}

export class ClientReviewsQueryDto {
  @ApiPropertyOptional({
    type: 'integer',
    minimum: 1,
    maximum: 5,
    description: 'Only reviews with this star rating (tap on the bar).',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  rating?: number;

  @ApiPropertyOptional({
    enum: ['newest', 'oldest'],
    enumName: 'ClientReviewsSort',
    default: 'newest',
  })
  @IsOptional()
  @IsIn(['newest', 'oldest'])
  sort?: 'newest' | 'oldest';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(300)
  cursor?: string;
}

export class ClientReviewAuthorDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  username!: string;

  @ApiProperty()
  displayName!: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  avatarUrl!: string | null;

  @ApiProperty()
  verifiedBadge!: boolean;
}

export class ClientReviewDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  caseId!: string;

  @ApiProperty()
  caseTitle!: string;

  @ApiProperty({ type: 'integer' })
  rating!: number;

  @ApiPropertyOptional({ type: String, nullable: true })
  body!: string | null;

  @ApiProperty({ type: ClientReviewAuthorDto })
  attorney!: ClientReviewAuthorDto;

  @ApiProperty()
  isMine!: boolean;

  @ApiProperty()
  createdAt!: string;
}

export interface ClientReviewPage {
  items: ClientReviewDto[];
  nextCursor: string | null;
}
