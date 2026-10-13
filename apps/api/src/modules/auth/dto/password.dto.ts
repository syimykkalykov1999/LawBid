import { ApiProperty } from '@nestjs/swagger';
import {
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { DeviceInfoDto } from './device-info.dto';
import { IsPhoneOrEmailIdentifier } from './validators';
import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
} from '../services/password.service';

/** Owner 2026-10-13: set (or change) the password of the signed-in account. */
export class SetPasswordDto {
  @ApiProperty({
    minLength: PASSWORD_MIN_LENGTH,
    maxLength: PASSWORD_MAX_LENGTH,
  })
  @IsString()
  @MinLength(PASSWORD_MIN_LENGTH)
  @MaxLength(PASSWORD_MAX_LENGTH)
  password!: string;

  /** Required only when the account already has a password. */
  @IsOptional()
  @IsString()
  @MaxLength(PASSWORD_MAX_LENGTH)
  currentPassword?: string;
}

/** Sign in with a phone number or e-mail and the password — no SMS. */
export class PasswordLoginDto {
  @ApiProperty({ description: 'E.164 phone number or e-mail address.' })
  @IsString()
  @IsPhoneOrEmailIdentifier()
  identifier!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(PASSWORD_MAX_LENGTH)
  password!: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => DeviceInfoDto)
  deviceInfo?: DeviceInfoDto;
}

/** Forgot password: send a code to the account's verified e-mail, else SMS. */
export class PasswordResetRequestDto {
  @ApiProperty({ description: 'E.164 phone number or e-mail address.' })
  @IsString()
  @IsPhoneOrEmailIdentifier()
  identifier!: string;
}

/** Forgot password: the code + the new password; signs the user in. */
export class PasswordResetConfirmDto {
  @IsString()
  @IsPhoneOrEmailIdentifier()
  identifier!: string;

  @IsString()
  @Matches(/^\d{6}$/, { message: 'code must be exactly 6 digits' })
  code!: string;

  @ApiProperty({
    minLength: PASSWORD_MIN_LENGTH,
    maxLength: PASSWORD_MAX_LENGTH,
  })
  @IsString()
  @MinLength(PASSWORD_MIN_LENGTH)
  @MaxLength(PASSWORD_MAX_LENGTH)
  newPassword!: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => DeviceInfoDto)
  deviceInfo?: DeviceInfoDto;
}
