import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsObject,
  IsOptional,
  IsString,
  Length,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { DeviceInfoDto } from '../dto/device-info.dto';

const CHALLENGE_ID = { minLength: 16, maxLength: 64 };

/** A stored passkey, as shown in the account's security settings. */
export class PasskeyDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ description: 'Label chosen at enrolment (or a default).' })
  name!: string;

  @ApiProperty({
    enum: ['singleDevice', 'multiDevice'],
    description:
      'multiDevice = a synced passkey (iCloud Keychain, Google Password Manager); singleDevice = a hardware key.',
  })
  deviceType!: string;

  @ApiProperty({ description: 'Backed up by the platform (synced).' })
  backedUp!: boolean;

  @ApiProperty({ type: [String] })
  transports!: string[];

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  lastUsedAt!: string | null;
}

export class PasskeyListDto {
  @ApiProperty({ type: [PasskeyDto] })
  passkeys!: PasskeyDto[];
}

/** `navigator.credentials.create()` options (WebAuthn JSON form). */
export class PasskeyRegistrationOptionsDto {
  @ApiProperty({
    type: 'object',
    additionalProperties: true,
    description:
      'PublicKeyCredentialCreationOptionsJSON — pass to @simplewebauthn/browser startRegistration() or the native passkey API as is.',
  })
  options!: Record<string, unknown>;
}

/** `navigator.credentials.get()` options plus the challenge handle. */
export class PasskeyAuthenticationOptionsDto {
  @ApiProperty({
    description: 'Send it back with the assertion (single use, 5 minutes).',
  })
  challengeId!: string;

  @ApiProperty({
    type: 'object',
    additionalProperties: true,
    description:
      'PublicKeyCredentialRequestOptionsJSON — pass to startAuthentication() or the native passkey API as is.',
  })
  options!: Record<string, unknown>;
}

export class PasskeyRegisterDto {
  @ApiProperty({
    type: 'object',
    additionalProperties: true,
    description: 'RegistrationResponseJSON from the authenticator.',
  })
  @IsObject()
  response!: Record<string, unknown>;

  @ApiPropertyOptional({
    maxLength: 80,
    description: 'Label for the list («iPhone», «YubiKey»).',
  })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  name?: string;
}

export class PasskeyLoginOptionsDto {
  @ApiPropertyOptional({ type: DeviceInfoDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => DeviceInfoDto)
  deviceInfo?: DeviceInfoDto;
}

export class PasskeyAssertDto {
  @ApiProperty(CHALLENGE_ID)
  @IsString()
  @Length(CHALLENGE_ID.minLength, CHALLENGE_ID.maxLength)
  challengeId!: string;

  @ApiProperty({
    type: 'object',
    additionalProperties: true,
    description: 'AuthenticationResponseJSON from the authenticator.',
  })
  @IsObject()
  response!: Record<string, unknown>;
}

export class PasskeyLoginDto extends PasskeyAssertDto {
  @ApiPropertyOptional({ type: DeviceInfoDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => DeviceInfoDto)
  deviceInfo?: DeviceInfoDto;
}

export class PasskeyRemovedDto {
  @ApiProperty()
  removed!: true;
}
