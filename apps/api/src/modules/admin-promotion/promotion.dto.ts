import { ApiProperty } from '@nestjs/swagger';
import { Matches } from 'class-validator';

export class PromotionKeyParamDto {
  @ApiProperty({ pattern: '^seo\\.[a-z0-9_.]{2,60}$' })
  @Matches(/^seo\.[a-z0-9_.]{2,60}$/)
  key!: string;
}

export class PromotionSettingDto {
  @ApiProperty({ description: 'app_config key, always `seo.*`.' })
  key!: string;
  @ApiProperty({ enum: ['boolean', 'integer', 'string'] })
  type!: 'boolean' | 'integer' | 'string';
  @ApiProperty({
    type: Object,
    description: 'Stored value, or the default while nothing is stored.',
  })
  value!: unknown;
  @ApiProperty({
    description:
      'False = the admin never decided: the repository variable of the same name still applies.',
  })
  stored!: boolean;
  @ApiProperty({ type: Object }) defaultValue!: unknown;
}

export class PromotionChecklistItemDto {
  @ApiProperty() id!: string;
  @ApiProperty({ description: 'app_config key `seo.checklist.<id>`.' })
  key!: string;
  @ApiProperty() done!: boolean;
}

export class PromotionManifestDto {
  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Day of the last build (YYYY-MM-DD).',
  })
  builtAt!: string | null;
  @ApiProperty() pages!: number;
  @ApiProperty({ description: 'Pages in the sitemap (index,follow).' })
  indexed!: number;
  @ApiProperty({ description: 'Pages published as noindex.' })
  noindex!: number;
  @ApiProperty({ type: Number, nullable: true }) rampPerDay!: number | null;
  @ApiProperty({
    type: Number,
    nullable: true,
    description: 'Pages held back by the daily ramp.',
  })
  rampDeferred!: number | null;
}

export class PromotionStatusDto {
  @ApiProperty() manifestUrl!: string;
  @ApiProperty({ type: PromotionManifestDto, nullable: true })
  manifest!: PromotionManifestDto | null;
  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Why there is no manifest (not published yet, unreachable).',
  })
  error!: string | null;
  @ApiProperty({ description: 'ISO time the answer was read (cached 10 min).' })
  checkedAt!: string;
}

export class PromotionDryRunInfoDto {
  @ApiProperty({
    description: 'The GitHub App is configured: the button can start it.',
  })
  canStart!: boolean;
  @ApiProperty({ description: 'The command to run by hand.' })
  command!: string;
}

export class PromotionOverviewDto {
  @ApiProperty({ type: [PromotionSettingDto] })
  switches!: PromotionSettingDto[];
  @ApiProperty({ type: [PromotionChecklistItemDto] })
  checklist!: PromotionChecklistItemDto[];
  @ApiProperty({ type: PromotionStatusDto }) status!: PromotionStatusDto;
  @ApiProperty({ type: PromotionDryRunInfoDto })
  dryRun!: PromotionDryRunInfoDto;
}

export class PromotionDryRunResultDto {
  @ApiProperty({ description: 'GitHub accepted the run.' }) started!: boolean;
  @ApiProperty() command!: string;
  @ApiProperty({ type: String, nullable: true }) runsUrl!: string | null;
  @ApiProperty({ type: String, nullable: true }) message!: string | null;
}

/** What the static-page generator reads. null = the admin never decided. */
export class PublicSeoSettingsDto {
  @ApiProperty({ type: Boolean, nullable: true }) incremental!: boolean | null;
  @ApiProperty({ type: Boolean, nullable: true }) sitemapIndex!: boolean | null;
  @ApiProperty({ type: Boolean, nullable: true }) robotsAi!: boolean | null;
  @ApiProperty({ type: Boolean, nullable: true }) llms!: boolean | null;
  @ApiProperty({ type: Boolean, nullable: true }) qualityGate!: boolean | null;
  @ApiProperty({ type: Number, nullable: true }) rampPerDay!: number | null;
}
