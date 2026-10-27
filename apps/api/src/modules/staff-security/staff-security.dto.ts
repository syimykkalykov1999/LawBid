import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsUUID } from 'class-validator';

export const REVEAL_TARGETS = ['user', 'license'] as const;
export const REVEAL_FIELDS = ['phone', 'email', 'barNumber'] as const;

/** Staff package T11: which hidden value to show in full. */
export class RevealPiiDto {
  @ApiProperty({
    enum: REVEAL_TARGETS,
    description: 'user (phone, email) or license (barNumber).',
  })
  @IsIn(REVEAL_TARGETS)
  targetType!: (typeof REVEAL_TARGETS)[number];

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  targetId!: string;

  @ApiProperty({ enum: REVEAL_FIELDS })
  @IsIn(REVEAL_FIELDS)
  field!: (typeof REVEAL_FIELDS)[number];
}

export class RevealPiiResultDto {
  @ApiProperty({ enum: REVEAL_FIELDS }) field!: string;
  @ApiProperty({ description: 'The full value. Shown once; not stored.' })
  value!: string;
  @ApiProperty({
    type: Number,
    nullable: true,
    description: 'Reveals left today (null = no daily limit for this admin).',
  })
  remainingToday!: number | null;
}

/** Staff package T11: the faint watermark of the admin panel. */
export class StaffWatermarkDto {
  @ApiProperty({ description: 'True when the panel must draw the watermark.' })
  enabled!: boolean;
  @ApiProperty({
    description: 'Who the watermark names: login (or e-mail) and a short id.',
  })
  text!: string;
}
