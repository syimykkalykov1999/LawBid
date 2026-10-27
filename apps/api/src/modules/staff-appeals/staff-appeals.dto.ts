import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { APPEAL_DECISIONS, APPEAL_KINDS } from './staff-appeals.logic';

// ---- worker side: file a complaint, read the status of my own ------------

export class CreateAppealDto {
  @ApiPropertyOptional({ enum: APPEAL_KINDS, default: 'other' })
  @IsOptional()
  @IsIn(APPEAL_KINDS)
  kind?: (typeof APPEAL_KINDS)[number];

  @ApiProperty({ minLength: 10, maxLength: 2000 })
  @IsString()
  @MinLength(10)
  @MaxLength(2000)
  text!: string;

  @ApiPropertyOptional({
    description:
      'Anonymous: the owner reads «автор обжалования №N» instead of your name. The system still keeps who wrote it (retaliation guard).',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  anonymous?: boolean;
}

export class AppealReceiptDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ description: 'Appeal number («автор №N» for anonymous).' })
  number!: number;
  @ApiProperty({ enum: ['received', 'in_review', 'decided'] })
  status!: 'received' | 'in_review' | 'decided';
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
}

export class MyAppealDto extends AppealReceiptDto {
  @ApiProperty({ enum: APPEAL_KINDS }) kind!: string;
  @ApiProperty() anonymous!: boolean;
  @ApiProperty({ format: 'date-time', nullable: true }) ackAt!: string | null;
}

// ---- owner side ------------------------------------------------------------

export class AppealListQueryDto {
  @ApiPropertyOptional({
    enum: ['open', 'decided'],
    description: 'open = new or seen; decided = resolved. Omitted = all.',
  })
  @IsOptional()
  @IsIn(['open', 'decided'])
  state?: 'open' | 'decided';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  cursor?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

export class PersonRefDto {
  @ApiProperty({ format: 'uuid', nullable: true })
  adminId!: string | null;
  @ApiProperty() name!: string;
}

export class AppealAuthorDto {
  @ApiProperty({
    format: 'uuid',
    nullable: true,
    description: 'null while the author is anonymous (and for the list).',
  })
  adminId!: string | null;
  @ApiProperty({ description: 'Name, or «автор обжалования №N».' })
  label!: string;
  @ApiProperty() anonymous!: boolean;
}

export class AppealItemDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() number!: number;
  @ApiProperty({ enum: APPEAL_KINDS }) kind!: string;
  @ApiProperty({ description: 'First 280 characters.' }) excerpt!: string;
  @ApiProperty({ type: PersonRefDto }) head!: PersonRefDto;
  @ApiProperty({ type: AppealAuthorDto }) author!: AppealAuthorDto;
  @ApiProperty({ enum: ['new', 'seen', 'resolved'] }) status!: string;
  @ApiProperty({ enum: ['none', ...APPEAL_DECISIONS] })
  ownerDecision!: string;
  @ApiProperty({
    description:
      'Red mark: the head acted against this author inside the protection window.',
  })
  redFlag!: boolean;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
  @ApiProperty({ format: 'date-time', nullable: true }) decidedAt!:
    string | null;
}

export class AppealListDto {
  @ApiProperty({ type: [AppealItemDto] }) items!: AppealItemDto[];
  @ApiProperty({ nullable: true }) nextCursor!: string | null;
}

export class RetaliationFlagDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid' }) appealId!: string;
  @ApiProperty() appealNumber!: number;
  @ApiProperty({ type: AppealAuthorDto }) subject!: AppealAuthorDto;
  @ApiProperty({ enum: ['open', 'cleared', 'upheld'] }) state!: string;
  @ApiProperty({ format: 'date-time' }) windowUntil!: string;
  @ApiProperty({ format: 'date-time', nullable: true }) holdUntil!:
    string | null;
  @ApiProperty({
    description: 'The 14-day hold is still running (reversible).',
  })
  holdActive!: boolean;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
  @ApiProperty({ format: 'date-time', nullable: true }) decidedAt!:
    string | null;
}

export class AppealDetailDto extends AppealItemDto {
  @ApiProperty() text!: string;
  @ApiProperty({ nullable: true }) ownerNote!: string | null;
  @ApiProperty({ description: 'How many times the author name was revealed.' })
  revealCount!: number;
  @ApiProperty({ type: [RetaliationFlagDto] }) flags!: RetaliationFlagDto[];
}

export class DecideAppealDto {
  @ApiProperty({ enum: APPEAL_DECISIONS })
  @IsIn(APPEAL_DECISIONS)
  decision!: (typeof APPEAL_DECISIONS)[number];

  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;
}

export class FollowUpDto {
  @ApiProperty({
    description:
      'The existing admin-management call the decision asks for (by name).',
  })
  call!: string;
  @ApiProperty({ enum: ['head', 'author'] }) target!: 'head' | 'author';
  @ApiProperty({
    description:
      'false = not run yet (the owner presses it in the admin list); true = run by the server.',
  })
  applied!: boolean;
}

export class DecideResultDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ enum: ['new', 'seen', 'resolved'] }) status!: string;
  @ApiProperty({ enum: APPEAL_DECISIONS }) decision!: string;
  @ApiProperty({ format: 'date-time' }) decidedAt!: string;
  @ApiProperty({ type: FollowUpDto, nullable: true })
  followUp!: FollowUpDto | null;
}

export class RevealResultDto {
  @ApiProperty({ format: 'uuid' }) adminId!: string;
  @ApiProperty() name!: string;
  @ApiPropertyOptional({ nullable: true }) email!: string | null;
  @ApiProperty({ description: 'Reveals left today (UTC day).' })
  revealsLeftToday!: number;
}

export class FlagListQueryDto {
  @ApiPropertyOptional({ enum: ['open', 'closed'] })
  @IsOptional()
  @IsIn(['open', 'closed'])
  state?: 'open' | 'closed';

  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

export class FlagListDto {
  @ApiProperty({ type: [RetaliationFlagDto] }) items!: RetaliationFlagDto[];
}

export class FlagDecisionDto {
  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class FlagDecisionResultDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ enum: ['open', 'cleared', 'upheld'] }) state!: string;
  @ApiProperty({ description: 'The person works again (reverse) or not.' })
  reinstated!: boolean;
}

export class SignalDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({
    description:
      'team_turnover_high · top_rated_removed · removal_without_warning · head_multi_appeals · retaliation_decide · appeal_unanswered',
  })
  code!: string;
  @ApiProperty({ type: PersonRefDto }) subject!: PersonRefDto;
  @ApiProperty({ type: PersonRefDto, nullable: true })
  actor!: PersonRefDto | null;
  @ApiProperty({ type: 'object', additionalProperties: true })
  details!: Record<string, unknown>;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
}

export class SignalListDto {
  @ApiProperty({ type: [SignalDto] }) items!: SignalDto[];
}
