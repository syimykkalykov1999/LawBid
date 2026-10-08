import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsIn,
  IsInt,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  ALL_UPLOAD_FORMATS,
  UPLOAD_PLACES,
  type CountMode,
  type UploadFormat,
  type UploadPlace,
} from '../files/upload-limits';

/** Owner 2026-10-07 (bug 17): Система → «Загрузки и файлы». */
export class UploadCeilingDto {
  @ApiProperty({ description: 'Most photos / files an admin may allow.' })
  count!: number;
  @ApiProperty({ description: 'Most MB per file an admin may allow.' })
  fileMb!: number;
  @ApiProperty({ description: 'Most MB of documents together.' })
  totalMb!: number;
}

export class UploadPlaceLimitsDto {
  @ApiProperty({ enum: UPLOAD_PLACES, enumName: 'UploadPlace' })
  @IsIn(UPLOAD_PLACES)
  place!: UploadPlace;

  @ApiProperty({ minimum: 0, maximum: 30 })
  @IsInt()
  @Min(0)
  @Max(30)
  maxPhotos!: number;

  @ApiProperty({ minimum: 0, maximum: 30 })
  @IsInt()
  @Min(0)
  @Max(30)
  maxFiles!: number;

  @ApiProperty({ minimum: 0, maximum: 100 })
  @IsInt()
  @Min(0)
  @Max(100)
  fileMb!: number;

  @ApiProperty({ minimum: 0, maximum: 200 })
  @IsInt()
  @Min(0)
  @Max(200)
  totalMb!: number;

  @ApiProperty({
    enum: ALL_UPLOAD_FORMATS,
    enumName: 'UploadFormat',
    isArray: true,
  })
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(ALL_UPLOAD_FORMATS.length)
  @IsIn(ALL_UPLOAD_FORMATS, { each: true })
  formats!: UploadFormat[];
}

export class UploadPlaceDto {
  @ApiProperty({ type: UploadPlaceLimitsDto })
  limits!: UploadPlaceLimitsDto;

  @ApiProperty({
    enum: ['split', 'combined', 'photos', 'none'],
    enumName: 'UploadCountMode',
  })
  count!: CountMode;

  @ApiProperty({
    enum: ALL_UPLOAD_FORMATS,
    enumName: 'UploadFormat',
    isArray: true,
    description: 'Formats that may be turned on here (all safe).',
  })
  safeFormats!: UploadFormat[];

  @ApiProperty({ type: UploadCeilingDto })
  ceiling!: UploadCeilingDto;

  @ApiProperty({ type: UploadPlaceLimitsDto })
  defaults!: UploadPlaceLimitsDto;
}

export class UploadSettingsDto {
  @ApiProperty({ type: [UploadPlaceDto] })
  places!: UploadPlaceDto[];
}

export class UpdateUploadSettingsDto {
  @ApiProperty({ type: [UploadPlaceLimitsDto] })
  @IsArray()
  @ArrayMaxSize(UPLOAD_PLACES.length)
  @ValidateNested({ each: true })
  @Type(() => UploadPlaceLimitsDto)
  places!: UploadPlaceLimitsDto[];
}
