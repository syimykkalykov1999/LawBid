import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  Equals,
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { ModerationCardDto } from '../moderation/admin-moderation.dto';
import {
  DMCA_AGENT_LIMITS,
  INCIDENT_CONTACT_LIMITS,
  LEGAL_TEXT_LIMITS,
  MAX_DMCA_STRIKES,
} from './legal.settings';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;
const emptyToNull = ({ value }: { value: unknown }) =>
  value === '' ? null : value;

/** Content a DMCA notice may point at from the app (the report sheet). */
export const DMCA_TARGET_TYPES = [
  'post',
  'comment',
  'case_comment',
  'message',
] as const;
export type DmcaTargetType = (typeof DMCA_TARGET_TYPES)[number];

/** new → removed | rejected; removed → counter_received → restored. */
export const DMCA_STATUSES = [
  'new',
  'removed',
  'rejected',
  'counter_received',
  'restored',
] as const;
export type DmcaStatus = (typeof DMCA_STATUSES)[number];

export const DMCA_DECISIONS = ['remove', 'reject', 'restore'] as const;
export type DmcaDecision = (typeof DMCA_DECISIONS)[number];

// ---- settings -----------------------------------------------------------

export class LegalTextsDto {
  @ApiProperty({ maxLength: LEGAL_TEXT_LIMITS.caseCreate })
  @Transform(trim)
  @IsString()
  @MaxLength(LEGAL_TEXT_LIMITS.caseCreate)
  caseCreate!: string;

  @ApiProperty({ maxLength: LEGAL_TEXT_LIMITS.attorneyUnverified })
  @Transform(trim)
  @IsString()
  @MaxLength(LEGAL_TEXT_LIMITS.attorneyUnverified)
  attorneyUnverified!: string;

  @ApiProperty({ maxLength: LEGAL_TEXT_LIMITS.supportNote })
  @Transform(trim)
  @IsString()
  @MaxLength(LEGAL_TEXT_LIMITS.supportNote)
  supportNote!: string;

  @ApiProperty({ maxLength: LEGAL_TEXT_LIMITS.partnerDisclosure })
  @Transform(trim)
  @IsString()
  @MaxLength(LEGAL_TEXT_LIMITS.partnerDisclosure)
  partnerDisclosure!: string;

  @ApiProperty({
    maxLength: LEGAL_TEXT_LIMITS.partnerTerms,
    description: 'Plain text (no markdown), numbered rules.',
  })
  @Transform(trim)
  @IsString()
  @MaxLength(LEGAL_TEXT_LIMITS.partnerTerms)
  partnerTerms!: string;
}

export class LegalTextsByLangDto {
  @ApiProperty({ type: LegalTextsDto })
  @ValidateNested()
  @Type(() => LegalTextsDto)
  en!: LegalTextsDto;

  @ApiProperty({ type: LegalTextsDto })
  @ValidateNested()
  @Type(() => LegalTextsDto)
  ru!: LegalTextsDto;
}

export class DmcaAgentDto {
  @ApiProperty({
    maxLength: DMCA_AGENT_LIMITS.name,
    description: 'Empty until registered with the Copyright Office.',
  })
  @Transform(trim)
  @IsString()
  @MaxLength(DMCA_AGENT_LIMITS.name)
  name!: string;

  @ApiProperty({ maxLength: DMCA_AGENT_LIMITS.email })
  @Transform(trim)
  @IsString()
  @MaxLength(DMCA_AGENT_LIMITS.email)
  email!: string;

  @ApiProperty({ maxLength: DMCA_AGENT_LIMITS.address })
  @Transform(trim)
  @IsString()
  @MaxLength(DMCA_AGENT_LIMITS.address)
  address!: string;
}

export class IncidentContactDto {
  @ApiProperty({ maxLength: INCIDENT_CONTACT_LIMITS.email })
  @Transform(trim)
  @IsString()
  @MaxLength(INCIDENT_CONTACT_LIMITS.email)
  email!: string;

  @ApiProperty({ maxLength: INCIDENT_CONTACT_LIMITS.phone })
  @Transform(trim)
  @IsString()
  @MaxLength(INCIDENT_CONTACT_LIMITS.phone)
  phone!: string;
}

/** GET / PUT /admin/legal/settings. */
export class LegalSettingsDto {
  @ApiProperty({ type: DmcaAgentDto })
  @ValidateNested()
  @Type(() => DmcaAgentDto)
  dmcaAgent!: DmcaAgentDto;

  @ApiProperty({ type: IncidentContactDto })
  @ValidateNested()
  @Type(() => IncidentContactDto)
  incidentContact!: IncidentContactDto;

  @ApiProperty({
    type: 'integer',
    minimum: 0,
    maximum: MAX_DMCA_STRIKES,
    description:
      'DMCA removals after which the author is suspended; 0 = never automatically.',
  })
  @IsInt()
  @Min(0)
  @Max(MAX_DMCA_STRIKES)
  dmcaStrikesToSuspend!: number;

