import { ApiProperty } from '@nestjs/swagger';

/** OQ-042: a real person mentioned in a text (unknown handles are left
 * out — the app shows them as plain text). */
export class MentionDto {
  @ApiProperty({ description: 'As written in the text, lowercase.' })
  username!: string;

  @ApiProperty({ format: 'uuid' })
  userId!: string;

  @ApiProperty({ enum: ['attorney', 'client'], enumName: 'MentionKind' })
  kind!: 'attorney' | 'client';
}
