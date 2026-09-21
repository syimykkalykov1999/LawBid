import { IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * docs/01_FOUNDATION_AUTH.md §10.4 sessions table columns
 * (device_id/device_name/platform/app_version). Every field is optional
 * at the DTO level — a client that omits deviceInfo entirely still gets a
 * session (with those columns null), it just loses the "isNewDevice"
 * signal and the grace-window benign-retry match in SessionService.
 */
export class DeviceInfoDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  deviceId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  deviceName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  platform?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  appVersion?: string;
}
