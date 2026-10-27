import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import {
  REVIEW_REASONS,
  REVIEW_VERDICTS,
  type ReviewReason,
  type ReviewVerdict,
} from './staff-review.constants';

export class ReviewSampleParamDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('all')
  id!: string;
}

export class ReviewVerdictBodyDto {
  @ApiProperty({
    enum: REVIEW_VERDICTS,
    enumName: 'StaffReviewVerdict',
    description:
      'confirmed — the decision stands · overturned — it was wrong · unclear — cannot tell (goes to another reviewer, no mark for the worker).',
  })
  @IsIn(REVIEW_VERDICTS)
  verdict!: ReviewVerdict;

  @ApiPropertyOptional({
    enum: REVIEW_REASONS,
    enumName: 'StaffReviewReason',
    isArray: true,
    description: 'Why it was overturned (at least one for «overturned»).',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5)
  @IsIn(REVIEW_REASONS, { each: true })
  reasons?: ReviewReason[];

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class ReviewGoldenBodyDto {
  @ApiProperty({
    format: 'uuid',
    description: 'A re-check sample that a reviewer CONFIRMED.',
  })
  @IsUUID('all')
  sampleId!: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description:
      'The worker who gets this task (same workspace, a role that works this kind). Omit: one is picked at random.',
  })
  @IsOptional()
  @IsUUID('all')
  workerId?: string;
}

export class ReviewMeDto {
  @ApiProperty({
    enum: ['owner', 'head', 'senior'],
    enumName: 'StaffReviewLevel',
  })
  level!: 'owner' | 'head' | 'senior';

  @ApiProperty({
    description:
      'May mark golden tasks and read stats and the team (owner, head).',
  })
  canManage!: boolean;
}

export class ReviewFactDto {
  @ApiProperty() key!: string;
  @ApiProperty() value!: string;
}

export class ReviewPersonRefDto {
  @ApiProperty({ format: 'uuid' }) adminId!: string;
  @ApiProperty() name!: string;
}

export class ReviewSampleDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({
    description:
      'The kind of the checked decision (verification, report, support_ticket…).',
  })
  decisionKind!: string;
  @ApiProperty({ format: 'uuid', description: 'The checked item.' })
  itemId!: string;
  @ApiProperty({
    type: String,
    nullable: true,
    description: 'sample · newcomer · ai · peer',
  })
  stage!: string | null;
  @ApiProperty({
    type: String,
    nullable: true,
    description: 'What the worker chose (read-only).',
  })
  outcome!: string | null;
  @ApiProperty({
    type: String,
    nullable: true,
    format: 'date-time',
    description: 'When the worker closed it.',
  })
  decidedAt!: string | null;
  @ApiProperty({
    type: Number,
    nullable: true,
    description: 'Seconds the worker held it.',
  })
  handleSec!: number | null;
  @ApiProperty({
    type: [ReviewFactDto],
    description:
      'Read-only facts of the item, personal data masked by the admin rules.',
  })
  facts!: ReviewFactDto[];
  @ApiProperty({ format: 'date-time' }) leasedUntil!: string;
  @ApiProperty({
    type: ReviewPersonRefDto,
    nullable: true,
    description: 'Owner only. Reviewers never see who decided.',
  })
  worker!: ReviewPersonRefDto | null;
}

export class ReviewNextDto {
  @ApiProperty({
    enum: ['leased', 'busy', 'empty', 'wrap_up', 'away', 'offline', 'off'],
    enumName: 'StaffReviewNextStatus',
  })
  status!: 'leased' | 'busy' | 'empty' | 'wrap_up' | 'away' | 'offline' | 'off';
  @ApiProperty({ type: ReviewSampleDto, nullable: true })
  sample!: ReviewSampleDto | null;
}

export class ReviewCurrentDto {
  @ApiProperty({ type: ReviewSampleDto, nullable: true })
  sample!: ReviewSampleDto | null;
}

export class ReviewVerdictResultDto {
  @ApiProperty() ok!: boolean;
  @ApiProperty({
    enum: ['done', 'returned'],
    enumName: 'StaffReviewVerdictOutcome',
  })
  result!: 'done' | 'returned';
}

export class ReviewGoldenIssuedDto {
  @ApiProperty() ok!: boolean;
  @ApiProperty({ format: 'uuid' }) goldenId!: string;
}

export class ReviewGoldenRowDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() decisionKind!: string;
  @ApiProperty({
    enum: ['pending', 'passed', 'failed'],
    enumName: 'StaffGoldenState',
  })
  state!: 'pending' | 'passed' | 'failed';
  @ApiProperty({ type: ReviewPersonRefDto }) worker!: ReviewPersonRefDto;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
  @ApiProperty({ type: String, nullable: true, format: 'date-time' }) doneAt!:
    string | null;
}

export class ReviewGoldenListDto {
  @ApiProperty({ type: [ReviewGoldenRowDto] }) items!: ReviewGoldenRowDto[];
}

export class ReviewTeamRowDto {
  @ApiProperty({ format: 'uuid' }) adminId!: string;
  @ApiProperty() name!: string;
  @ApiProperty() decisions!: number;
  @ApiProperty({
    type: Number,
    nullable: true,
    description:
      'Percent of closed items that came back (reopened or complained about).',
  })
  returnedRate!: number | null;
  @ApiProperty() sampled!: number;
  @ApiProperty() overturned!: number;
  @ApiProperty() goldenTotal!: number;
  @ApiProperty() goldenFailed!: number;
}

export class ReviewTeamDto {
  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Date of the nightly snapshot read.',
  })
  snapshotDate!: string | null;
  @ApiProperty({ type: [ReviewTeamRowDto] }) items!: ReviewTeamRowDto[];
}

export class ReviewWorkspaceStatsDto {
  @ApiProperty({
    enum: ['mass', 'finance', 'owner'],
    enumName: 'StaffReviewWorkspace',
  })
  workspace!: string;
  @ApiProperty() decisions!: number;
  @ApiProperty() sampled!: number;
  @ApiProperty() overturned!: number;
  @ApiProperty({
    type: Number,
    nullable: true,
    description: 'Percent of re-checked decisions that were overturned.',
  })
  overturnRate!: number | null;
  @ApiProperty({
    type: Number,
    nullable: true,
    description: 'Percent of closed items that came back.',
  })
  returnedRate!: number | null;
  @ApiProperty() goldenTotal!: number;
  @ApiProperty() goldenFailed!: number;
  @ApiProperty({ description: 'Samples waiting for a reviewer now.' })
  pending!: number;
}

export class ReviewCalibrationDto {
  @ApiProperty() decisionKind!: string;
  @ApiProperty({ description: 'Samples checked by two reviewers.' })
  pairs!: number;
  @ApiProperty({
    type: Number,
    nullable: true,
    description: 'Percent of pairs where both reviewers said the same.',
  })
  agreementPct!: number | null;
}

export class ReviewStatsDto {
  @ApiProperty({ type: String, nullable: true }) snapshotDate!: string | null;
  @ApiProperty({ type: [ReviewWorkspaceStatsDto] })
  workspaces!: ReviewWorkspaceStatsDto[];
  @ApiProperty({ type: [ReviewCalibrationDto] })
  calibration!: ReviewCalibrationDto[];
}
