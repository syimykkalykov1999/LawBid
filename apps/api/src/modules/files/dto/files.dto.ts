import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { FilePurpose, ScanStatus } from '@prisma/client';
import {
  IsEnum,
  IsISO8601,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { ALL_FILE_MIMES } from '../files.policy';

const FILE_MIME_PATTERN = new RegExp(
  `^(${ALL_FILE_MIMES.map((m) => m.replace(/[/.]/g, '\\$&')).join('|')})$`,
);

/** POST /files/presign (docs/03 §2.2). The declared values are enforced
 * by the S3 upload policy (size, Content-Type) and re-checked on confirm
 * against the stored bytes (size, SHA-256, magic-bytes type). */
export class PresignFileDto {
  @ApiProperty({ enum: FilePurpose, enumName: 'FilePurpose' })
  @IsEnum(FilePurpose)
  purpose!: FilePurpose;

  // A plain string in the contract: MIME values are not valid Dart enum
  // identifiers (the generator would emit `undefined0`, ...).
  @ApiProperty({
    type: String,
    example: 'image/jpeg',
    description: `One of: ${ALL_FILE_MIMES.join(', ')} (allowed set depends on purpose).`,
  })
  @Matches(FILE_MIME_PATTERN, {
    message: 'mime must be one of the supported file types',
  })
  mime!: string;

  @ApiProperty({ minimum: 1, description: 'Exact size of the file in bytes.' })
  @IsInt()
  @Min(1)
  @Max(1024 * 1024 * 1024)
  sizeBytes!: number;

  @ApiProperty({
    description: 'Lowercase hex SHA-256 of the file.',
    pattern: '^[0-9a-f]{64}$',
  })
  @Matches(/^[0-9a-f]{64}$/)
  sha256!: string;
}

export class PresignedUploadDto {
  @ApiProperty({
    description:
      'POST target (multipart/form-data): send every field, then the file as the last field named "file".',
  })
  url!: string;

  @ApiProperty({
    type: 'object',
    additionalProperties: { type: 'string' },
    description:
      'Form fields signed by the server (key, policy, signature, Content-Type).',
  })
  fields!: Record<string, string>;
}

export class PresignedFileDto {
  @ApiProperty({
    format: 'uuid',
    description: 'Id to pass to POST /files/{id}/confirm.',
  })
  fileId!: string;

  @ApiProperty({ type: PresignedUploadDto })
  upload!: PresignedUploadDto;

  @ApiProperty({
    format: 'date-time',
    description: 'The upload link expires at (5 minutes).',
  })
  expiresAt!: string;
}

export class FileDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ enum: FilePurpose, enumName: 'FilePurpose' })
  purpose!: FilePurpose;

  @ApiProperty({
    description:
      'Real type (magic bytes); HEIC becomes image/jpeg once processed.',
  })
  mime!: string;

  @ApiProperty()
  sizeBytes!: number;

  @ApiProperty({ type: Number, nullable: true })
  width!: number | null;

  @ApiProperty({ type: Number, nullable: true })
  height!: number | null;

  @ApiProperty({
    enum: ScanStatus,
    enumName: 'ScanStatus',
    description:
      'Only `clean` files can be attached (avatar, verification, posts).',
  })
  scanStatus!: ScanStatus;

  @ApiProperty({
    type: String,
    nullable: true,
    description:
      'Short-lived signed link — only for clean avatar/post images. Verification files are never served to the app (docs/03 §2.2).',
  })
  url!: string | null;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;
}

/** One entry of GET /files/:id/views — somebody other than the owner was
 * given a link to the file (security & legal pass 2026-10-24). */
export class FileViewDto {
  @ApiProperty({
    format: 'uuid',
    description: 'Journal row id (the client merges and de-duplicates by it).',
  })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  viewerUserId!: string;

  @ApiProperty({ type: String, nullable: true })
  viewerName!: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    description:
      'Signed link to the viewer avatar, when they have a clean one.',
  })
  viewerAvatarUrl!: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'client | attorney | assistant (the viewer account role).',
  })
  viewerRole!: string | null;

  @ApiProperty({ format: 'date-time' })
  viewedAt!: string;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Device name of the viewer session, when known.',
  })
  device!: string | null;

  @ApiProperty({ type: String, nullable: true })
  platform!: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    description:
      'The viewer address with its host part hidden (203.0.113.x / 2001:db8:1::x); the full address never leaves the server.',
  })
  ip!: string | null;
}

/** GET /files/:id/views query (cursor-paged, newest first). */
export class FileViewsQueryDto {
  @ApiPropertyOptional({ description: 'meta.nextCursor of the previous page.' })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  cursor?: string;

  @ApiPropertyOptional({
    type: 'integer',
    minimum: 1,
    maximum: 50,
    default: 20,
    description: 'Page size (a small page keeps the phone sync cheap).',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;

  @ApiPropertyOptional({
    format: 'date-time',
    description:
      'Only views logged after this time (ISO), newest first and paged like the full list; meta.syncedAt = the newest viewedAt of the answer (or `since`). The journal is append-only, so there is no SYNC_TOO_OLD.',
  })
  @IsOptional()
  @IsISO8601()
  since?: string;
}
