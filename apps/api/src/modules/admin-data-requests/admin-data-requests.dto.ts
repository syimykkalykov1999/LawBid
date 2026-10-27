import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  MaxLength,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export const DATA_REQUEST_TYPES = [
  'subpoena',
  'court_order',
  'search_warrant',
  'preservation',
  'emergency',
  'civil',
  'other',
] as const;
export const DATA_REQUEST_STATUSES = [
  'received',
  'in_progress',
  'fulfilled',
  'rejected',
] as const;
/** What a package may contain — chosen per request, strictly within its scope (§5.4). */
export const PACKAGE_SECTIONS = [
  'profile',
  'contacts',
  'cases',
  'bids',
  'contact_disclosures',
  'messages',
] as const;
export type PackageSection = (typeof PACKAGE_SECTIONS)[number];

export class CreateDataRequestDto {
  @ApiProperty({ enum: DATA_REQUEST_TYPES })
  @IsIn(DATA_REQUEST_TYPES)
  requestType!: (typeof DATA_REQUEST_TYPES)[number];

  @ApiProperty({ maxLength: 120 })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  referenceNumber!: string;

  @ApiProperty({ maxLength: 200, description: 'Issuing agency / court.' })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  agency!: string;

  @ApiProperty({ format: 'date-time' })
  @IsISO8601()
  receivedAt!: string;

  @ApiProperty({
    maxLength: 2000,
    description: 'The scope as written in the request.',
  })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  scope!: string;

  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @ApiPropertyOptional({
    maxLength: 300,
    description: 'The law the request rests on, e.g. "18 U.S.C. 2703(d)".',
  })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(300)
  legalBasis?: string;

  @ApiPropertyOptional({ description: 'Two-letter country of the authority.' })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @IsString()
  @Length(2, 2)
  country?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'The person it concerns.',
  })
  @IsOptional()
  @IsUUID('all')
  subjectUserId?: string;

  @ApiPropertyOptional({ format: 'date-time', description: 'Answer due.' })
  @IsOptional()
  @IsISO8601()
  dueAt?: string;

  @ApiPropertyOptional({
    description: 'Gag / non-disclosure order: do not tell the user.',
  })
  @IsOptional()
  @IsBoolean()
  doNotNotify?: boolean;

  @ApiPropertyOptional({
    format: 'date-time',
    description: 'The gag order ends (reminder to notify the user).',
  })
  @IsOptional()
  @IsISO8601()
  nondisclosureUntil?: string;
}

export class UpdateDataRequestIntakeDto {
  @ApiPropertyOptional({ maxLength: 300 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(300)
  legalBasis?: string;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsISO8601()
  dueAt?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('all')
  subjectUserId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  doNotNotify?: boolean;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsISO8601()
  nondisclosureUntil?: string;
}

export class UpdateDataRequestStatusDto {
  @ApiProperty({ enum: DATA_REQUEST_STATUSES })
  @IsIn(DATA_REQUEST_STATUSES)
  status!: (typeof DATA_REQUEST_STATUSES)[number];

  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

export class DataRequestIdParamDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('all')
  id!: string;
}

export class PreparePackageDto {
  @ApiProperty({
    format: 'uuid',
    description: 'The user the request concerns.',
  })
  @IsUUID('all')
  userId!: string;

  @ApiProperty({
    enum: PACKAGE_SECTIONS,
    isArray: true,
    description: 'Only what the request covers.',
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(PACKAGE_SECTIONS.length)
  @IsIn(PACKAGE_SECTIONS, { each: true })
  sections!: PackageSection[];
}

export class DataAccessLogEntryDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid' }) adminId!: string;
  @ApiProperty() entityType!: string;
  @ApiProperty({ format: 'uuid' }) entityId!: string;
  @ApiProperty({ format: 'date-time' }) accessedAt!: string;
}

export class DataRequestDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ enum: DATA_REQUEST_TYPES }) requestType!: string;
  @ApiProperty() referenceNumber!: string;
  @ApiProperty() agency!: string;
  @ApiProperty({ format: 'date-time' }) receivedAt!: string;
  @ApiProperty() scope!: string;
  @ApiProperty({ enum: DATA_REQUEST_STATUSES }) status!: string;
  @ApiProperty({ format: 'uuid' }) handledBy!: string;
  @ApiProperty({ type: String, nullable: true }) notes!: string | null;
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  closedAt!: string | null;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
  @ApiProperty({ type: 'integer' }) accessCount!: number;
  @ApiProperty({ type: String, nullable: true }) legalBasis!: string | null;
  @ApiProperty({ type: String, nullable: true }) country!: string | null;
  @ApiProperty({ type: String, nullable: true }) subjectUserId!: string | null;
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  dueAt!: string | null;
  @ApiProperty() doNotNotify!: boolean;
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  nondisclosureUntil!: string | null;
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  userNotifiedAt!: string | null;
}

export class DataRequestCardDto extends DataRequestDto {
  @ApiProperty({ type: [DataAccessLogEntryDto] })
  accessLog!: DataAccessLogEntryDto[];
}

export class DataPackageDto {
  @ApiProperty({ format: 'uuid' }) requestId!: string;
  @ApiProperty() referenceNumber!: string;
  @ApiProperty({ format: 'date-time' }) preparedAt!: string;
  @ApiProperty({ enum: PACKAGE_SECTIONS, isArray: true }) sections!: string[];
  @ApiProperty({ type: Object, description: 'One key per section.' })
  data!: Record<string, unknown>;
  @ApiProperty({
    type: 'integer',
    description: 'data_access_log rows written.',
  })
  loggedEntities!: number;
}

export interface DataRequestsPage {
  items: DataRequestDto[];
  nextCursor: string | null;
}
