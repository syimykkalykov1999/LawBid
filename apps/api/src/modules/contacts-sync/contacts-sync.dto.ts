import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  Matches,
  Min,
} from 'class-validator';

/**
 * Most hashes in one upload. Owner 2026-10-22: the whole phone book goes up
 * in one request (10 000 hashes ≈ 670 KB; this route's body limit is
 * CONTACTS_BODY_LIMIT in app.setup.ts and the firewall exempts the path,
 * infra/modules/alb). Old builds still send 100-hash parts, which work too.
 */
export const CONTACT_HASHES_MAX = 10000;

/**
 * Owner 2026-10-22: most numbers the server keeps per account (the stored
 * phone book, contact_book_hashes). The app keeps the same cap: it sends
 * the first CONTACT_BOOK_MAX hashes in sorted order.
 */
export const CONTACT_BOOK_MAX = 20000;

const SHA256_HEX = /^[0-9a-f]{64}$/;

/**
 * Owner 2026-10-22 (like Telegram's contacts hash / WhatsApp's delta sync):
 * - `{bookHash}` alone: "has my book changed?" Equal to the stored one →
 *   `status: not_modified`, nothing else is done;
 * - `{full: true, added, bookHash?}`: the whole book (first sync, or after
 *   `resync`); replaces what is stored. A book over 10 000 goes in parts:
 *   the first `full`, the next ones as deltas on the returned `bookHash`;
 * - `{baseHash, added, removed, bookHash?}`: only the changes since the
 *   book whose hash is `baseHash`. A different stored hash → `resync`.
 * `bookHash` is the XOR of all the book's hashes (64 hex; empty book =
 * 64 zeros). Old builds send `{hashes}`: matched and added, nothing removed.
 */
export class UploadContactHashesDto {
  @ApiPropertyOptional({
    type: [String],
    maxItems: CONTACT_HASHES_MAX,
    description:
      'Old builds: lowercase hex SHA-256 of each normalized E.164 number ("+14155552680"). Never raw numbers.',
    example: [
      '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08',
    ],
  })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(CONTACT_HASHES_MAX)
  @Matches(SHA256_HEX, { each: true })
  hashes?: string[];

  @ApiPropertyOptional({
    description:
      'The whole book: `added` replaces every stored hash (first sync, or after `resync`).',
  })
  @IsOptional()
  @IsBoolean()
  full?: boolean;

  @ApiPropertyOptional({
    type: [String],
    maxItems: CONTACT_HASHES_MAX,
    description:
      'Hashes added since `baseHash` (or the whole book with `full`).',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(CONTACT_HASHES_MAX)
  @Matches(SHA256_HEX, { each: true })
  added?: string[];

  @ApiPropertyOptional({
    type: [String],
    maxItems: CONTACT_HASHES_MAX,
    description: 'Hashes removed from the book since `baseHash`.',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(CONTACT_HASHES_MAX)
  @Matches(SHA256_HEX, { each: true })
  removed?: string[];

  @ApiPropertyOptional({
    description:
      'The book hash the app believes the server has (from the last answer). Required with `added` / `removed` unless `full`.',
  })
  @IsOptional()
  @Matches(SHA256_HEX)
  baseHash?: string;

  @ApiPropertyOptional({
    description:
      'XOR of every hash of the app’s book now (after this request). Alone: the "not modified" check.',
  })
  @IsOptional()
  @Matches(SHA256_HEX)
  bookHash?: string;

  @ApiPropertyOptional({
    type: 'integer',
    minimum: 0,
    description:
      'The `matchesVersion` of the people list the app has; a newer one on the server sends the list again.',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  matchesVersion?: number;
}

export class SetNotifyJoinedDto {
  @ApiProperty({
    description:
      '«Notify me when contacts join LawBid»: the server sends "X joined LawBid".',
  })
  @IsBoolean()
  enabled!: boolean;
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

  @ApiProperty({
    description:
      '«Notify me when contacts join LawBid» (owner 2026-10-22: sent by the server).',
  })
  notifyJoined!: boolean;
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
      'Old `{hashes}` upload: who of this upload matched. Hash-checked sync (`status: ok`): EVERY person of the stored book on LawBid; the app replaces its list. Empty for not_modified / resync.',
  })
  people!: ContactPersonDto[];

  @ApiPropertyOptional({
    enum: ['ok', 'not_modified', 'resync'],
    description:
      'Hash-checked sync only (absent for `{hashes}`). not_modified: the book and the people list are as the app has them, nothing was done. resync: the server does not have the book `baseHash` names: send it whole (`full`).',
  })
  status?: 'ok' | 'not_modified' | 'resync';

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description:
      'The stored book hash after this request (the next `baseHash`).',
  })
  bookHash?: string | null;

  @ApiPropertyOptional({ type: 'integer', minimum: 0 })
  bookSize?: number;

  @ApiPropertyOptional({
    type: 'integer',
    minimum: 0,
    description:
      'Version of the people list (send it back as `matchesVersion`).',
  })
  matchesVersion?: number;
}
