import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { AiAttachmentViewDto } from '../ai-attachments/ai-attachments.dto';
import { STAFF_AI_MODELS } from '../staff-ai/staff-ai.types';
import { VERDICT_DECISIONS } from './ai-worker.prompt';
import { AI_WORKER_QUEUES } from './ai-worker.queues';
import { LANES } from './ai-worker.routing';

export class AiWorkerQueueDto {
  @ApiProperty({ enum: AI_WORKER_QUEUES, enumName: 'AiWorkerQueueKey' })
  key!: string;
  @ApiProperty() label!: string;
  @ApiProperty({
    enum: STAFF_AI_MODELS,
    enumName: 'AiWorkerModel',
    description: 'Model a new role of this queue starts with.',
  })
  defaultModel!: string;
}

export class AiWorkerRoleDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() instructions!: string;
  @ApiProperty({ enum: AI_WORKER_QUEUES, enumName: 'AiWorkerQueueKey' })
  queue!: string;
  @ApiProperty({ enum: STAFF_AI_MODELS, enumName: 'AiWorkerModel' })
  model!: string;
  @ApiProperty({ description: 'Bulk lane from this confidence (0-100).' })
  confidenceMin!: number;
  @ApiProperty({ description: '% of confident proposals still audited.' })
  auditPct!: number;
  @ApiProperty({ description: 'Proposals the owner decided.' })
  reviewed!: number;
  @ApiProperty({ description: 'Of them, the owner agreed.' }) agreed!: number;
  @ApiProperty({
    type: Number,
    nullable: true,
    description: 'Agreement with the owner, %.',
  })
  agreementPct!: number | null;
  @ApiProperty({
    type: [AiAttachmentViewDto],
    description: 'Example screenshots / instructions of the role.',
  })
  images!: AiAttachmentViewDto[];
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
}

export class AiWorkerLaneCountsDto {
  @ApiProperty() priority!: number;
  @ApiProperty() audit!: number;
  @ApiProperty() bulk!: number;
}

export class AiWorkerRunDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid' }) roleId!: string;
  @ApiProperty() roleName!: string;
  @ApiProperty({
    enum: ['queued', 'running', 'done', 'failed', 'canceled'],
    enumName: 'AiWorkerRunStatus',
  })
  status!: string;
  @ApiProperty() model!: string;
  @ApiProperty() total!: number;
  @ApiProperty() proposed!: number;
  @ApiProperty() failed!: number;
  @ApiProperty({ description: 'A Message Batch is being processed now.' })
  inFlight!: boolean;
  @ApiProperty({ description: 'What the run cost so far, cents.' })
  costCents!: number;
  @ApiProperty({ type: String, nullable: true }) error!: string | null;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
  @ApiProperty({ type: String, nullable: true, format: 'date-time' })
  finishedAt!: string | null;
}

export class AiWorkerExampleDto {
  @ApiProperty({ format: 'uuid' }) itemId!: string;
  @ApiProperty() summary!: string;
}

export class AiWorkerProposalDto {
  @ApiProperty({ enum: AI_WORKER_QUEUES, enumName: 'AiWorkerQueueKey' })
  queue!: string;
  @ApiProperty() label!: string;
  @ApiProperty() open!: number;
  @ApiProperty({ type: String, nullable: true, format: 'uuid' })
  roleId!: string | null;
  @ApiProperty() text!: string;
  @ApiProperty({ type: [AiWorkerExampleDto] }) examples!: AiWorkerExampleDto[];
}

