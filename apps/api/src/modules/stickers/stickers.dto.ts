import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

/** Owner 2026-10-01 — Telegram-style stickers. */
export class StickerDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  packId!: string;

  @ApiProperty({ description: 'The emoji this sticker stands for.' })
  emoji!: string;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Null while the image is being checked.',
  })
  url!: string | null;
}

export class StickerPackDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  title!: string;

  @ApiProperty({ description: 'Share name (lawbid.app/stickers/<shortName>).' })
  shortName!: string;

  @ApiProperty()
  isOfficial!: boolean;

  @ApiProperty({
    description: 'The viewer made this pack (can add / remove stickers).',
  })
  isMine!: boolean;

  @ApiProperty()
  installed!: boolean;

  @ApiProperty({ type: 'integer' })
  stickerCount!: number;

  @ApiProperty({ type: 'integer' })
  installCount!: number;

  @ApiProperty({ type: StickerDto, isArray: true })
  stickers!: StickerDto[];
}

/** The picker: recently used, then my packs in my order. */
export class StickerLibraryDto {
  @ApiProperty({ type: StickerDto, isArray: true })
  recent!: StickerDto[];

  @ApiProperty({ type: StickerPackDto, isArray: true })
  packs!: StickerPackDto[];
}

export class CreateStickerPackDto {
  @ApiProperty({ minLength: 1, maxLength: 64 })
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  title!: string;
}

export class UpdateStickerPackDto extends CreateStickerPackDto {}

export class AddStickerDto {
  @ApiProperty({
    format: 'uuid',
    description: 'A clean `sticker` file of the caller.',
  })
  @IsUUID('all')
  fileId!: string;

  @ApiPropertyOptional({ maxLength: 16, default: '🙂' })
  @IsOptional()
  @IsString()
  @MaxLength(16)
  emoji?: string;
}

export class ReorderStickerPacksDto {
  @ApiProperty({ type: String, isArray: true, format: 'uuid' })
  @IsArray()
  @ArrayMaxSize(500)
  @IsUUID('all', { each: true })
  packIds!: string[];
}

export class StickerPackRefParamDto {
  @ApiProperty({ description: 'Pack id or short name.' })
  @IsString()
  @Matches(/^[A-Za-z0-9_-]{1,40}$/)
  ref!: string;
}

export class StickerIdParamDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('all')
  id!: string;
}
