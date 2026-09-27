import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
} from 'class-validator';
import { ContactMethod } from '@prisma/client';
import { ISO_639_1_CODES } from '../iso-639-1';

/** Longest bio (docs/02 §4.C "bio text? (≤300)", CHECK in the migration). */
export const BIO_MAX_LENGTH = 300;
/** docs/02 §4.C preferred_contact_note "до 200 символов". */
export const CONTACT_NOTE_MAX_LENGTH = 200;
/** Generous caps so a crafted request can't store an unbounded array. */
export const MAX_LANGUAGES = 20;
export const MAX_STATES = 51;
export const FIRM_NAME_MAX_LENGTH = 120;

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;
const upper = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim().toUpperCase() : value;
const upperList = ({ value }: { value: unknown }): unknown =>
  Array.isArray(value)
    ? (value as unknown[]).map((v) =>
        typeof v === 'string' ? v.trim().toUpperCase() : v,
      )
    : value;
const lowerList = ({ value }: { value: unknown }): unknown =>
  Array.isArray(value)
    ? (value as unknown[]).map((v) =>
        typeof v === 'string' ? v.trim().toLowerCase() : v,
      )
    : value;

const ISO_CODES = [...ISO_639_1_CODES];

/**
 * Structured profile of the onboarding profile step (docs/01 §11 steps
 * 3A/3B), persisted into client_profiles / attorney_profiles (docs/02
 * §4.C). One flat shape for both roles; OnboardingService rejects the
 * fields that don't belong to the caller's role, and checks state codes
 * against the `states` table (a DTO can't reach the DB).
 *
 * Client: stateCode, languages, contactMethod, contactNote.
 * Attorney: bio, firmName, languages, licensedStates.
 * Both: firstName/lastName (saved to users in the same transaction).
 * Photo (required for attorneys) arrives with file uploads, docs/03 stage
 * 3.2 — owner decision, not part of this DTO.
 */
export class OnboardingProfileDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(1, 80)
  firstName?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(1, 80)
  lastName?: string;

  /** Client: state of residence (50 + DC). */
  @IsOptional()
  @Transform(upper)
  @IsString()
  @Matches(/^[A-Z]{2}$/, { message: 'stateCode must be a 2-letter code' })
  stateCode?: string;

  /** Client preferred_languages / attorney languages — ISO 639-1. */
  @IsOptional()
  @Transform(lowerList)
  @IsArray()
  @ArrayMaxSize(MAX_LANGUAGES)
  @ArrayUnique()
  @IsIn(ISO_CODES, {
    each: true,
    message: 'languages must contain ISO 639-1 codes',
  })
  languages?: string[];

  @IsOptional()
  @IsEnum(ContactMethod)
  contactMethod?: ContactMethod | null;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(CONTACT_NOTE_MAX_LENGTH)
  contactNote?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(BIO_MAX_LENGTH)
  bio?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(FIRM_NAME_MAX_LENGTH)
  firmName?: string;

  /** Attorney: states where they hold a license (multi-select). Bar
   * numbers are collected on verification (docs/03), so these are not
   * attorney_licenses rows yet. */
  @IsOptional()
  @Transform(upperList)
  @IsArray()
  @ArrayMaxSize(MAX_STATES)
  @ArrayUnique()
  @Matches(/^[A-Z]{2}$/, {
    each: true,
    message: 'licensedStates must contain 2-letter codes',
  })
  licensedStates?: string[];
}

/** Keys of OnboardingProfileDto that only a client may send. */
export const CLIENT_ONLY_FIELDS = [
  'stateCode',
  'contactMethod',
  'contactNote',
] as const;
/** Keys of OnboardingProfileDto that only an attorney may send. */
export const ATTORNEY_ONLY_FIELDS = [
  'bio',
  'firmName',
  'licensedStates',
] as const;
