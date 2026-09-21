import { IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { DeviceInfoDto } from './device-info.dto';

/**
 * docs/01_FOUNDATION_AUTH.md §10.5 lists the request body as just
 * `{refreshToken}`. Engineering judgment (docs/CHANGELOG.md, stage 1.4,
 * ask-item A6): deviceInfo is accepted here too, optionally, because
 * SessionService's benign-retry grace window (REFRESH_ROTATION_GRACE_
 * SECONDS) matches on device_id — without it, a legitimate same-device
 * retry after a timeout can't be distinguished from reuse and the whole
 * chain gets revoked. Omitting deviceInfo still works, it just loses that
 * protection for that client.
 */
export class RefreshTokenDto {
  @IsString()
  refreshToken!: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => DeviceInfoDto)
  deviceInfo?: DeviceInfoDto;
}
