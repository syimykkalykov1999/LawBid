import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  Matches,
} from 'class-validator';

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
      'restore_drill',
      'secret_rotation',
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
      'table_growth',
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

  @ApiProperty({
    description:
      'Owner 2026-10-27: scale.db_split_enabled — the guided «Разделить базу» card on «Масштаб» is shown.',
  })
  dbSplitEnabled!: boolean;

  @ApiProperty({ type: Number, nullable: true })
  poolerMaxTasks!: number | null;

  @ApiProperty({
    description: 'The `search.engine` setting (postgres until another is set).',
  })
  searchEngine!: string;
}

// --- Owner 2026-10-26 (calls failover): «Связь для звонков» ----------------

export class CallsPathStepDto {
  @ApiProperty()
  ok!: boolean;

  @ApiProperty({ type: 'integer', description: 'Milliseconds.' })
  ms!: number;

  @ApiPropertyOptional({ type: String, nullable: true })
  error?: string | null;
}

export class CallsPathCheckDto {
  @ApiProperty({ format: 'date-time' })
  at!: string;

  @ApiProperty()
  ok!: boolean;

  @ApiProperty({ type: 'integer', description: 'Whole check, ms.' })
  ms!: number;

  @ApiProperty({ type: CallsPathStepDto, nullable: true })
  stun!: CallsPathStepDto | null;

  @ApiProperty({ type: CallsPathStepDto, nullable: true })
  turn!: CallsPathStepDto | null;

  @ApiProperty({
    type: CallsPathStepDto,
    nullable: true,
    description: 'Cloudflare SFU session / LiveKit connect.',
  })
  media!: CallsPathStepDto | null;

  @ApiProperty({ type: String, nullable: true })
  error!: string | null;
}

export class CallsPathSideDto {
  @ApiProperty()
  configured!: boolean;

  @ApiProperty({
    type: 'object',
    additionalProperties: { type: 'boolean' },
    description: 'Which parts have keys (turn / sfu / livekit).',
  })
  parts!: Record<string, boolean>;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  lastProbeAt!: string | null;

  @ApiProperty({ type: Boolean, nullable: true })
  lastProbeOk!: boolean | null;

  @ApiProperty({ type: CallsPathCheckDto, nullable: true })
  check!: CallsPathCheckDto | null;
}

export class CallsPathBreakersDto {
  @ApiProperty({ enum: ['open', 'closed'] })
  turn!: 'open' | 'closed';

  @ApiProperty({ enum: ['open', 'closed'] })
  sfu!: 'open' | 'closed';
}

/** GET /admin/system-health/calls-path — the calls transport card. */
export class CallsPathDto {
  @ApiProperty({ enum: ['auto', 'cloudflare', 'own'] })
  transport!: 'auto' | 'cloudflare' | 'own';

  @ApiProperty({
    enum: ['cloudflare', 'own'],
    description: 'Who carries NEW calls right now.',
  })
  carrying!: 'cloudflare' | 'own';

  @ApiProperty({ type: CallsPathBreakersDto })
  breakers!: CallsPathBreakersDto;

  @ApiProperty({ type: CallsPathSideDto })
  cloudflare!: CallsPathSideDto;

  @ApiProperty({ type: CallsPathSideDto })
  own!: CallsPathSideDto;
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

/** WP-G: one heavy user or case in the «Тяжёлые пользователи» card. */
export class HeavyEntryDto {
  @ApiProperty({ description: 'User id or case id.' })
  id!: string;

  @ApiProperty({
    description:
      'Score over the window: requests, DB milliseconds, upload bytes or messages (sampled metrics are scaled back up).',
  })
  score!: number;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'User name (user rows) or case title (case rows).',
  })
  label!: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'User role (user rows only).',
  })
  role!: string | null;
}

export class HeavyMetricDto {
  @ApiProperty({ enum: ['requests', 'db_ms', 'upload_bytes', 'messages'] })
  metric!: 'requests' | 'db_ms' | 'upload_bytes' | 'messages';

  @ApiProperty({ type: [HeavyEntryDto] })
  users!: HeavyEntryDto[];

  @ApiProperty({ type: [HeavyEntryDto] })
  cases!: HeavyEntryDto[];
}

