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
      'message_keys',
      'stripe_webhooks',
      'push',
      'turn',
      'cloudflare_turn',
      'cloudflare_sfu',
      'r2',
      'http',
      'realtime',
      'breakers',
      'cloudflare_usage',
      'bunny_usage',
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

/** Owner 2026-10-22: one outage on the status board (last 24 h). */
export class IncidentDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ description: 'The board item key: database, redis, push …' })
  component!: string;

  @ApiProperty({ format: 'date-time' })
  openedAt!: string;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  closedAt!: string | null;

  @ApiProperty({ type: 'object', additionalProperties: true })
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

  @ApiPropertyOptional({
    type: [IncidentDto],
    description: 'Incidents opened in the last 24 hours, or still open.',
  })
  incidents?: IncidentDto[];

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

/** Batch D (item 17): facts for the admin «Масштаб» page that no other
 * endpoint gives (the rest is `GET /admin/economy` and the health board). */
export class ScaleExtrasDto {
  @ApiProperty({
    enum: ['on', 'off', 'unknown'],
    description: 'Does the database change size by itself (Terraform switch).',
  })
  dbAutoscale!: 'on' | 'off' | 'unknown';

  @ApiProperty({ enum: ['on', 'off', 'unknown'] })
  redisAutoscale!: 'on' | 'off' | 'unknown';

  @ApiProperty({
    description: 'Our own PgBouncer sits in front of the database.',
  })
  poolerEnabled!: boolean;

  @ApiProperty({ type: Number, nullable: true })
  poolerMinTasks!: number | null;

  @ApiProperty({ type: Number, nullable: true })
  poolerMaxTasks!: number | null;

  @ApiProperty({
    description: 'The `search.engine` setting (postgres until another is set).',
  })
  searchEngine!: string;
}

/** Owner 2026-10-25 (online DDL): one batched backfill on the «Масштаб» page. */
export class BackfillRunDto {
  @ApiProperty({ description: 'Stable backfill name.' })
  name!: string;

  @ApiProperty({ enum: ['running', 'paused', 'aborted', 'done', 'failed'] })
  status!: 'running' | 'paused' | 'aborted' | 'done' | 'failed';

  @ApiProperty({ description: 'Table being walked.' })
  tableName!: string;

  @ApiProperty({ description: 'Rows changed so far.' })
  processed!: number;

  @ApiProperty({
    type: Number,
    nullable: true,
    description: 'Planner estimate of the rows to walk.',
  })
  totalEstimate!: number | null;

  @ApiProperty({
    type: Number,
    nullable: true,
    description: '0-100, null when the total is unknown.',
  })
  percent!: number | null;

  @ApiProperty()
  batchSize!: number;

  @ApiProperty()
  maxRowsPerSec!: number;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Why it waits now: paused by admin, replica lag, CPU …',
  })
  pauseReason!: string | null;

  @ApiProperty({ type: String, nullable: true })
  lastError!: string | null;

  @ApiProperty({
    description:
      'Running but no heartbeat for 2 minutes: the runner process is gone.',
  })
  stalled!: boolean;

  @ApiProperty({ format: 'date-time' })
  startedAt!: string;

  @ApiProperty({ format: 'date-time' })
  updatedAt!: string;
}
