import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsOptional } from 'class-validator';

export type HealthStatus = 'green' | 'yellow' | 'red' | 'grey';

export class HealthItemDto {
  @ApiProperty({
    enum: [
      'api',
      'worker',
      'database',
      'redis',
      'storage',
      'video',
      'queues',
      'backup',
      'cost',
    ],
  })
  key!: string;

  @ApiProperty({ enum: ['green', 'yellow', 'red', 'grey'] })
  status!: HealthStatus;

  @ApiProperty({
    type: 'object',
    additionalProperties: true,
    description: 'Numbers behind the status (the admin words them).',
  })
  detail!: Record<string, unknown>;
}

export class HeavyPauseDto {
  @ApiProperty({ enum: ['owner', 'auto'] })
  by!: 'owner' | 'auto';
  @ApiProperty()
  at!: string;
  @ApiProperty()
  reason!: string;
}

export class ScaleModeDto {
  @ApiProperty({ enum: ['min', 'normal'] })
  mode!: 'min' | 'normal';
  @ApiProperty({ enum: ['owner', 'auto'] })
  by!: 'owner' | 'auto';
  @ApiProperty()
  at!: string;
}

export class OpsActionsDto {
  @ApiProperty({ description: 'Restart worker / scale run here (on AWS).' })
  onAws!: boolean;
  @ApiProperty({ description: 'This month’s spend is read from AWS Budgets.' })
  budget!: boolean;
}

export class OpsSettingsDto {
  @ApiProperty()
  autoPauseHeavyJobs!: boolean;
  @ApiProperty()
  autoScaleDownOnBudget!: boolean;
  @ApiProperty()
  dbSlowMs!: number;
  @ApiProperty()
  backupMaxAgeHours!: number;
}

export class SystemHealthDto {
  @ApiProperty({ enum: ['green', 'yellow', 'red'] })
  overall!: 'green' | 'yellow' | 'red';

  @ApiProperty()
  generatedAt!: string;

  @ApiProperty({ type: [HealthItemDto] })
  items!: HealthItemDto[];

  @ApiPropertyOptional({ type: HeavyPauseDto, nullable: true })
  heavyPause!: HeavyPauseDto | null;

  @ApiPropertyOptional({ type: ScaleModeDto, nullable: true })
  scaleMode!: ScaleModeDto | null;

  @ApiProperty({ type: OpsActionsDto })
  actions!: OpsActionsDto;

  @ApiProperty({ type: OpsSettingsDto })
  settings!: OpsSettingsDto;
}

export class HeavyJobsDto {
  @ApiProperty()
  @IsBoolean()
  paused!: boolean;
}

export class ScaleDto {
  @ApiProperty({ enum: ['min', 'normal'] })
  @IsIn(['min', 'normal'])
  mode!: 'min' | 'normal';
}

export class UpdateOpsSettingsDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  autoPauseHeavyJobs?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  autoScaleDownOnBudget?: boolean;
}
