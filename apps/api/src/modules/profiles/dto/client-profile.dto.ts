import { ApiProperty, PickType } from '@nestjs/swagger';
import { ContactMethod } from '@prisma/client';
import { OnboardingProfileDto } from '../../users/dto/onboarding-profile.dto';
import { StateRefDto } from './attorney-profile.dto';

/** PATCH /users/me/profile (docs/03 §5 "Редактировать": имя, фамилия,
 * штат, языки, способ связи, заметка о времени — fields of docs/01 §11
 * step 3A; same rules as onboarding). Phone/email change only through
 * /users/me/contacts/* (reauth + code); the photo comes with uploads. */
export class UpdateClientProfileDto extends PickType(OnboardingProfileDto, [
  'firstName',
  'lastName',
  'stateCode',
  'languages',
  'contactMethod',
  'contactNote',
] as const) {}

/** PATCH /users/me/contact-preferences (docs/03 §5 API). */
export class UpdateContactPreferencesDto extends PickType(
  OnboardingProfileDto,
  ['contactMethod', 'contactNote'] as const,
) {}

/** GET/PATCH /users/me/profile — visible only to the client (§5). */
export class ClientProfileDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

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
