import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
} from 'class-validator';
import { LicenseStatus, VerificationStatus } from '@prisma/client';
import { ISO_639_1_CODES } from '../../users/iso-639-1';
import {
  BIO_MAX_LENGTH,
  MAX_LANGUAGES,
} from '../../users/dto/onboarding-profile.dto';
import { USERNAME_PATTERN } from '../../users/services/username.util';
import { SelectedPracticeAreaDto } from './practice-areas.dto';

/** docs/03 §4.1: first/last name 1-50, firm up to 80. */
export const ATTORNEY_NAME_MAX = 50;
export const ATTORNEY_FIRM_MAX = 80;
export const ATTORNEY_FIRMS_MAX = 5;

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;
const trimList = ({ value }: { value: unknown }): unknown =>
  Array.isArray(value)
    ? (value as unknown[])
        .map((v) => (typeof v === 'string' ? v.trim() : v))
        .filter((v) => v !== '')
    : value;
const lowerList = ({ value }: { value: unknown }): unknown =>
  Array.isArray(value)
    ? (value as unknown[]).map((v) =>
        typeof v === 'string' ? v.trim().toLowerCase() : v,
      )
    : value;

/** PATCH /attorneys/me/profile (docs/03 §4.1, §4.3). Absent = unchanged;
 * an empty bio/firm clears it. Photo arrives with file uploads (3.2). */
export class UpdateAttorneyProfileDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(1, ATTORNEY_NAME_MAX)
  firstName?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(1, ATTORNEY_NAME_MAX)
  lastName?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(BIO_MAX_LENGTH)
  bio?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(ATTORNEY_FIRM_MAX)
  firmName?: string;

  /** Owner 2026-09-30 (OQ-030): several firms (≤ 5, each ≤ 80 chars);
   * replaces the list. `firmName` mirrors the first one. */
  @ApiProperty({ required: false, type: [String] })
  @IsOptional()
  @Transform(trimList)
  @IsArray()
  @ArrayMaxSize(ATTORNEY_FIRMS_MAX)
  @IsString({ each: true })
  @Length(1, ATTORNEY_FIRM_MAX, { each: true })
  firms?: string[];

  @IsOptional()
  @Transform(lowerList)
  @IsArray()
  @ArrayMaxSize(MAX_LANGUAGES)
  @ArrayUnique()
  @IsIn([...ISO_639_1_CODES], {
    each: true,
    message: 'languages must contain ISO 639-1 codes',
  })
  languages?: string[];

  /** 3-30 latin letters, digits, `_` and `.`; not starting/ending with
   * `.`/`_`; no `..`. Uniqueness is case-insensitive. */
  @IsOptional()
  @Transform(trim)
  @IsString()
  @Matches(USERNAME_PATTERN, { message: 'username has an invalid format' })
  username?: string;
}

/** GET /attorneys/username-available?u= */
export class UsernameAvailableQueryDto {
  @Transform(trim)
  @IsString()
  @Length(1, 64)
  u!: string;
}

export const USERNAME_UNAVAILABLE_REASONS = [
  'invalid',
  'reserved',
  'taken',
] as const;
export type UsernameUnavailableReason =
  (typeof USERNAME_UNAVAILABLE_REASONS)[number];

export class UsernameAvailabilityDto {
  @ApiProperty()
  username!: string;

  @ApiProperty()
  available!: boolean;

  @ApiProperty({
    enum: USERNAME_UNAVAILABLE_REASONS,
    enumName: 'UsernameUnavailableReason',
    nullable: true,
    description: 'Why it is not available; null when available.',
  })
  reason!: UsernameUnavailableReason | null;
}

export class StateRefDto {
  @ApiProperty({ example: 'NY' })
  code!: string;

  @ApiProperty({ example: 'New York' })
  name!: string;
}

export class RatingDto {
  @ApiProperty({ description: 'Average of published reviews, 0 if none.' })
  avg!: number;

  @ApiProperty()
  count!: number;
}

export class ProfileCountersDto {
  @ApiProperty()
  posts!: number;

  @ApiProperty()
  followers!: number;

  @ApiProperty()
  following!: number;
}

/** The attorney's own license (bar number is shown only to the owner and
 * the verifier, docs/03 §6.2). */