  @ApiProperty({ type: LegalTextsByLangDto })
  @ValidateNested()
  @Type(() => LegalTextsByLangDto)
  texts!: LegalTextsByLangDto;
}

/** GET /legal/settings — what the app shows, in the user's language. */
export class LegalPublicDto {
  @ApiProperty({ type: DmcaAgentDto })
  dmcaAgent!: DmcaAgentDto;

  @ApiProperty({ type: LegalTextsDto })
  texts!: LegalTextsDto;

  @ApiProperty({
    description:
      'Current partner rules version (partners re-accept on change).',
  })
  partnerTermsVersion!: string;
}

// ---- DMCA (app) -------------------------------------------------------

export class DmcaNoticeIdParamDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('all')
  id!: string;
}

/** POST /legal/dmca — the §512(c)(3) elements. Either a target or a URL. */
export class CreateDmcaNoticeDto {
  @ApiPropertyOptional({ enum: DMCA_TARGET_TYPES, enumName: 'DmcaTargetType' })
  @IsOptional()
  @IsIn(DMCA_TARGET_TYPES)
  targetType?: DmcaTargetType;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('all')
  targetId?: string;

  @ApiPropertyOptional({
    maxLength: 1000,
    description: 'Where the infringing material is, when no target is given.',
  })
  @IsOptional()
  @Transform(trim)
  @Transform(emptyToNull)
  @IsString()
  @MaxLength(1000)
  infringingUrl?: string | null;

  @ApiProperty({ maxLength: 200 })
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  complainantName!: string;

  @ApiProperty({ maxLength: 254 })
  @Transform(trim)
  @IsEmail()
  @MaxLength(254)
  complainantEmail!: string;

  @ApiProperty({ maxLength: 500, description: 'Postal address.' })
  @Transform(trim)
  @IsString()
  @MinLength(5)
  @MaxLength(500)
  complainantAddress!: string;

  @ApiPropertyOptional({ maxLength: 40 })
  @IsOptional()
  @Transform(trim)
  @Transform(emptyToNull)
  @IsString()
  @MaxLength(40)
  complainantPhone?: string | null;

  @ApiProperty({
    minLength: 20,
    maxLength: 4000,
    description: 'The copyrighted work and how it is infringed.',
  })
  @Transform(trim)
  @IsString()
  @MinLength(20)
  @MaxLength(4000)
  workDescription!: string;

  @ApiProperty({
    description:
      'Good-faith belief that the use is not authorized by the owner, its agent or the law (must be true).',
  })
  @IsBoolean()
  @Equals(true, { message: 'The good-faith statement is required.' })
  goodFaith!: boolean;

  @ApiProperty({
    description:
      'The information is accurate and, under penalty of perjury, the complainant is the owner or authorized to act (must be true).',
  })
  @IsBoolean()
  @Equals(true, { message: 'The accuracy statement is required.' })
  accuracySworn!: boolean;

  @ApiProperty({ minLength: 2, maxLength: 200, description: 'Full name.' })
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  signature!: string;
}

export class DmcaNoticeCreatedDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ enum: DMCA_STATUSES, enumName: 'DmcaStatus' })
  status!: DmcaStatus;
}

/** POST /legal/dmca/:id/counter — the §512(g)(3) counter-notice. */
export class DmcaCounterNoticeDto {
  @ApiProperty({ maxLength: 200 })
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  name!: string;

  @ApiProperty({ maxLength: 500 })
  @Transform(trim)
  @IsString()
  @MinLength(5)
  @MaxLength(500)
  address!: string;

  @ApiPropertyOptional({ maxLength: 40 })
  @IsOptional()
  @Transform(trim)
  @Transform(emptyToNull)
  @IsString()
  @MaxLength(40)
  phone?: string | null;

  @ApiProperty({ maxLength: 254 })
  @Transform(trim)
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @ApiProperty({
    description:
      'Consent to the jurisdiction of the federal district court for the address (must be true).',
  })
  @IsBoolean()
  @Equals(true, { message: 'Consent to jurisdiction is required.' })
  consentJurisdiction!: boolean;

  @ApiProperty({
    description:
      'Sworn under penalty of perjury that the removal was a mistake or misidentification (must be true).',
  })
  @IsBoolean()
  @Equals(true, { message: 'The sworn statement is required.' })
  sworn!: boolean;

  @ApiProperty({ minLength: 2, maxLength: 200 })
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  signature!: string;
}

