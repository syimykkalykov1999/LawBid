import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export const ADMIN_QA_STATUSES = [
  'all',
  'published',
  'hidden',
  'removed',
] as const;

export class AdminQaListQueryDto {
  @ApiPropertyOptional({ maxLength: 80, description: 'Title or text' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(80)
  q?: string;

  @ApiPropertyOptional({
    enum: ADMIN_QA_STATUSES,
    enumName: 'AdminQaStatus',
    default: 'all',
  })
  @IsOptional()
  @IsIn(ADMIN_QA_STATUSES)
  status?: (typeof ADMIN_QA_STATUSES)[number];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  cursor?: string;

  @ApiPropertyOptional({ type: 'integer', minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

export class AdminQaPersonDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() name!: string;
}

export class AdminQaAnswerDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() body!: string;
  /** published | hidden | removed */
  @ApiProperty() status!: string;
  @ApiProperty() isBest!: boolean;
  @ApiProperty() likeCount!: number;
  @ApiProperty({ type: AdminQaPersonDto }) attorney!: AdminQaPersonDto;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
}

export class AdminQaQuestionDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() title!: string;
  @ApiProperty() body!: string;
  /** published | hidden | removed (a deleted one reads removed) */
  @ApiProperty() status!: string;
  @ApiProperty() isAnonymous!: boolean;
  @ApiProperty() answerCount!: number;
  @ApiProperty({ nullable: true, type: String, format: 'uuid' })
  bestAnswerId!: string | null;
  @ApiProperty({ nullable: true, type: String }) stateCode!: string | null;
  @ApiProperty({ nullable: true, type: String }) practiceArea!: string | null;
  /** Shown to the admin even when the author is anonymous to others. */
  @ApiProperty({ type: AdminQaPersonDto }) author!: AdminQaPersonDto;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
}

export class AdminQaQuestionDetailDto extends AdminQaQuestionDto {
  @ApiProperty({ type: AdminQaAnswerDto, isArray: true })
  answers!: AdminQaAnswerDto[];
}

export interface AdminQaPage {
  items: AdminQaQuestionDto[];
  nextCursor: string | null;
}