export class OwnLicenseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ type: StateRefDto })
  state!: StateRefDto;

  @ApiProperty()
  barNumber!: string;

  @ApiProperty({ enum: LicenseStatus, enumName: 'LicenseStatus' })
  status!: LicenseStatus;

  @ApiProperty({ type: String, format: 'date', nullable: true })
  expiresAt!: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'verification.reject.<code> when status = rejected.',
  })
  rejectionCode!: string | null;
}

/** GET/PATCH /attorneys/me/profile. */
export class OwnAttorneyProfileDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  username!: string;

  @ApiProperty({ type: String, nullable: true })
  firstName!: string | null;

  @ApiProperty({ type: String, nullable: true })
  lastName!: string | null;

  @ApiProperty({ type: String, nullable: true })
  bio!: string | null;

  @ApiProperty({ type: String, nullable: true })
  firmName!: string | null;

  /** OQ-030: all firms (the first equals firmName). */
  @ApiProperty({ type: [String] })
  firms!: string[];

  @ApiProperty({ type: [String], description: 'ISO 639-1 codes.' })
  languages!: string[];

  @ApiProperty({ enum: VerificationStatus, enumName: 'VerificationStatus' })
  verificationStatus!: VerificationStatus;

  @ApiProperty({
    description:
      'Blue check (docs/03 §6.3): verified status and at least one verified license.',
  })
  verifiedBadge!: boolean;

  /** OQ-029: the current name is far from the verified one, so the blue
   * check is hidden until it is changed back (own profile only). */
  @ApiProperty()
  nameMismatch!: boolean;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  usernameChangedAt!: string | null;

  @ApiProperty({
    type: String,
    format: 'date-time',
    nullable: true,
    description:
      'When the username may be changed again; null = it can be changed now.',
  })
  usernameNextChangeAt!: string | null;

  @ApiProperty({ type: [OwnLicenseDto] })
  licenses!: OwnLicenseDto[];

  @ApiProperty({ type: RatingDto })
  rating!: RatingDto;

  @ApiProperty({ type: ProfileCountersDto })
  counters!: ProfileCountersDto;
}

/** GET /attorneys/:username — what any signed-in user may see
 * (docs/03 §4.2, §6). Never bar numbers, documents or contacts. */
export class PublicAttorneyProfileDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  username!: string;

  @ApiProperty({ type: String, nullable: true })
  firstName!: string | null;

  @ApiProperty({ type: String, nullable: true })
  lastName!: string | null;

  @ApiProperty({ type: String, nullable: true })
  bio!: string | null;

  @ApiProperty({ type: String, nullable: true })
  firmName!: string | null;

  /** OQ-030: all firms (the first equals firmName). */
  @ApiProperty({ type: [String] })
  firms!: string[];

  @ApiProperty({
    type: String,
    nullable: true,
    description:
      'Short-lived signed link to the attorney photo (1024 px JPEG); null when none.',
  })
  avatarUrl!: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Signed link to the 256 px square variant; null when none.',
  })
  avatarUrl256!: string | null;

  @ApiProperty({ type: [String] })
  languages!: string[];

  @ApiProperty({ description: 'Blue check (docs/03 §6.3).' })
  verifiedBadge!: boolean;

  @ApiProperty({
    type: [StateRefDto],
    description: 'States of verified licenses only.',
  })
  licensedStates!: StateRefDto[];

  @ApiProperty({ type: [SelectedPracticeAreaDto] })
  practiceAreas!: SelectedPracticeAreaDto[];

  @ApiProperty({ type: RatingDto })
  rating!: RatingDto;

  @ApiProperty({ type: ProfileCountersDto })
  counters!: ProfileCountersDto;

  @ApiProperty({ description: "True when this is the caller's own profile." })
  isSelf!: boolean;

  @ApiProperty({
    description: 'The viewer follows this attorney (docs/05 §6.2).',
  })
  isFollowing!: boolean;

  /** OQ-028: the viewer blocked this user. */
  @ApiProperty()
  isBlocked!: boolean;

  /** OQ-028: this user blocked the viewer (no follow / message). */
  @ApiProperty()
  hasBlockedMe!: boolean;
}