/** One notice as its submitter or the content author sees it. */
export class DmcaNoticeBriefDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ enum: DMCA_STATUSES, enumName: 'DmcaStatus' })
  status!: DmcaStatus;

  @ApiPropertyOptional({
    enum: DMCA_TARGET_TYPES,
    enumName: 'DmcaTargetType',
    nullable: true,
  })
  targetType!: DmcaTargetType | null;

  @ApiPropertyOptional({ type: String, format: 'uuid', nullable: true })
  targetId!: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  infringingUrl!: string | null;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: string;

  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  decidedAt!: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  decisionNote!: string | null;

  @ApiPropertyOptional({
    type: String,
    format: 'date-time',
    nullable: true,
    description: 'When the author filed a counter-notice.',
  })
  counterSubmittedAt!: string | null;

  @ApiProperty({
    description:
      'The viewer is the content author and may file a counter-notice now.',
  })
  canCounter!: boolean;
}

/** GET /legal/dmca/mine. */
export class DmcaMineDto {
  @ApiProperty({
    type: [DmcaNoticeBriefDto],
    description: 'Notices I submitted, newest first (≤ 50).',
  })
  submitted!: DmcaNoticeBriefDto[];

  @ApiProperty({
    type: [DmcaNoticeBriefDto],
    description: 'Notices against my content, newest first (≤ 50).',
  })
  against!: DmcaNoticeBriefDto[];
}

// ---- DMCA (admin) -----------------------------------------------------

export class AdminDmcaListQueryDto {
  @ApiPropertyOptional({ enum: DMCA_STATUSES, enumName: 'DmcaStatus' })
  @IsOptional()
  @IsIn(DMCA_STATUSES)
  status?: DmcaStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(300)
  cursor?: string;
}

export class AdminDmcaCounterDto {
  @ApiProperty() name!: string;
  @ApiProperty() address!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) phone!: string | null;
  @ApiProperty() email!: string;
  @ApiProperty() consentJurisdiction!: boolean;
  @ApiProperty() sworn!: boolean;
  @ApiProperty() signature!: string;
  @ApiProperty({ type: String, format: 'date-time' }) submittedAt!: string;
}

export class AdminDmcaNoticeRowDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ enum: DMCA_STATUSES, enumName: 'DmcaStatus' })
  status!: DmcaStatus;
  @ApiPropertyOptional({ type: String, format: 'uuid', nullable: true })
  reportId!: string | null;
  @ApiPropertyOptional({
    enum: DMCA_TARGET_TYPES,
    enumName: 'DmcaTargetType',
    nullable: true,
  })
  targetType!: DmcaTargetType | null;
  @ApiPropertyOptional({ type: String, format: 'uuid', nullable: true })
  targetId!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true })
  infringingUrl!: string | null;
  @ApiProperty() complainantName!: string;
  @ApiProperty() complainantEmail!: string;
  @ApiProperty() complainantAddress!: string;
  @ApiPropertyOptional({ type: String, nullable: true })
  complainantPhone!: string | null;
  @ApiProperty() workDescription!: string;
  @ApiProperty() goodFaith!: boolean;
  @ApiProperty() accuracySworn!: boolean;
  @ApiProperty() signature!: string;
  @ApiPropertyOptional({ type: String, format: 'uuid', nullable: true })
  submittedByUserId!: string | null;
  @ApiPropertyOptional({
    type: String,
    format: 'uuid',
    nullable: true,
    description: 'The content author at decision time.',
  })
  authorUserId!: string | null;
  @ApiPropertyOptional({ type: AdminDmcaCounterDto, nullable: true })
  counter!: AdminDmcaCounterDto | null;
  @ApiPropertyOptional({ type: String, format: 'uuid', nullable: true })
  decidedBy!: string | null;
  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  decidedAt!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true })
  decisionNote!: string | null;
  @ApiProperty({ type: String, format: 'date-time' }) createdAt!: string;
  @ApiProperty({ type: String, format: 'date-time' }) updatedAt!: string;
}

export class AdminDmcaNoticeDetailDto {
  @ApiProperty({ type: AdminDmcaNoticeRowDto })
  notice!: AdminDmcaNoticeRowDto;

  @ApiPropertyOptional({
    type: ModerationCardDto,
    nullable: true,
    description:
      'The moderation card of the target; null for a URL-only notice or a vanished object.',
  })
  target!: ModerationCardDto | null;

  @ApiPropertyOptional({
    type: 'integer',
    nullable: true,
    description:
      "The content author's DMCA strikes so far (null without an author).",
  })
  authorStrikes!: number | null;

  @ApiProperty({
    type: 'integer',
    description: 'Strikes after which the author is suspended (0 = never).',
  })
  strikesToSuspend!: number;
}

/** POST /admin/legal/dmca/:id/decide. */
export class DmcaDecideDto {
  @ApiProperty({ enum: DMCA_DECISIONS, enumName: 'DmcaDecision' })
  @IsIn(DMCA_DECISIONS)
  action!: DmcaDecision;

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 1000 })
  @IsOptional()
  @Transform(trim)
  @Transform(emptyToNull)
  @IsString()
  @MaxLength(1000)
  note?: string | null;
}
