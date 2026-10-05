import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SupportAgentDto } from '../support/support.dto';

export const WORKSPACE_QUEUES = [
  'verification',
  'support',
  'moderation',
  'review_appeals',
  'cases',
  'payroll',
  'money',
] as const;
export type WorkspaceQueueKey = (typeof WORKSPACE_QUEUES)[number];

export class WorkspaceQueueDto {
  @ApiProperty({ enum: WORKSPACE_QUEUES }) key!: WorkspaceQueueKey;
  @ApiProperty() label!: string;
  @ApiProperty({ description: 'What one item is, e.g. «заявок».' })
  unit!: string;
  @ApiProperty({ description: 'Items waiting now.' }) count!: number;
  @ApiProperty({ description: 'Waiting too long (over the SLA or 24 h).' })
  urgent!: number;
  @ApiProperty({ description: 'The panel page with the full list.' })
  href!: string;
  @ApiProperty({
    description: 'The workspace can open items one by one («Начать»).',
  })
  focus!: boolean;
  @ApiProperty({ description: 'The admin may decide here (not only look).' })
  canAct!: boolean;
}

export class WorkspaceDto {
  @ApiProperty({ type: WorkspaceQueueDto, isArray: true })
  queues!: WorkspaceQueueDto[];
  @ApiPropertyOptional({
    type: SupportAgentDto,
    nullable: true,
    description: 'My support shift (support agents only).',
  })
  shift!: SupportAgentDto | null;
}
