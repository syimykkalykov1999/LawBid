import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { MaxTextChars } from '../../common/app-settings/max-text-chars.decorator';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export const QUESTION_FILTERS = [
  'all',
  'unanswered',
  'solved',
  'mine',
] as const;
export type QuestionFilter = (typeof QUESTION_FILTERS)[number];

export class AskQuestionDto {
  @ApiProperty({ minLength: 5, maxLength: 160 })
  @Transform(trim)
  @IsString()
  @Length(5, 160)
  @MaxTextChars('limits.question_title_chars')
  title!: string;

  @ApiProperty({ minLength: 10, maxLength: 3000 })
  @Transform(trim)
  @IsString()
  @Length(10, 3000)
  @MaxTextChars('limits.question_body_chars')
  body!: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'A practice area or its category',
  })
  @IsOptional()
  @IsUUID('all')
  practiceAreaId?: string;

  @ApiPropertyOptional({ example: 'NY' })
  @IsOptional()
  @Matches(/^[A-Z]{2}$/)
  stateCode?: string;

  @ApiPropertyOptional({
    default: false,
    description: 'Others see «Anonymous».',
  })
  @IsOptional()
  @IsBoolean()
  anonymous?: boolean;
}

export class QuestionsQueryDto {
  @ApiPropertyOptional({ maxLength: 80 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(80)
  q?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('all')
  practiceAreaId?: string;

  @ApiPropertyOptional({ example: 'NY' })
  @IsOptional()
  @Matches(/^[A-Z]{2}$/)
  stateCode?: string;

  @ApiPropertyOptional({
    enum: QUESTION_FILTERS,
    enumName: 'QuestionFilter',
    default: 'all',
  })
  @IsOptional()
  @IsIn(QUESTION_FILTERS)
  filter?: QuestionFilter;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  cursor?: string;

  @ApiPropertyOptional({
    type: 'integer',
    minimum: 1,
    maximum: 50,
    default: 20,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}

export class QuestionIdParamDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('all')
  id!: string;
}

export class AnswerParamDto extends QuestionIdParamDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('all')
  answerId!: string;
}

export class AnswerBodyDto {
  @ApiProperty({ minLength: 10, maxLength: 4000 })
  @Transform(trim)
  @IsString()
  @Length(10, 4000)
  @MaxTextChars('limits.answer_chars')
  body!: string;
}

export class BestAnswerDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('all')
  answerId!: string;
}

export class QaPracticeAreaDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() code!: string;
  @ApiProperty() i18nKey!: string;
  @ApiProperty() nameEn!: string;
}

export class QaStateDto {
  @ApiProperty() code!: string;
  @ApiProperty() name!: string;
}

export class QaPersonDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() displayName!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) username!:
    string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) avatarUrl!:
    string | null;
}

export class AnswerDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid' }) questionId!: string;
  @ApiProperty({ type: QaPersonDto }) attorney!: QaPersonDto;
  @ApiProperty() body!: string;
  @ApiProperty({ type: 'integer' }) likeCount!: number;
  @ApiProperty() likedByMe!: boolean;
  @ApiProperty() isBest!: boolean;
  @ApiProperty() isMine!: boolean;
  @ApiProperty() createdAt!: string;
  @ApiProperty() updatedAt!: string;
}

export class QuestionDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() title!: string;
  @ApiProperty() body!: string;
  @ApiPropertyOptional({ type: QaPracticeAreaDto, nullable: true })
  practiceArea!: QaPracticeAreaDto | null;
  @ApiPropertyOptional({ type: QaStateDto, nullable: true })
  state!: QaStateDto | null;
  @ApiProperty() isAnonymous!: boolean;
  @ApiPropertyOptional({
    type: QaPersonDto,
    nullable: true,
    description:
      'Null when the question is anonymous (the author sees themselves).',
  })
  author!: QaPersonDto | null;
  @ApiProperty() isMine!: boolean;
  @ApiProperty({ type: 'integer' }) answerCount!: number;
  @ApiPropertyOptional({ type: String, nullable: true, format: 'uuid' })
  bestAnswerId!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true, format: 'uuid' })
  myAnswerId!: string | null;
  @ApiProperty({
    description: 'The viewer is a verified attorney who may answer now.',
  })
  canAnswer!: boolean;
  @ApiProperty() createdAt!: string;
}

export class QuestionDetailDto extends QuestionDto {
  @ApiProperty({ type: [AnswerDto] }) answers!: AnswerDto[];
}

export interface QuestionPage {
  items: QuestionDto[];
  nextCursor: string | null;
}
