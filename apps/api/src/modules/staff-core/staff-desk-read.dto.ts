import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Staff package T8: what the worker's one-page desk may read about the
 * switches and numbers. A worker cannot open `admin/staff/settings` (owner
 * only), so the desk gets this whitelist instead — switches and numbers
 * only, nothing about rates, thresholds of the rating or people.
 */
export class DeskSettingsDto {
  @ApiProperty({
    type: 'object',
    additionalProperties: { type: 'boolean' },
    description:
      'The `staff.*_enabled` switches the desk reads (workspaces, desk, leases per queue, presence, rating, worker progress, appeals, piecework, head). Per-queue lease switches already count only under `staff.lease_enabled`.',
  })
  switches!: Record<string, boolean>;

  @ApiProperty({
    type: 'object',
    additionalProperties: { type: 'integer' },
    description:
      'Timers and capacity the desk shows (heartbeat, lease lengths per queue, warning before loss, skips per hour, capacity), clamped to their admin bounds.',
  })
  numbers!: Record<string, number>;
}

export class DeskDecisionsQueryDto {
  @ApiProperty({ required: false, minimum: 1, maximum: 60, default: 14 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(60)
  days?: number;
}

export class DeskDecisionDayDto {
  @ApiProperty({ example: '2026-10-26' }) day!: string;
  @ApiProperty({ type: 'integer' }) decided!: number;
  @ApiProperty({ type: 'integer' }) avgHandleSec!: number;
  @ApiProperty({ type: 'integer', description: 'Came back after closing.' })
  reopened!: number;
  @ApiProperty({ type: 'integer', description: 'Closed after the due time.' })
  lateSla!: number;
  @ApiProperty({ type: 'integer' }) skips!: number;
}

export class DeskDecisionsDto {
  @ApiProperty({
    type: [DeskDecisionDayDto],
    description: 'My own days from the nightly counters, newest first.',
  })
  days!: DeskDecisionDayDto[];

  @ApiProperty({ type: 'integer' }) decidedTotal!: number;
}
