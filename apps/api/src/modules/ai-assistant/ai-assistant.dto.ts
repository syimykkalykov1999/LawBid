import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { STAFF_AI_MODELS } from '../staff-ai/staff-ai.types';

export class AiTaskPullDto {
  @ApiProperty() number!: number;
  @ApiProperty() url!: string;
  @ApiProperty({ enum: ['open', 'closed'] }) state!: string;
  @ApiProperty() merged!: boolean;
}

export class AiTaskDto {
  @ApiProperty() number!: number;
  @ApiProperty() title!: string;
  @ApiProperty({ enum: ['open', 'closed'] }) state!: string;
  @ApiProperty() url!: string;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
  @ApiProperty({ type: [AiTaskPullDto] }) pulls!: AiTaskPullDto[];
}

export class AiRunDto {
  @ApiProperty({ format: 'date-time' }) at!: string;
  @ApiProperty({ enum: ['task', 'schedule'] }) kind!: string;
  @ApiProperty({ type: Number, nullable: true }) issueNumber!: number | null;
  @ApiProperty() runUrl!: string;
  @ApiProperty() costUsd!: number;
  @ApiProperty() conclusion!: string;
  @ApiProperty({ type: String, nullable: true }) prUrl!: string | null;
}

export class AiAssistantStatusDto {
  @ApiProperty({ description: 'ai.assistant_mode: off | on | auto' })
  mode!: string;
  @ApiProperty({ description: 'The GitHub App (github_infra) is saved.' })
  connected!: boolean;
  @ApiProperty({ description: 'A run may start now.' }) allowed!: boolean;
  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Why not, in words.',
  })
  reason!: string | null;
  @ApiProperty({
    description:
      'Owner tasks may be sent now (only in Вкл; Авто = the scheduled look only).',
  })
  tasksAllowed!: boolean;
  @ApiProperty({ type: String, nullable: true, description: 'Why not.' })
  tasksReason!: string | null;
  @ApiProperty() monthUsd!: number;
  @ApiProperty() maxUsd!: number;
  @ApiProperty({ type: [AiTaskDto] }) tasks!: AiTaskDto[];
  @ApiProperty({ type: String, nullable: true }) tasksError!: string | null;
  @ApiProperty({ type: [AiRunDto] }) runs!: AiRunDto[];
  @ApiProperty({
    enum: STAFF_AI_MODELS,
    enumName: 'AiWorkerModel',
    description: 'ai.assistant_model: the Claude model of the runs.',
  })
  model!: string;
  @ApiProperty({ type: [String], description: 'Models the owner may pick.' })
  models!: string[];
}

export class CreateAiTaskDto {
  @ApiProperty({ minLength: 5, maxLength: 200 })
  @IsString()
  @MinLength(5)
  @MaxLength(200)
  title!: string;

  @ApiProperty({ minLength: 10, maxLength: 5000 })
  @IsString()
  @MinLength(10)
  @MaxLength(5000)
  details!: string;

  @ApiPropertyOptional({
    type: [String],
    format: 'uuid',
    description:
      'Owner 2026-11-12: confirmed ai_attachment uploads (POST admin/ai-attachments/uploads). The issue gets only opaque ids; the workflow fetches the pictures from the API.',
  })
  @IsOptional()
  @IsArray()
  @IsUUID('all', { each: true })
  imageFileIds?: string[];
}

export class AiTaskCreatedDto {
  @ApiProperty() number!: number;
  @ApiProperty() url!: string;
}

/** 12.11.2026: one open PR of the AI assistant (branch ai/…). */
export class AiPullDto {
  @ApiProperty() number!: number;
  @ApiProperty() title!: string;
  @ApiProperty() url!: string;
  @ApiProperty({ description: 'What / why: the PR body, cut.' })
  summary!: string;
  @ApiProperty({ description: 'The head commit the owner approves.' })
  headSha!: string;
  @ApiProperty() branch!: string;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
  @ApiProperty({ enum: ['success', 'pending', 'failure', 'none', 'unknown'] })
  checks!: string;
  @ApiProperty({ type: Number, nullable: true }) costUsd!: number | null;
}

export class AiPullListDto {
  @ApiProperty({ type: [AiPullDto] }) pulls!: AiPullDto[];
  @ApiProperty({ type: String, nullable: true }) error!: string | null;
}

export class ApproveAiPullDto {
  @ApiProperty({
    description: 'The head sha the owner saw; the merge is pinned to it.',
    pattern: '^[0-9a-f]{40}$',
  })
  @IsString()
  @Matches(/^[0-9a-f]{40}$/)
  headSha!: string;
}

export class RejectAiPullDto {
  @ApiProperty({ required: false, maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class AiPullMergedDto {
  @ApiProperty() number!: number;
  @ApiProperty() mergedSha!: string;
}

export class AiPullClosedDto {
  @ApiProperty() number!: number;
}
