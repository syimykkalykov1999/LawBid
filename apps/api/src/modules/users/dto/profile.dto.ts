import { PERSON_NAME_MAX_LENGTH } from './onboarding-profile.dto';
import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsUUID,
  ValidateIf,
  IsIn,
  IsOptional,
  IsString,
  Length,
  Matches,
} from 'class-validator';
import { ThemePref } from '@prisma/client';

/** docs/01_FOUNDATION_AUTH.md §11 step 2: only client/attorney are
 * selectable; admin accounts are created by seed/admin tooling. */
export class SetRoleDto {
  @IsIn(['client', 'attorney'])
  role!: 'client' | 'attorney';
}

/** docs/01_FOUNDATION_AUTH.md §11 steps 1/3A/3B (name) and §15 stage 1.7
 * acceptance item 7 (language + theme persist). */
export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @Length(1, PERSON_NAME_MAX_LENGTH)
  firstName?: string;

  @IsOptional()
  @IsString()
  @Length(1, PERSON_NAME_MAX_LENGTH)
  lastName?: string;

  @IsOptional()
  @Matches(/^[a-z]{2}$/)
  uiLanguage?: string;

  @IsOptional()
  @IsEnum(ThemePref)
  theme?: ThemePref;

  /** docs/03 §4.1 photo (OQ-012 attorney onboarding photo step): a clean
   * `avatar` file from POST /files/presign + confirm; null removes it. */
  @ApiPropertyOptional({ type: String, format: 'uuid', nullable: true })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsUUID()
  avatarFileId?: string | null;
}
