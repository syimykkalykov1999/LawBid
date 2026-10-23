import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsString, Length } from 'class-validator';

export class LinkPreviewQueryDto {
  @ApiProperty({
    description: 'The link as pasted (https://…).',
    maxLength: 2048,
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @Length(1, 2048)
  url!: string;
}

/** Fields are null when the site has none, the link is blocked, the
 * previews are switched off, or the page could not be read. */
export class LinkPreviewDto {
  @ApiProperty()
  url!: string;

  @ApiProperty({ type: String, nullable: true })
  title!: string | null;

  @ApiProperty({ type: String, nullable: true })
  description!: string | null;

  @ApiProperty({ type: String, nullable: true })
  imageUrl!: string | null;

  @ApiProperty({ type: String, nullable: true })
  siteName!: string | null;
}
