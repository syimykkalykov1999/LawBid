import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsOptional, IsString, Length, ValidateNested } from 'class-validator';
import { DeviceInfoDto } from './device-info.dto';

/** Owner 2026-10-04: an assistant signs in with the attorney's code. */
export class AssistantCodeLoginDto {
  @ApiProperty({
    example: 'K7QM-4XRT-92HD',
    description: 'The one-time code from the attorney (dashes optional).',
  })
  @IsString()
  @Length(8, 32)
  code!: string;

  @ApiPropertyOptional({ type: DeviceInfoDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => DeviceInfoDto)
  deviceInfo?: DeviceInfoDto;
}
