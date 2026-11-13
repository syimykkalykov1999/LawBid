import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsInt, IsUUID, Matches, Max, Min } from 'class-validator';
import { AI_IMAGE_MIMES, AI_RETENTION_MAX_DAYS } from './ai-attachments.logic';

/** Step 1 of an image for an AI: what the owner's browser will upload. */
export class AiImageUploadDto {
  @ApiProperty({ enum: AI_IMAGE_MIMES, enumName: 'AiImageMime' })
  @IsIn([...AI_IMAGE_MIMES])
  mime!: string;

  @ApiProperty({
    minimum: 1,
    description:
      'Exact size in bytes. The files pipeline applies its chat-photo limit (no cap of ours).',
  })
  @IsInt()
  @Min(1)
  @Max(1024 * 1024 * 1024)
  sizeBytes!: number;

  @ApiProperty({ description: 'Lowercase hex SHA-256 of the file.' })
  @Matches(/^[0-9a-f]{64}$/)
  sha256!: string;
}

export class AiImageFileParamDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('all')
  fileId!: string;
}

/** A picture already attached to a role or a correction note. */
export class AiAttachmentViewDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() mime!: string;
  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Short signed preview link (owner page only).',
  })
  previewUrl!: string | null;
  @ApiProperty({ description: 'False while the antivirus check runs.' })
  ready!: boolean;
}

/** «Хранить N дней» (0 = keep forever). */
export class AiRetentionDto {
  @ApiProperty({
    minimum: 0,
    maximum: AI_RETENTION_MAX_DAYS,
    description: 'AI employee records (finished runs, decided items).',
  })
  recordsDays!: number;
  @ApiProperty({ minimum: 0, maximum: AI_RETENTION_MAX_DAYS })
  imagesDays!: number;
}

export class UpdateAiRetentionDto {
  @ApiProperty({ minimum: 0, maximum: AI_RETENTION_MAX_DAYS })
  @IsInt()
  @Min(0)
  @Max(AI_RETENTION_MAX_DAYS)
  days!: number;

  @ApiProperty({ enum: ['records', 'images'], enumName: 'AiRetentionWhat' })
  @IsIn(['records', 'images'])
  what!: 'records' | 'images';
}

export class PurgeAiRetentionDto {
  @ApiProperty({
    enum: ['older', 'all'],
    enumName: 'AiPurgeMode',
    description:
      'older = past the chosen days; all = every finished record and closed image now.',
  })
  @IsIn(['older', 'all'])
  mode!: 'older' | 'all';

  @ApiProperty({
    enum: ['worker', 'technician'],
    enumName: 'AiPurgeScope',
    description:
      'worker = «ИИ-сотрудник» records and images; technician = «ИИ-техник» images.',
  })
  @IsIn(['worker', 'technician'])
  scope!: 'worker' | 'technician';
}

export class AiPurgedDto {
  @ApiProperty() items!: number;
  @ApiProperty() runs!: number;
  @ApiProperty() images!: number;
  @ApiProperty() closedTasks!: number;
  @ApiProperty() unattached!: number;
}
