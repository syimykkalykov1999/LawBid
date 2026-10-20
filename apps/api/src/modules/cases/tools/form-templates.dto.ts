import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  Min,
} from 'class-validator';

const MAP = {
  type: 'object',
  additionalProperties: { type: 'string' },
} as const;

export class FormFieldDto {
  @ApiProperty({ example: 'client_name' }) key!: string;
  @ApiProperty({ enum: ['text', 'textarea', 'date', 'number'] })
  type!: 'text' | 'textarea' | 'date' | 'number';
  @ApiProperty() required!: boolean;
  @ApiProperty(MAP) label!: Record<string, string>;
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    enum: ['today', 'attorney_name', 'client_name', 'case_title'],
    description: 'Filled in by the app from the case.',
  })
  prefill?: 'today' | 'attorney_name' | 'client_name' | 'case_title' | null;
}

export class FormTemplateDto {
  @ApiProperty() id!: string;
  @ApiProperty() slug!: string;
  @ApiProperty(MAP) title!: Record<string, string>;
  @ApiProperty(MAP) description!: Record<string, string>;
  @ApiProperty({ type: [String], description: 'Languages the text exists in.' })
  languages!: string[];
  @ApiProperty({ type: [FormFieldDto] }) fields!: FormFieldDto[];
}

export class CaseFormTemplatesDto {
  @ApiProperty({
    ...MAP,
    description:
      'Values the app fills in: today, attorney_name, client_name, case_title.',
  })
  prefill!: Record<string, string>;
  @ApiProperty({ type: [FormTemplateDto] }) templates!: FormTemplateDto[];
}

export class BuildDocumentDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('all')
  templateId!: string;

  @ApiProperty({
    example: 'en',
    description: 'A language the template has text in.',
  })
  @IsString()
  @Matches(/^[a-z]{2,3}(-[a-z]{2,4})?$/i)
  language!: string;

  @ApiProperty({ ...MAP, description: 'The answers: field key → text.' })
  @IsObject()
  values!: Record<string, string>;
}

export class BuiltDocumentDto {
  @ApiProperty({ format: 'uuid' }) fileId!: string;
  @ApiProperty() title!: string;
  @ApiProperty({ type: String, nullable: true }) url!: string | null;
}

export class AdminFormTemplateDto {
  @ApiProperty() id!: string;
  @ApiProperty() slug!: string;
  @ApiProperty(MAP) title!: Record<string, string>;
  @ApiProperty(MAP) description!: Record<string, string>;
  @ApiProperty({
    type: 'object',
    additionalProperties: { type: 'string' },
    description: 'Language → text with {{key}} places.',
  })
  body!: Record<string, string>;
  @ApiProperty({ type: [FormFieldDto] }) fields!: FormFieldDto[];
  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  practiceAreaId!: string | null;
  @ApiProperty() position!: number;
  @ApiProperty() published!: boolean;
  @ApiProperty({ format: 'date-time' }) updatedAt!: string;
}

export class CreateFormTemplateDto {
  @ApiProperty({ example: 'power-of-attorney' })
  @IsString()
  @Matches(/^[a-z][a-z0-9-]{1,63}$/)
  slug!: string;

  @ApiProperty(MAP)
  @IsObject()
  title!: Record<string, string>;

  @ApiPropertyOptional(MAP)
  @IsOptional()
  @IsObject()
  description?: Record<string, string>;

  @ApiProperty(MAP)
  @IsObject()
  body!: Record<string, string>;

  @ApiProperty({ type: [FormFieldDto] })
  @IsArray()
  @ArrayMaxSize(40)
  fields!: FormFieldDto[];

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('all')
  practiceAreaId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10_000)
  position?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  published?: boolean;
}

export class UpdateFormTemplateDto {
  @ApiPropertyOptional(MAP)
  @IsOptional()
  @IsObject()
  title?: Record<string, string>;

  @ApiPropertyOptional(MAP)
  @IsOptional()
  @IsObject()
  description?: Record<string, string>;

  @ApiPropertyOptional(MAP)
  @IsOptional()
  @IsObject()
  body?: Record<string, string>;

  @ApiPropertyOptional({ type: [FormFieldDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(40)
  fields?: FormFieldDto[];

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @IsOptional()
  practiceAreaId?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10_000)
  position?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  published?: boolean;
}

export class FormTemplateIdParamDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('all')
  id!: string;
}
