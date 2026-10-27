import { BadRequestException, Injectable } from '@nestjs/common';
import { ErrorCode } from '../errors/error-code.enum';
import { AppSettingsService } from './app-settings.service';
import { registerTextLimitSource } from './max-text-chars.decorator';
import { TEXT_LIMIT_DEFS, type TextLimitKey } from './text-limits';

/**
 * The server's check of a text field against the admin's limit
 * (`limits.*` in app_config, changed without a release). Counts what a
 * person sees as characters (code points), like the app's counter does.
 */
@Injectable()
export class TextLimitsService {
  constructor(private readonly settings: AppSettingsService) {
    registerTextLimitSource((key) => this.max(key));
  }

  /** The current limit, always inside the allowed range. */
  async max(key: TextLimitKey): Promise<number> {
    const def = TEXT_LIMIT_DEFS[key];
    const v = await this.settings.number(key);
    return Math.min(Math.max(Math.trunc(v), def.min), def.max);
  }

  /** Throws a 400 when [text] is longer than the limit of [key]. */
  async assert(
    key: TextLimitKey,
    text: string | null | undefined,
    field: string,
  ): Promise<void> {
    if (!text) return;
    const limit = await this.max(key);
    const length = [...text].length;
    if (length > limit) {
      throw new BadRequestException({
        code: ErrorCode.TEXT_TOO_LONG,
        message: `This text is at most ${limit} characters.`,
        details: { field, max: limit, length },
      });
    }
  }
}

/**
 * For services that may be built without the limits service (unit tests):
 * the starter value stands in for the admin's.
 */
export async function textLimit(
  svc: TextLimitsService | undefined,
  key: TextLimitKey,
): Promise<number> {
  return svc ? svc.max(key) : TEXT_LIMIT_DEFS[key].def;
}
