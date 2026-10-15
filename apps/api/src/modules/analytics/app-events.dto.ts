import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsOptional,
  IsString,
  Matches,
  ValidateNested,
} from 'class-validator';

export class AppEventInDto {
  @ApiProperty({ example: 'screen_view' })
  @IsString()
  @Matches(/^[a-z0-9_.]{1,40}$/)
  name!: string;

  @ApiPropertyOptional({ example: '/cases/:id', description: 'Screen route.' })
  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z0-9_:/.-]{0,80}$/)
  screen?: string;
}

/** The phone sends events in batches (up to 50). */
export class AppEventBatchDto {
  @ApiProperty({ type: AppEventInDto, isArray: true })
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => AppEventInDto)
  events!: AppEventInDto[];
}

export class AppEventCountDto {
  @ApiProperty()
  name!: string;
  @ApiProperty({ description: 'Empty when the event has no screen.' })
  screen!: string;
  @ApiProperty()
  count!: number;
}

export class AnalyticsEventsDto {
  @ApiProperty({ description: 'The app sends events (flag app_events).' })
  enabled!: boolean;
  @ApiProperty({ type: AppEventCountDto, isArray: true })
  topEvents!: AppEventCountDto[];
  @ApiProperty({ type: AppEventCountDto, isArray: true })
  topScreens!: AppEventCountDto[];
}
