import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';

export type I18nImportMode = 'dry-run' | 'apply';

/**
 * POST /admin/i18n/import?mode=dry-run|apply (docs/01_FOUNDATION_AUTH.md
 * §9.3: "режимы dry-run ... и apply"). Defaults to 'dry-run' when
 * omitted — an import call should never write to the DB unless the
 * caller explicitly asked it to.
 */
export class I18nImportQueryDto {
  @ApiPropertyOptional({
    enum: ['dry-run', 'apply'],
    enumName: 'I18nImportMode',
    default: 'dry-run',
  })
  @IsOptional()
  @IsIn(['dry-run', 'apply'])
  mode?: I18nImportMode;
}
