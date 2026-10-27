import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsString,
  Matches,
  Max,
  Min,
} from 'class-validator';

const DB_KEY = /^[a-z][a-z0-9_-]{0,31}$/i;

/** Loose object: the admin screen words the numbers itself. */
const LOOSE = { type: 'object', additionalProperties: true } as const;

export class SplitPlanQueryDto {
  @ApiProperty({ example: 'db1' })
  @IsString()
  @Matches(DB_KEY)
  toDb!: string;
}

export class SplitStartDto {
  @ApiProperty({ example: 'db1' })
  @IsString()
  @Matches(DB_KEY)
  toDb!: string;

  @ApiProperty({
    type: [Number],
    description: 'Logical shards to move (0..255)',
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(256)
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(255, { each: true })
  shards!: number[];
}

export class ShardMoveDto {
  @ApiProperty() id!: string;
  @ApiProperty() logicalShard!: number;
  @ApiProperty() fromDb!: string;
  @ApiProperty() toDb!: string;
  @ApiProperty({
    enum: [
      'preflight',
      'copy',
      'catchup',
      'freeze',
      'verify',
      'flip',
      'cleanup',
      'done',
    ],
  })
  state!: string;
  @ApiProperty({
    enum: ['running', 'waiting', 'failed', 'done', 'rolled_back'],
  })
  status!: string;
  @ApiProperty({ description: '0..100, by step and copied rows' })
  percent!: number;
  @ApiProperty({ description: 'Last progress line' }) note!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) error!: string | null;
  @ApiProperty() createdAt!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) flippedAt!:
    string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) cleanupAfter!:
    string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) heartbeatAt!:
    string | null;
  @ApiPropertyOptional({ ...LOOSE, nullable: true }) verify!: Record<
    string,
    unknown
  > | null;
}

export class ShardDistributionDto {
  @ApiProperty() database!: string;
  @ApiProperty() state!: string;
  @ApiProperty() shards!: number;
}

export class ShardsOverviewDto {
  @ApiProperty({ type: [String] }) databases!: string[];
  @ApiProperty({
    type: [ShardDistributionDto],
    description: 'shards per database and state',
  })
  distribution!: ShardDistributionDto[];
  @ApiProperty({ type: [ShardMoveDto] }) moves!: ShardMoveDto[];
  @ApiProperty() leaseHeld!: boolean;
  @ApiPropertyOptional({
    ...LOOSE,
    nullable: true,
    description: 'last orphan check',
  })
  orphans!: Record<string, unknown> | null;
}

export class SplitPlanDto {
  @ApiProperty() fromDb!: string;
  @ApiProperty() toDb!: string;
  @ApiProperty({ type: [Number] }) shards!: number[];
  @ApiProperty() rows!: number;
  @ApiProperty() estimatedSeconds!: number;
  @ApiProperty({ ...LOOSE, description: 'DATABASE_URL_SHARDS readiness' })
  readiness!: Record<string, unknown>;
}

export class ShardActionDto {
  @ApiProperty() ok!: boolean;
  @ApiProperty({ type: [ShardMoveDto] }) moves!: ShardMoveDto[];
}