export class AiWorkerStatusDto {
  @ApiProperty({ description: 'Master switch staff.ai_enabled is on.' })
  enabled!: boolean;
  @ApiProperty({ description: 'staff.ai.monthly_cents' }) budgetCents!: number;
  @ApiProperty() spentCents!: number;
  @ApiProperty({ type: [String] }) models!: string[];
  @ApiProperty() defaultModel!: string;
  @ApiProperty({ type: [AiWorkerQueueDto] }) queues!: AiWorkerQueueDto[];
  @ApiProperty({ description: 'Proposals waiting for the owner.' })
  toReview!: number;
  @ApiProperty({ type: AiWorkerLaneCountsDto })
  toReviewByLane!: AiWorkerLaneCountsDto;
  @ApiProperty({ type: [AiWorkerRoleDto] }) roles!: AiWorkerRoleDto[];
  @ApiProperty({ type: [AiWorkerRunDto] }) runs!: AiWorkerRunDto[];
  @ApiProperty({ type: [AiWorkerProposalDto] })
  proposals!: AiWorkerProposalDto[];
}

export class AiWorkerEvidenceDto {
  @ApiProperty({ description: 'A platform fact line or a data field name.' })
  source!: string;
  @ApiProperty() note!: string;
}

export class AiWorkerItemDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid' }) runId!: string;
  @ApiProperty() roleName!: string;
  @ApiProperty({ format: 'uuid', description: 'The queue item (request id).' })
  itemId!: string;
  @ApiProperty() status!: string;
  @ApiProperty({
    type: String,
    nullable: true,
    enum: VERDICT_DECISIONS,
    enumName: 'AiWorkerDecision',
  })
  decision!: string | null;
  @ApiProperty({ type: Number, nullable: true }) confidence!: number | null;
  @ApiProperty({
    type: String,
    nullable: true,
    enum: LANES,
    enumName: 'AiWorkerLane',
  })
  lane!: string | null;
  @ApiProperty({ type: [String], description: 'Platform red flags.' })
  flags!: string[];
  @ApiProperty({ type: [String] }) reasons!: string[];
  @ApiProperty({ type: [AiWorkerEvidenceDto] })
  evidence!: AiWorkerEvidenceDto[];
  @ApiProperty({ type: String, nullable: true }) ownerDecision!: string | null;
  @ApiProperty({ type: String, nullable: true }) ownerNote!: string | null;
  @ApiProperty() draftNote!: string;
  @ApiProperty() injectionSuspected!: boolean;
  @ApiProperty({ type: String, nullable: true }) error!: string | null;
  @ApiProperty() costCents!: number;
  @ApiProperty({ type: String, nullable: true, format: 'date-time' })
  reviewedAt!: string | null;
  @ApiProperty({
    type: [AiAttachmentViewDto],
    description: 'Pictures of the owner’s correction note.',
  })
  images!: AiAttachmentViewDto[];
}

export class AiWorkerItemsDto {
  @ApiProperty({ type: [AiWorkerItemDto] }) items!: AiWorkerItemDto[];
  @ApiProperty({ type: String, nullable: true }) nextCursor!: string | null;
}

export class AiWorkerItemsQueryDto {
  @ApiPropertyOptional({
    enum: [
      'proposed',
      'approved',
      'rejected',
      'failed',
      'pending',
      'sent',
      'skipped',
    ],
    enumName: 'AiWorkerItemStatus',
  })
  @IsOptional()
  @IsIn([
    'proposed',
    'approved',
    'rejected',
    'failed',
    'pending',
    'sent',
    'skipped',
  ])
  status?: string;

  @ApiPropertyOptional({ enum: LANES, enumName: 'AiWorkerLane' })
  @IsOptional()
  @IsIn([...LANES])
  lane?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  runId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  cursor?: string;
}

export class CreateAiRoleDto {
  @ApiProperty({ minLength: 2, maxLength: 120 })
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @ApiProperty({
    minLength: 10,
    maxLength: 8000,
    description: 'What the role does, in the owner’s words.',
  })
  @IsString()
  @MinLength(10)
  @MaxLength(8000)
  instructions!: string;

  @ApiProperty({ enum: AI_WORKER_QUEUES, enumName: 'AiWorkerQueueKey' })
  @IsIn([...AI_WORKER_QUEUES])
  queue!: string;

