import { Type } from 'class-transformer';
import { IsInt, IsOptional, Min } from 'class-validator';

/**
 * GET /i18n/bundle/:lang?since=version (docs/01_FOUNDATION_AUTH.md §9.3).
 * `since` is the client's last-seen bundle version — omitted means "send
 * the full bundle".
 */
export class I18nBundleQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  since?: number;
}
