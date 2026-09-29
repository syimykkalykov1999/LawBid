import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { RatingDto } from '../profiles/dto/attorney-profile.dto';

export class AttorneyIdParamDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('all')
  id!: string;
}

export class FollowsQueryDto {
  @ApiPropertyOptional({ description: 'meta.nextCursor of the previous page.' })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  cursor?: string;
}

/** An attorney row in follower/following/suggestion lists (docs/05 §6). */
export class AttorneyListItemDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  username!: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  firstName!: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  lastName!: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  avatarUrl!: string | null;

  @ApiProperty()
  verifiedBadge!: boolean;

  @ApiProperty({ type: RatingDto })
  rating!: RatingDto;

  @ApiProperty({ type: [String], description: 'Verified license state codes.' })
  states!: string[];

  @ApiProperty({
    type: [String],
    description: 'i18n keys of the first practices (docs/05 §7.3).',
  })
  practiceI18nKeys!: string[];

  @ApiProperty({ description: 'The viewer follows this attorney.' })
  isFollowing!: boolean;
}

export interface AttorneyListPage {
  items: AttorneyListItemDto[];
  nextCursor: string | null;
}
