import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class PublicAttorneysQueryDto {
  @ApiPropertyOptional({
    example: 'CA',
    description: 'State of a verified license.',
  })
  @IsOptional()
  @Matches(/^[A-Za-z]{2}$/)
  state?: string;

  @ApiPropertyOptional({
    example: 'family_law',
    description: 'Practice area code (a category covers its specializations).',
  })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  @Matches(/^[a-z0-9_.]+$/)
  practice?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @ApiPropertyOptional({ description: 'meta.nextCursor of the previous page.' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  cursor?: string;
}

export class PublicPracticeDto {
  @ApiProperty({ example: 'family_law.divorce' })
  code!: string;

  @ApiProperty({ example: 'Divorce' })
  name!: string;
}

/** What a search engine may show about an attorney: the same facts the
 * public profile shows, and nothing to contact or identify a client. */
export class PublicAttorneyDto {
  @ApiProperty({ example: 'anna.lee' })
  username!: string;

  @ApiProperty({ example: 'Anna Lee' })
  displayName!: string;

  @ApiPropertyOptional({ nullable: true })
  bio!: string | null;

  @ApiProperty({ type: [String] })
  firmNames!: string[];

  @ApiProperty({ type: [String], example: ['en', 'ru'] })
  languages!: string[];

  @ApiProperty({ example: 4.8 })
  ratingAvg!: number;

  @ApiProperty({ example: 12 })
  ratingCount!: number;

  @ApiProperty({
    description: 'The blue check: license and identity confirmed.',
  })
  trustBadge!: boolean;

  /** Owner 2026-10-22 (audit #4 §9): the attorney's photo on the media CDN
   * (og:image of the SEO page); null without a CDN, a photo, or when the
   * photo is not shown to everyone. */
  @ApiProperty({ type: String, nullable: true })
  photoUrl!: string | null;

  @ApiProperty({ type: [PublicPracticeDto] })
  practiceAreas!: PublicPracticeDto[];

  @ApiProperty({
    type: [String],
    example: ['CA', 'NY'],
    description: 'States of verified licenses.',
  })
  licensedStates!: string[];

  /** Owner 2026-10-27 (programmatic SEO): when the public facts of this
   * profile last changed; the pages' sitemap `lastmod` is this day, not the
   * day of the build. */
  @ApiProperty({
    type: String,
    format: 'date-time',
    example: '2026-10-20T09:15:00.000Z',
    description: 'When the profile last changed (ISO 8601, UTC).',
  })
  updatedAt!: string;
}
