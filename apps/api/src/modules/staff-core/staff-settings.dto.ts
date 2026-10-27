import { ApiProperty } from '@nestjs/swagger';

/** Staff package T1: every staff switch and number as the API applies it. */
export class StaffSettingsDto {
  @ApiProperty({
    type: 'object',
    additionalProperties: { type: 'boolean' },
    description:
      'Switches `staff.*_enabled` (all false by default). AI sub-switches count only with staff.ai_enabled, per-queue lease switches only with staff.lease_enabled.',
  })
  switches!: Record<string, boolean>;

  @ApiProperty({
    type: 'object',
    additionalProperties: { type: 'integer' },
    description:
      'Thresholds and limits (`staff.*`), clamped to their admin bounds.',
  })
  numbers!: Record<string, number>;
}
