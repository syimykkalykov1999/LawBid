import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class CrashReportInDto {
  @ApiProperty({ description: 'The error as text (type and message).' })
  @IsString()
  @Length(1, 2000)
  message!: string;

  @ApiProperty()
  @IsString()
  @MaxLength(20000)
  stack!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  fatal?: boolean;

  @ApiProperty({ example: 'android' })
  @IsString()
  @Length(1, 12)
  platform!: string;

  @ApiProperty({ example: '1.0.3' })
  @IsString()
  @Length(1, 30)
  appVersion!: string;

  @ApiProperty({ example: '42' })
  @IsString()
  @Length(1, 20)
  build!: string;

  @ApiProperty({ example: 'prod' })
  @IsString()
  @Length(1, 12)
  flavor!: string;

  @ApiProperty()
  @IsString()
  @Length(1, 40)
  osVersion!: string;

  @ApiProperty()
  @IsString()
  @Length(1, 60)
  deviceModel!: string;

  @ApiPropertyOptional({ description: 'The screen the person was on.' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  route?: string;
}

export class CrashBatchDto {
  @ApiProperty({ type: CrashReportInDto, isArray: true })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => CrashReportInDto)
  reports!: CrashReportInDto[];
}

export class CrashGroupDto {
  @ApiProperty()
  fingerprint!: string;
  @ApiProperty()
  message!: string;
  @ApiProperty()
  count!: number;
  @ApiProperty({ description: 'Different phones (people) it hit.' })
  devices!: number;
  @ApiProperty({ description: 'Of them the app closed.' })
  fatal!: number;
  @ApiProperty({ type: String, isArray: true })
  versions!: string[];
  @ApiProperty()
  firstAt!: string;
  @ApiProperty()
  lastAt!: string;
}

export class CrashCountDto {
  @ApiProperty()
  value!: string;
  @ApiProperty()
  count!: number;
}

export class CrashInstanceDto {
  @ApiProperty()
  at!: string;
  @ApiProperty()
  appVersion!: string;
  @ApiProperty()
  build!: string;
  @ApiProperty()
  flavor!: string;
  @ApiProperty()
  platform!: string;
  @ApiProperty()
  osVersion!: string;
  @ApiProperty()
  deviceModel!: string;
  @ApiPropertyOptional({ nullable: true })
  route!: string | null;
  @ApiProperty()
  fatal!: boolean;
}

export class CrashDetailDto {
  @ApiProperty()
  fingerprint!: string;
  @ApiProperty()
  message!: string;
  @ApiProperty()
  stack!: string;
  @ApiProperty({ type: CrashCountDto, isArray: true })
  versions!: CrashCountDto[];
  @ApiProperty({ type: CrashCountDto, isArray: true })
  systems!: CrashCountDto[];
  @ApiProperty({ type: CrashCountDto, isArray: true })
  devices!: CrashCountDto[];
  @ApiProperty({ type: CrashInstanceDto, isArray: true })
  latest!: CrashInstanceDto[];
}

export class CrashDaysQueryDto {
  @ApiPropertyOptional({ default: 7 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(30)
  days?: number;
}

export class CrashFingerprintParamDto {
  @ApiProperty()
  @IsString()
  @Matches(/^[0-9a-f]{40}$/)
  fingerprint!: string;
}
