import { Type } from 'class-transformer';
import { IsOptional, Matches, ValidateNested } from 'class-validator';
import { DeviceInfoDto } from './device-info.dto';

/** POST /auth/otp/verify-link — email magic link redemption (docs/01
 * §10.2 E). The token comes from the emailed link; the verifier never left
 * the device that requested the code. */
export class OtpVerifyLinkDto {
  @Matches(/^[A-Za-z0-9_-]{43}$/)
  token!: string;

  @Matches(/^[A-Za-z0-9_-]{43,128}$/)
  verifier!: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => DeviceInfoDto)
  deviceInfo?: DeviceInfoDto;
}
