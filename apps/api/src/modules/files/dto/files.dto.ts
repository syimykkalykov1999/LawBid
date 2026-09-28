import { ApiProperty } from '@nestjs/swagger';
import { FilePurpose, ScanStatus } from '@prisma/client';
import { IsEnum, IsInt, Matches, Max, Min } from 'class-validator';
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
