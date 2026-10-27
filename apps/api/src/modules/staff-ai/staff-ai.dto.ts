import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsUUID, MaxLength } from 'class-validator';
import { AI_ITEM_KINDS } from './staff-ai.types';

export const HINT_UNAVAILABLE_REASONS = [
  'budget',
  'timeout',
  'not_configured',
  'rate_limited',
  'no_context',
  'error',
] as const;

export class StaffAiHintParamDto {
  @ApiProperty({
    description: `Queue kind of the item: ${AI_ITEM_KINDS.join(', ')}.`,
  })
  @IsString()
  @MaxLength(24)
  kind!: string;

  @ApiProperty({ format: 'uuid', description: 'The item the caller holds.' })
  @IsUUID()
  itemId!: string;
}

export class StaffAiSummaryParamDto {
  @ApiProperty({ format: 'uuid', description: 'staff_suggestions.id' })
  @IsUUID()
  suggestionId!: string;
}

/** AI suggestion for one held item. A suggestion only: a human decides. */
export class StaffAiHintDto {
  @ApiProperty({
    description:
      'false = no hint this time (slow, over budget, rate limited…): the desk shows none',
  })
  available!: boolean;

  @ApiPropertyOptional({
    description: 'Suggested decision, one of the choices of the queue kind.',
  })
  suggestion?: string;

  @ApiPropertyOptional({ description: 'One short sentence in Russian.' })
  reason?: string;

  @ApiPropertyOptional({ minimum: 0, maximum: 100 })
  confidence?: number;

  @ApiPropertyOptional({ description: 'Model that answered.' })
  model?: string;

  @ApiProperty({ description: 'Served from the per-item cache.' })
  cached!: boolean;

  @ApiPropertyOptional({
    enum: HINT_UNAVAILABLE_REASONS,
    enumName: 'StaffAiHintUnavailable',
  })
  unavailable?: (typeof HINT_UNAVAILABLE_REASONS)[number];
}

/** Evidence text under one recommendation (AI text, else the rule template). */
export class StaffAiSummaryDto {
  @ApiProperty() available!: boolean;

  @ApiProperty({
    enum: ['ai', 'template', 'none'],
    enumName: 'StaffAiSummarySource',
  })
  source!: 'ai' | 'template' | 'none';

  @ApiProperty({ type: String, nullable: true })
  text!: string | null;

  @ApiPropertyOptional() model?: string;

  @ApiPropertyOptional({ description: 'ISO time the AI text was written.' })
  at?: string;
}
