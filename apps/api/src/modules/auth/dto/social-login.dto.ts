import {
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { DeviceInfoDto } from './device-info.dto';
import { AgeAttestationDto } from '../../compliance/age-attestation.dto';

/**
 * firstName/lastName: Apple only sends the user's name in the
 * authorization response on the device's FIRST login with that Apple ID
 * (never in the id_token, never again after) — docs/01_FOUNDATION_AUTH.md
 * §10.2. The client passes them through here on that one occasion; server
 * only persists them when creating a brand-new user (see AuthService).
 */
export class SocialLoginDto {
  @IsIn(['apple', 'google'])
  provider!: 'apple' | 'google';

  @IsString()
  @MaxLength(4096)
  idToken!: string;

  @IsString()
  @MaxLength(256)
  nonce!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  firstName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  lastName?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => DeviceInfoDto)
  deviceInfo?: DeviceInfoDto;

  /** 2026-10-25 (COPPA): "I am 18 or older", for a NEW account only. */
  @IsOptional()
  @ValidateNested()
  @Type(() => AgeAttestationDto)
  ageAttestation?: AgeAttestationDto;
}
