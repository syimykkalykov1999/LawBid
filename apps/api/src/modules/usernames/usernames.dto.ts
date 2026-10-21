import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsString, Length, MaxLength } from 'class-validator';

export const USERNAME_KINDS = ['user', 'channel', 'group'] as const;
export const USERNAME_REASONS = [
  'invalid',
  'reserved',
  'taken',
  'held',
  'similar',
] as const;

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

/** GET /usernames/check?u=&kind=&title=&id= */
export class UsernameCheckQueryDto {
  @ApiProperty({ description: 'The handle as typed, with or without @.' })
  @Transform(trim)
  @IsString()
  @Length(1, 64)
  u!: string;

  @ApiProperty({ enum: USERNAME_KINDS, enumName: 'UsernameKind' })
  @IsIn(USERNAME_KINDS)
  kind!: (typeof USERNAME_KINDS)[number];

  @ApiPropertyOptional({
    description: 'The title typed on the form (ideas for suggestions).',
  })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(80)
  title?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description:
      'The channel or group being renamed: its own handle is available.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(36)
  id?: string;
}

export class UsernameCheckDto {
  @ApiProperty({ description: 'Normalized: lower case, no @.' })
  username!: string;

  @ApiProperty()
  available!: boolean;

  @ApiProperty({
    enum: USERNAME_REASONS,
    enumName: 'UsernameCheckReason',
    nullable: true,
    description:
      'invalid · reserved · taken · held (freed lately, waits for its old owner) · similar (reads like another handle); null when free.',
  })
  reason!: (typeof USERNAME_REASONS)[number] | null;

  @ApiProperty({
    type: [String],
    description: '3–5 free handles to offer; empty when available.',
  })
  suggestions!: string[];
}