  @ApiPropertyOptional({ enum: STAFF_AI_MODELS, enumName: 'AiWorkerModel' })
  @IsOptional()
  @IsIn([...STAFF_AI_MODELS])
  model?: string;

  @ApiPropertyOptional({ minimum: 0, maximum: 100, default: 90 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  confidenceMin?: number;

  @ApiPropertyOptional({ minimum: 0, maximum: 100, default: 10 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  auditPct?: number;

  @ApiPropertyOptional({
    type: [String],
    format: 'uuid',
    maxItems: 10,
    description:
      'Owner 2026-11-12: confirmed ai_attachment uploads (POST admin/ai-attachments/uploads); the exact set replaces the old one.',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsUUID('all', { each: true })
  imageFileIds?: string[];
}

export class UpdateAiRoleDto {
  @ApiPropertyOptional({ minLength: 2, maxLength: 120 })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name?: string;

  @ApiPropertyOptional({ minLength: 10, maxLength: 8000 })
  @IsOptional()
  @IsString()
  @MinLength(10)
  @MaxLength(8000)
  instructions?: string;

  @ApiPropertyOptional({ enum: AI_WORKER_QUEUES, enumName: 'AiWorkerQueueKey' })
  @IsOptional()
  @IsIn([...AI_WORKER_QUEUES])
  queue?: string;

  @ApiPropertyOptional({ enum: STAFF_AI_MODELS, enumName: 'AiWorkerModel' })
  @IsOptional()
  @IsIn([...STAFF_AI_MODELS])
  model?: string;

  @ApiPropertyOptional({ minimum: 0, maximum: 100, default: 90 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  confidenceMin?: number;

  @ApiPropertyOptional({ minimum: 0, maximum: 100, default: 10 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  auditPct?: number;

  @ApiPropertyOptional({
    type: [String],
    format: 'uuid',
    maxItems: 10,
    description:
      'Owner 2026-11-12: confirmed ai_attachment uploads (POST admin/ai-attachments/uploads); the exact set replaces the old one.',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsUUID('all', { each: true })
  imageFileIds?: string[];
}

export class AiRoleIdParamDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  id!: string;
}

export class StartAiRunDto {
  @ApiPropertyOptional({
    description: 'Only the first N open items (empty = all of them).',
    minimum: 1,
    maximum: 1_000_000,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1_000_000)
  limit?: number;
}

export class ReviewAiItemsDto {
  @ApiProperty({ type: [String], format: 'uuid', maxItems: 500 })
  @IsUUID('all', { each: true })
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  ids!: string[];

  @ApiProperty({ enum: ['approved', 'rejected'], enumName: 'AiWorkerVerdict' })
  @IsIn(['approved', 'rejected'])
  verdict!: 'approved' | 'rejected';

  @ApiPropertyOptional({
    enum: VERDICT_DECISIONS,
    enumName: 'AiWorkerDecision',
    description: 'On reject: what is right (taught back to the role).',
  })
  @IsOptional()
  @IsIn([...VERDICT_DECISIONS])
  ownerDecision?: string;

  @ApiPropertyOptional({ maxLength: 1000 })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  ownerNote?: string;

  @ApiPropertyOptional({
    type: [String],
    format: 'uuid',
    maxItems: 10,
    description:
      'Owner 2026-11-12: confirmed ai_attachment uploads (POST admin/ai-attachments/uploads); the exact set replaces the old one.',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsUUID('all', { each: true })
  imageFileIds?: string[];
}

export class ApproveBulkAiItemsDto {
  @ApiPropertyOptional({ format: 'uuid', description: 'Only this run.' })
  @IsOptional()
  @IsUUID()
  runId?: string;
}

export class AiWorkerIdDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
}

export class AiWorkerRunStartedDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() total!: number;
}

export class AiWorkerReviewedDto {
  @ApiProperty() updated!: number;
}
