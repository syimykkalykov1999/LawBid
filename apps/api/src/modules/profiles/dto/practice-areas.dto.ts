import { ApiProperty } from '@nestjs/swagger';
import { ArrayMaxSize, ArrayUnique, IsArray, IsUUID } from 'class-validator';

/** Upper bound on one attorney's selection: well above the number of
 * leaves in the docs/02 §3.2 tree, only there so a crafted request can't
 * send an unbounded array. */
export const MAX_PRACTICE_AREAS = 500;

/** PUT /attorneys/me/practice-areas (docs/03 §3.2): the FULL new set of
 * leaf ids — it replaces the stored set. An empty list clears it. */
export class ReplacePracticeAreasDto {
  @IsArray()
  @ArrayMaxSize(MAX_PRACTICE_AREAS)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  practiceAreaIds!: string[];
}

/** A specialization (leaf of the docs/02 §3.2 tree). */
export class PracticeAreaLeafDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'traffic_tickets.speeding' })
  code!: string;

  @ApiProperty({
    example: 'practice.traffic_tickets.speeding',
    description: 'Translation key of the display name.',
  })
  i18nKey!: string;

  @ApiProperty({ description: 'English fallback name.' })
  nameEn!: string;
}

/** GET /practice-areas item: a category with its active specializations. */
export class PracticeAreaCategoryDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'traffic_tickets' })
  code!: string;

  @ApiProperty({ example: 'practice.traffic_tickets' })
  i18nKey!: string;

  @ApiProperty()
  nameEn!: string;

  @ApiProperty({ type: [PracticeAreaLeafDto] })
  children!: PracticeAreaLeafDto[];
}

/** A chosen specialization with its category (own list / public
 * profile chips, grouped by category in the app, §3.2). */
export class SelectedPracticeAreaDto extends PracticeAreaLeafDto {
  @ApiProperty({ format: 'uuid' })
  categoryId!: string;

  @ApiProperty()
  categoryCode!: string;

  @ApiProperty()
  categoryI18nKey!: string;
}
