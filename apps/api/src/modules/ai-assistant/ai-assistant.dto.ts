import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

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
  @ApiProperty({ description: 'ai.assistant_mode: off | on' }) mode!: string;
  @ApiProperty({ description: 'The GitHub App (github_infra) is saved.' })
  connected!: boolean;
  @ApiProperty({ description: 'A run may start now.' }) allowed!: boolean;
  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Why not, in words.',
  })
  reason!: string | null;
  @ApiProperty() monthUsd!: number;
  @ApiProperty() maxUsd!: number;
  @ApiProperty({ type: [AiTaskDto] }) tasks!: AiTaskDto[];
  @ApiProperty({ type: String, nullable: true }) tasksError!: string | null;
  @ApiProperty({ type: [AiRunDto] }) runs!: AiRunDto[];
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
}

export class AiTaskCreatedDto {
  @ApiProperty() number!: number;
  @ApiProperty() url!: string;
}
