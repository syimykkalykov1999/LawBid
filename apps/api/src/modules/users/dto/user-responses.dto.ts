import { ApiProperty } from '@nestjs/swagger';
import {
  ContactMethod,
  IdentifierType,
  Prisma,
  ThemePref,
  UserRole,
  UserStatus,
  VerificationStatus,
} from '@prisma/client';

/**
 * Response payloads of /users/me* (docs/01_FOUNDATION_AUTH.md §10.5, §11)
 * for the OpenAPI contract (docs/01 §6.3). Documentation of the plain
 * objects OnboardingService / AccountIdentifiersService return (MeView,
 * IdentifierView) — the `data` of the §7 envelope.
 */

/** OnboardingService `MissingRequirement`. */
export const MISSING_REQUIREMENTS = [
  'consents',
  'role',
  'name',
  'phone_verified',
  'email_verified',
  'state',
  'licensed_states',
  'photo',
] as const;

export class OnboardingStateDto {
  @ApiProperty({
    type: String,
    nullable: true,
    description:
      'Last saved onboarding step (SaveOnboardingStepDto.currentStep).',
  })
  currentStep!: string | null;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  completedAt!: string | null;

  @ApiProperty({
    type: 'object',
    additionalProperties: true,
    nullable: true,
    description:
      'Free-form step-local UI data, merged on every PATCH (always a JSON object: SaveOnboardingStepDto.data is @IsObject).',
  })
  data!: Prisma.JsonValue;
}

/**
 * client_profiles / attorney_profiles view (docs/02 §4.C). One flat
 * schema for both roles, keyed by `MeDto.role`: a client's profile carries
 * stateCode/languages/contactMethod/contactNote, an attorney's
 * username/bio/firmName/languages/licensedStates/verificationStatus. The
 * fields of the other role are absent.
 */
export class MeProfileDto {
  @ApiProperty({
    required: false,
    description: 'Client: state of residence (USPS code).',
  })
  stateCode?: string;

  @ApiProperty({
    type: [String],
    description: 'ISO 639-1 codes (client preferred / attorney spoken).',
  })
  languages!: string[];

  @ApiProperty({
    required: false,
    enum: ContactMethod,
    enumName: 'ContactMethod',
    nullable: true,
    description: 'Client only.',
  })
  contactMethod?: ContactMethod | null;

  @ApiProperty({
    required: false,
    type: String,
    nullable: true,
    description: 'Client only.',
  })
  contactNote?: string | null;

  @ApiProperty({ required: false, description: 'Attorney only.' })
  username?: string;

  @ApiProperty({
    required: false,
    type: String,
    nullable: true,
    description: 'Attorney only.',
  })
  bio?: string | null;

  @ApiProperty({
    required: false,
    type: String,
    nullable: true,
    description: 'Attorney only.',
  })
  firmName?: string | null;

  @ApiProperty({
    required: false,
    type: [String],
    description: 'Attorney only: USPS codes of licensed states.',
  })
  licensedStates?: string[];

  @ApiProperty({
    required: false,
    enum: VerificationStatus,
    enumName: 'VerificationStatus',
    description: 'Attorney only.',
  })
  verificationStatus?: VerificationStatus;
}

/** GET /users/me and every onboarding mutation (MeView). */
export class MeDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({
    enum: UserRole,
    enumName: 'UserRole',
    nullable: true,
    description: 'Null until POST /users/me/role.',
  })
  role!: UserRole | null;

  @ApiProperty({ enum: UserStatus, enumName: 'UserStatus' })
  status!: UserStatus;

  @ApiProperty({ type: String, nullable: true })
  firstName!: string | null;

  @ApiProperty({ type: String, nullable: true })
  lastName!: string | null;

  @ApiProperty({ type: String, nullable: true })
  email!: string | null;

  @ApiProperty()
  emailVerified!: boolean;

  @ApiProperty({ type: String, nullable: true, description: 'E.164.' })
  phone!: string | null;

  @ApiProperty()
  phoneVerified!: boolean;

  @ApiProperty({ description: 'ISO 639-1 interface language.' })
  uiLanguage!: string;

  @ApiProperty({ enum: ThemePref, enumName: 'ThemePref' })
  theme!: ThemePref;

  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  avatarFileId!: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Short-lived signed link to the avatar (1024 px JPEG).',
  })
  avatarUrl!: string | null;

  @ApiProperty()
  requiredConsentsGranted!: boolean;

  @ApiProperty({ type: OnboardingStateDto })
  onboarding!: OnboardingStateDto;

  @ApiProperty({
    type: MeProfileDto,
    nullable: true,
    description: 'Null before the profile step is saved (or without a role).',
  })
  profile!: MeProfileDto | null;

  @ApiProperty({
    enum: MISSING_REQUIREMENTS,
    enumName: 'MissingRequirement',
    isArray: true,
    description: 'What still blocks POST /users/me/onboarding/complete.',
  })
  missing!: (typeof MISSING_REQUIREMENTS)[number][];
}

/** GET /users/me/identifiers (IdentifierView). */
export class IdentifierDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ enum: IdentifierType, enumName: 'IdentifierType' })
  provider!: IdentifierType;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Phone (E.164) or email; null for apple/google.',
  })
  value!: string | null;

  @ApiProperty()
  verified!: boolean;

  @ApiProperty({
    description: "True for the phone/email that is the account's contact.",
  })
  isPrimaryContact!: boolean;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: string;
}

/** POST /users/me/contacts/request. */
export class ContactCodeSentDto {
  @ApiProperty({ description: 'Always true: the code was sent.' })
  sent!: boolean;
}

/** POST /users/me/contacts/verify. */
export class ContactVerifiedDto {
  @ApiProperty({ description: 'Always true.' })
  verified!: boolean;
}

/** POST /users/me/consents. */
export class ConsentsSavedDto {
  @ApiProperty({ description: 'Always true.' })
  saved!: boolean;
}

/** DELETE /users/me: the 14-day grace period started (docs/01 §10.7). */
export class DeletionPendingDto {
  @ApiProperty({ description: 'Always true.' })
  deletionPending!: boolean;
}
