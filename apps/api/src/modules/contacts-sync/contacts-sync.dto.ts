import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  Matches,
} from 'class-validator';

/**
 * Most hashes in one upload. Owner 2026-10-22: the whole phone book goes up
 * in one request (10 000 hashes ≈ 670 KB; this route's body limit is
 * CONTACTS_BODY_LIMIT in app.setup.ts and the firewall exempts the path,
 * infra/modules/alb). Old builds still send 100-hash parts, which work too.
 */
export const CONTACT_HASHES_MAX = 10000;

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

export class SetFindByPhoneDto {
  @ApiProperty({
    description:
      'Clients only: people who have my number in their address book may find me.',
  })
  @IsBoolean()
  enabled!: boolean;
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

  @ApiProperty({
    description: '"Find me by my number" (clients; attorneys are public).',
  })
  findByPhone!: boolean;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description:
      'ISO country of the account number ("US", "KG"): the default region for national-format numbers in the address book.',
  })
  phoneRegion!: string | null;
}

export class ContactPersonDto {
  @ApiProperty({
    description:
      'The hash of this upload that matched, so the app can find the phone-book name locally.',
  })
  hash!: string;

  @ApiProperty({ format: 'uuid' })
  userId!: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  username!: string | null;

  @ApiProperty({
    description:
      'Attorneys: full public name. Clients: first name only, no username.',
  })
  displayName!: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  avatarUrl!: string | null;

  @ApiPropertyOptional({
    enum: ['client', 'attorney', 'assistant'],
    nullable: true,
  })
  role!: string | null;
}

export class ContactUploadResultDto {
  @ApiProperty({
    type: 'integer',
    minimum: 0,
    description: 'Hashes of this upload that belong to LawBid users.',
  })
  matched!: number;

  @ApiProperty({
    type: [ContactPersonDto],
    description:
      'Who matched, with the hash the app sent. Not stored: only the owner → user pair is.',
  })
  people!: ContactPersonDto[];
}
