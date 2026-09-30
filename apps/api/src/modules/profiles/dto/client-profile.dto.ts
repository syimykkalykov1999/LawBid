import { ApiProperty, PickType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsOptional, IsString, Matches } from 'class-validator';
import { ContactMethod } from '@prisma/client';
import { OnboardingProfileDto } from '../../users/dto/onboarding-profile.dto';
import { USERNAME_PATTERN } from '../../users/services/username.util';
import { StateRefDto } from './attorney-profile.dto';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

/** PATCH /users/me/profile (docs/03 §5 "Редактировать": имя, фамилия,
 * штат, языки, способ связи, заметка о времени — fields of docs/01 §11
 * step 3A; same rules as onboarding). Phone/email change only through
 * /users/me/contacts/* (reauth + code); the photo comes with uploads.
 * Owner 2026-09-29 (OQ-026): the @username too, attorney rules. */
export class UpdateClientProfileDto extends PickType(OnboardingProfileDto, [
  'firstName',
  'lastName',
  'stateCode',
  'languages',
  'contactMethod',
  'contactNote',
] as const) {
  /** 3-30 latin letters, digits, `_` and `.`; not starting/ending with
   * `.`/`_`; no `..`. Uniqueness is case-insensitive across both roles. */
  @ApiProperty({ required: false })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @Matches(USERNAME_PATTERN, { message: 'username has an invalid format' })
  username?: string;
}

/** PATCH /users/me/contact-preferences (docs/03 §5 API). */
export class UpdateContactPreferencesDto extends PickType(
  OnboardingProfileDto,
  ['contactMethod', 'contactNote'] as const,
) {}

/** GET/PATCH /users/me/profile — visible only to the client (§5). */
export class ClientProfileDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ description: 'OQ-026: the client @username.' })
  username!: string;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'When the username may change again (cooldown), else null.',
  })
  usernameNextChangeAt!: string | null;

  @ApiProperty({ type: String, nullable: true })
  firstName!: string | null;

  @ApiProperty({ type: String, nullable: true })
  lastName!: string | null;

  @ApiProperty({ type: StateRefDto })
  state!: StateRefDto;

  @ApiProperty({ type: [String], description: 'ISO 639-1 codes.' })
  languages!: string[];

  @ApiProperty({
    enum: ContactMethod,
    enumName: 'ContactMethod',
    nullable: true,
  })
  contactMethod!: ContactMethod | null;

  @ApiProperty({ type: String, nullable: true })
  contactNote!: string | null;
}

/** A client in People search results (OQ-026): name, handle, avatar,
 * state — never contacts (docs/06 §1.5). */
export class ClientListItemDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  username!: string;

  @ApiProperty({ type: String, nullable: true })
  firstName!: string | null;

  @ApiProperty({ type: String, nullable: true })
  lastName!: string | null;

  @ApiProperty({ type: String, nullable: true })
  avatarUrl!: string | null;

  @ApiProperty({ example: 'NY' })
  stateCode!: string;

  /** OQ-029 final: blue check = the client confirmed a phone number. */
  @ApiProperty()
  verifiedBadge!: boolean;
}

/** GET /clients/:username — the public client mini-profile (OQ-026). */
export class PublicClientProfileDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  username!: string;

  @ApiProperty({ type: String, nullable: true })
  firstName!: string | null;

  @ApiProperty({ type: String, nullable: true })
  lastName!: string | null;

  @ApiProperty({ type: String, nullable: true })
  avatarUrl!: string | null;

  @ApiProperty({ type: StateRefDto })
  state!: StateRefDto;

  @ApiProperty({ description: 'ISO date of registration (YYYY-MM-DD).' })
  memberSince!: string;

  @ApiProperty()
  isSelf!: boolean;

  /** OQ-029 final: blue check = the client confirmed a phone number. */
  @ApiProperty()
  verifiedBadge!: boolean;

  /** OQ-028: the viewer blocked this user. */
  @ApiProperty()
  isBlocked!: boolean;

  /** OQ-028: this user blocked the viewer. */
  @ApiProperty()
  hasBlockedMe!: boolean;
}
