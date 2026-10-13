import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayMaxSize, ArrayMinSize, IsArray, Matches } from 'class-validator';

/** Most hashes in one upload; the app sends bigger books in chunks. */
export const CONTACT_HASHES_MAX = 2000;

export class UploadContactHashesDto {
  @ApiProperty({
    type: [String],
    maxItems: CONTACT_HASHES_MAX,
    description:
      'Lowercase hex SHA-256 of each normalized E.164 number ("+14155552680"). Never raw numbers.',
    example: [
      '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08',
    ],
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(CONTACT_HASHES_MAX)
  @Matches(/^[0-9a-f]{64}$/, { each: true })
  hashes!: string[];
}

export class ContactSyncStatusDto {
  @ApiProperty({ description: 'The user has contacts sync turned on.' })
  enabled!: boolean;

  @ApiProperty({
    type: 'integer',
    minimum: 0,
    description: 'People from the address book found on LawBid.',
  })
  matches!: number;

  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  syncedAt!: string | null;
}

export class ContactUploadResultDto {
  @ApiProperty({
    type: 'integer',
    minimum: 0,
    description: 'Hashes of this upload that belong to LawBid users.',
  })
  matched!: number;
}
