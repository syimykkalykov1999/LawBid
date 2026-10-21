import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/** Owner 2026-10-20: who is behind a story / channel / comment — the
 * little card next to an avatar (stories, channels). */
export class UserBriefDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ enum: ['attorney', 'client'] })
  role!: 'attorney' | 'client';

  @ApiProperty()
  username!: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  firstName!: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  lastName!: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  avatarUrl!: string | null;

  /** Attorney: verified licence; client: the paid gold check. */
  @ApiProperty()
  verifiedBadge!: boolean;
}
