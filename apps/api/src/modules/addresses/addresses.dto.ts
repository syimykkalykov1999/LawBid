import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsOptional, IsString, Length, Matches } from 'class-validator';

export const ADDRESS_KINDS = ['address', 'city'] as const;

export class AddressSuggestQueryDto {
  @ApiProperty({
    description:
      'What the person typed so far. Fewer than 3 letters (after trimming) returns no suggestions without a provider call.',
    maxLength: 200,
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @Length(0, 200)
  q!: string;

  @ApiPropertyOptional({
    // A plain string, not an enum: an inline query enum would renumber the
    // generated Dart Kind3/Kind4 enums other screens use.
    type: String,
    pattern: '^(address|city)$',
    description: 'address (default): street addresses; city: cities only.',
  })
  @IsOptional()
  @IsString()
  @Matches(/^(address|city)$/)
  kind?: string;

  @ApiPropertyOptional({
    description:
      'A random id the app makes when the field gets focus and keeps until an address is picked (Google bills one session instead of every key stroke).',
    maxLength: 64,
  })
  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z0-9_-]{8,64}$/)
  session?: string;
}

export class AddressSuggestionDto {
  @ApiProperty({
    description:
      'The full text for the field, e.g. "12 Main St, Hays, KS 67601".',
  })
  label!: string;

  @ApiProperty({ type: String, nullable: true })
  city!: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Two-letter US state code.',
  })
  stateCode!: string | null;
}

/** `enabled` false = the suggestions are off (switch, no keys, cap
 * reached): the field stays a plain text field. */
export class AddressSuggestionsDto {
  @ApiProperty()
  enabled!: boolean;

  @ApiProperty({ type: [AddressSuggestionDto] })
  items!: AddressSuggestionDto[];
}