export class HeavyHittersDto {
  @ApiProperty({ description: 'False when HEAVY_HITTERS_SAMPLE=0.' })
  enabled!: boolean;

  @ApiProperty({ description: 'How far back the lists look, in minutes.' })
  windowMinutes!: number;

  @ApiProperty({ description: 'One request in N is counted (1 = all).' })
  sampleEvery!: number;

  @ApiProperty({ type: [HeavyMetricDto] })
  metrics!: HeavyMetricDto[];
}

/** Owner 2026-10-24: one table on the «Масштаб» page (partitioning by month). */
export class PartitionCardDto {
  @ApiProperty() table!: string;
  @ApiProperty({ description: 'Russian name of the table.' }) label!: string;
  @ApiProperty({ type: 'integer', description: 'Estimated rows.' })
  rows!: number;
  @ApiProperty({ type: 'integer', description: 'Bytes with indexes.' })
  bytes!: number;
  @ApiProperty() partitioned!: boolean;
  @ApiProperty({ type: 'integer' }) partitions!: number;
  @ApiProperty({
    enum: [
      'monthly',
      'idle',
      'running',
      'paused',
      'swapped',
      'error',
      'blocked',
    ],
  })
  state!: string;
  @ApiProperty({
    type: [String],
    description: 'Why it cannot be converted yet.',
  })
  blockedBy!: string[];
  @ApiProperty({ type: 'integer', nullable: true }) progress!: number | null;
  @ApiProperty({ type: String, nullable: true }) phase!: string | null;
  @ApiProperty({ type: String, nullable: true }) error!: string | null;
  @ApiProperty() paused!: boolean;
  @ApiProperty() canStart!: boolean;
  @ApiProperty() canUndo!: boolean;
  @ApiProperty() canFinalize!: boolean;
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  finalizeAfter!: string | null;
  @ApiProperty({
    description: 'More than 50 million rows and not partitioned.',
  })
  overThreshold!: boolean;
  @ApiProperty({
    description: 'The owner-role connection for the runner exists.',
  })
  runnerConfigured!: boolean;
  @ApiProperty({
    enum: ['off', 'on', 'auto'],
    nullable: true,
    description:
      'Hash tables: off (default) / on (convert now) / auto (convert at autoRows). Null for the monthly tables.',
  })
  mode!: string | null;
  @ApiProperty({
    type: 'integer',
    description: 'Rows at which «auto» converts (admin-editable).',
  })
  autoRows!: number;
}

export class PartitionTableParamDto {
  @ApiProperty() @IsString() @Matches(/^[a-z][a-z0-9_]{0,40}$/) table!: string;
}

export class PartitionModeDto {
  @ApiProperty({ enum: ['off', 'on', 'auto'] })
  @IsIn(['off', 'on', 'auto'])
  mode!: 'off' | 'on' | 'auto';
}

export class PartitionPauseDto {
  @ApiProperty() @IsBoolean() paused!: boolean;
}

/** Owner 2026-10-24: «Копия базы для чтения». */
export class ReplicaStatusDto {
  @ApiProperty({
    enum: [
      'unavailable',
      'off',
      'creating',
      'on',
      'lagging',
      'deleting',
      'error',
    ],
  })
  state!: string;
  @ApiProperty({
    type: Number,
    nullable: true,
    description: 'Seconds behind the primary.',
  })
  lagSeconds!: number | null;
  @ApiProperty({ type: String, nullable: true }) instanceClass!: string | null;
  @ApiProperty({ description: 'This process sends reads to the copy now.' })
  serving!: boolean;
  @ApiProperty({ description: 'Plain-words explanation for the card.' })
  note!: string;
}

export class ReplicaToggleDto {
  @ApiProperty() @IsBoolean() enabled!: boolean;
}

/** S10-7: what one press of «Повторить упавшие задачи» did. */
export class QueueRetryResultDto {
  @ApiProperty({ description: 'Failed jobs put back in their queues.' })
  retried!: number;

  @ApiProperty({
    description:
      'Stripe events moved from the dead-letter queue to processing.',
  })
  stripeReplayed!: number;

  @ApiProperty({
    type: 'object',
    additionalProperties: { type: 'number' },
    description: 'Per queue: failed jobs retried.',
  })
  byQueue!: Record<string, number>;
}
