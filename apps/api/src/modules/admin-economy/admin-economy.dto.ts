import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  Max,
  Min,
} from 'class-validator';

export class EconomySettingsDto {
  @ApiProperty({ description: 'Third-party spend ≤ this % of 30-day revenue.' })
  percent!: number;
  @ApiProperty({ description: '…but never below this many USD a month.' })
  thresholdUsd!: number;
  @ApiProperty({ enum: ['auto', 'manual'] })
  ceilingMode!: 'auto' | 'manual';
  @ApiProperty()
  manualApi!: number;
  @ApiProperty()
  manualWorker!: number;
  @ApiProperty()
  awsFallbackUsd!: number;
  @ApiProperty({
    description: 'The daily money brake = allowed spend / 30 × this many days.',
  })
  dailyBrakeDays!: number;
}

export class SpendLineDto {
  @ApiProperty({
    enum: [
      'aws',
      'sms',
      'video',
      'translate',
      'id_check',
      'email',
      'image_moderation',
      'cloudflare',
    ],
  })
  key!:
    | 'aws'
    | 'sms'
    | 'video'
    | 'translate'
    | 'id_check'
    | 'email'
    | 'image_moderation'
    | 'cloudflare';
  @ApiProperty()
  monthToDateUsd!: number;
  @ApiProperty()
  projectedUsd!: number;
  @ApiProperty({
    enum: ['actual', 'estimate'],
    description:
      'actual = read from the vendor; estimate = calls × price book.',
  })
  source!: 'actual' | 'estimate';
  @ApiPropertyOptional({
    enum: ['aws'],
    nullable: true,
    description: 'The AWS bill already contains this line (not added twice).',
  })
  coveredBy?: 'aws' | null;
}

export class EconomyFiguresDto {
  @ApiProperty()
  revenue30dUsd!: number;
  @ApiProperty()
  revenueMonthUsd!: number;
  @ApiProperty({ description: 'Spend the rule allows this month, USD.' })
  allowedUsd!: number;
  @ApiProperty({ type: [SpendLineDto] })
  lines!: SpendLineDto[];
  @ApiProperty()
  monthToDateUsd!: number;
  @ApiProperty({ description: 'Projected third-party spend for the month.' })
  projectedUsd!: number;
}

export class ContainerReportDto {
  @ApiPropertyOptional({ nullable: true, type: Number })
  running!: number | null;
  @ApiPropertyOptional({ nullable: true, type: Number })
  desired!: number | null;
  @ApiPropertyOptional({ nullable: true, type: Number })
  ceiling!: number | null;
  @ApiProperty({ description: 'The Terraform maximum.' })
  hardCap!: number;
  @ApiProperty({ description: 'Monthly cost of one task, USD.' })
  taskUsd!: number;
}

export class ContainersDto {
  @ApiProperty({ description: 'ECS actions work here (on AWS).' })
  onAws!: boolean;
  @ApiProperty({ type: ContainerReportDto })
  api!: ContainerReportDto;
  @ApiProperty({ type: ContainerReportDto })
  worker!: ContainerReportDto;
  @ApiPropertyOptional({ enum: ['min', 'normal'], nullable: true })
  scaleMode!: 'min' | 'normal' | null;
}

export class TierRowDto {
  @ApiProperty()
  name!: string;
  @ApiProperty()
  memoryGb!: number;
  @ApiProperty()
  monthUsd!: number;
  @ApiProperty()
  current!: boolean;
}

export class CapacityDto {
  @ApiProperty({ description: 'The database / Redis can be read and resized.' })
  onAws!: boolean;
  @ApiPropertyOptional({ nullable: true, type: String })
  at!: string | null;
  @ApiPropertyOptional({ nullable: true, type: String })
  dbClass!: string | null;
  @ApiPropertyOptional({ nullable: true, type: String })
  dbNext!: string | null;
  @ApiPropertyOptional({ nullable: true, type: Number })
  dbCpuPercent!: number | null;
  @ApiPropertyOptional({ nullable: true, type: Number })
  dbConnections!: number | null;
  @ApiPropertyOptional({ nullable: true, type: Number })
  dbMaxConnections!: number | null;
  @ApiPropertyOptional({
    nullable: true,
    type: Number,
    description: 'Allocated database disk, GB.',
  })
  dbStorageGb!: number | null;
  @ApiPropertyOptional({
    nullable: true,
    type: Number,
    description: 'Monthly price of that disk (gp3), USD.',
  })
  dbStorageUsd!: number | null;
  @ApiPropertyOptional({ nullable: true, type: String })
  redisClass!: string | null;
  @ApiPropertyOptional({ nullable: true, type: String })
  redisNext!: string | null;
  @ApiPropertyOptional({ nullable: true, type: Number })
  redisMemoryPercent!: number | null;
  @ApiProperty({ type: [TierRowDto] })
  dbTiers!: TierRowDto[];
  @ApiProperty({ type: [TierRowDto] })
  redisTiers!: TierRowDto[];
}

export class EconomyEventDto {
  @ApiProperty()
  at!: string;
  @ApiProperty({
    enum: [
      'guard_on',
      'guard_off',
      'ceiling',
      'db_cpu',
      'db_connections',
      'redis_memory',
      'scaled_up',
      'scaled_down',
    ],
  })
  kind!: string;
  @ApiProperty()
  text!: string;
}

export class EconomyReportDto {
  @ApiProperty({ description: 'The economy_guard flag.' })
  enabled!: boolean;
  @ApiProperty({ enum: ['ok', 'limited'] })
  guard!: 'ok' | 'limited';
  @ApiPropertyOptional({ nullable: true, type: String })
  since!: string | null;
  @ApiProperty({ type: EconomyFiguresDto })
  figures!: EconomyFiguresDto;
  @ApiProperty({ type: EconomySettingsDto })
  settings!: EconomySettingsDto;
  @ApiProperty({ type: ContainersDto })
  containers!: ContainersDto;
  @ApiProperty({ type: CapacityDto })
  capacity!: CapacityDto;
  @ApiProperty({ type: [EconomyEventDto] })
  events!: EconomyEventDto[];
}

export class UpdateEconomyDto {
  @ApiPropertyOptional({ minimum: 1, maximum: 100 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  percent?: number;

  @ApiPropertyOptional({ minimum: 0, maximum: 1_000_000 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1_000_000)
  thresholdUsd?: number;

  @ApiPropertyOptional({ enum: ['auto', 'manual'] })
  @IsOptional()
  @IsIn(['auto', 'manual'])
  ceilingMode?: 'auto' | 'manual';

  @ApiPropertyOptional({ minimum: 1, maximum: 1000 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1000)
  manualApi?: number;

  @ApiPropertyOptional({ minimum: 1, maximum: 1000 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1000)
  manualWorker?: number;

  @ApiPropertyOptional({ minimum: 0.5, maximum: 31 })
  @IsOptional()
  @IsNumber()
  @Min(0.5)
  @Max(31)
  dailyBrakeDays?: number;

  @ApiPropertyOptional({ minimum: 0, maximum: 100_000 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100_000)
  awsFallbackUsd?: number;

  @ApiPropertyOptional({ description: 'The economy_guard flag (rollback).' })
  @IsOptional()
  @IsBoolean()
  guardEnabled?: boolean;
}

export class IncreaseCapacityDto {
  @ApiProperty({ enum: ['db', 'redis'] })
  @IsIn(['db', 'redis'])
  target!: 'db' | 'redis';
}
