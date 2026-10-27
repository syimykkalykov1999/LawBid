import {
  IsIn,
  IsOptional,
  IsString,
  Matches,
  ValidateNested,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { IsIdentifierForChannel } from './validators';
import { DeviceInfoDto } from './device-info.dto';
import { AgeAttestationDto } from '../../compliance/age-attestation.dto';

export class OtpVerifyDto {
  @IsIn(['phone', 'email'])
  channel!: 'phone' | 'email';

  @IsString()
  @IsIdentifierForChannel('channel')
  @MaxLength(254)
  identifier!: string;

  @IsString()
  @Matches(/^\d{6}$/, { message: 'code must be exactly 6 digits' })
  code!: string;

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
