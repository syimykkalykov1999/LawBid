import {
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { DeviceInfoDto } from './device-info.dto';

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
  idToken!: string;

  @IsString()
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
}
