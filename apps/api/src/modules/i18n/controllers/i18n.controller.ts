import {
  Controller,
  Get,
  Header,
  Param,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { ApiHeader, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  ApiEnvelopeResponse,
  ApiErrors,
  COMMON_ERRORS,
} from '../../../common/dto/api-docs.decorators';
import { ErrorCode } from '../../../common/errors/error-code.enum';
import { etagMatches } from '../../../common/sync/cheap-etag';
import { I18nBundleDto, I18nLanguageDto } from '../dto/i18n-responses.dto';
import { Public } from '../../auth/decorators/public.decorator';
import { I18nBundleQueryDto } from '../dto/bundle-query.dto';
import { I18nBundleService } from '../services/i18n-bundle.service';
import { I18nLanguagesService } from '../services/i18n-languages.service';

/**
 * docs/01_FOUNDATION_AUTH.md §9.3, public read endpoints — the Flutter
 * client calls these before a session exists (Splash, per §15 stage
 * 1.6/1.8), so both routes are @Public() (opt out of the global
 * JwtAuthGuard, same as the auth token-issuing routes — see
 * auth.controller.ts's class doc).
 */
@ApiTags('i18n')
@ApiErrors(COMMON_ERRORS)
@Controller('i18n')
export class I18nController {
  constructor(
    private readonly languages: I18nLanguagesService,
    private readonly bundle: I18nBundleService,
  ) {}

  @Public()
  @Get('languages')
  @Header('Cache-Control', 'public, max-age=60')
  @ApiEnvelopeResponse(I18nLanguageDto, { isArray: true })
  async listLanguages(): Promise<I18nLanguageDto[]> {
    return this.languages.listActive();
  }

  /**
   * GET /i18n/bundle/:lang?since=version. Bypasses the global
   * ResponseInterceptor's {data:...} envelope deliberately (@Res()
   * without `passthrough`, per Nest's documented raw-response-control
   * pattern) — that's the only way to send a spec-correct empty-body 304
   * for a matching ETag (docs/01_FOUNDATION_AUTH.md §9.3: "Поддержка
   * ETag/304"). Every other route in this module returns normally and
   * gets the standard envelope.
   *
   * ETag/304: if the client's If-None-Match matches the language's current
   * version (and, with `since`, the same `since`), 304 with no body.
   * `since` is the explicit delta path (§9.3: "полный или дельта-набор +
   * version"); owner 2026-10-23: its answer is tagged with the `since` too,
   * so repeating the same delta is a 304 as well.
   */
  @Public()
  @Get('bundle/:lang')
  @ApiEnvelopeResponse(I18nBundleDto, {
    description:
      'Success envelope (docs/01 §7) with an `ETag` header ("<lang>-v<version>").',
  })
  @ApiResponse({
    status: 304,
    description:
      'Not modified: If-None-Match equals the current ETag (which includes `since`). Empty body.',
  })
  @ApiHeader({
    name: 'If-None-Match',
    required: false,
    description: 'ETag of the bundle (or delta) the client already has.',
  })
  @ApiErrors({
    400: [ErrorCode.VALIDATION_ERROR],
    404: [ErrorCode.I18N_LANGUAGE_NOT_FOUND],
  })
  async getBundle(
    @Param('lang') lang: string,
    @Query() query: I18nBundleQueryDto,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const version = await this.bundle.getCurrentVersion(lang);
    // Owner 2026-10-23 (web pass): a delta is a pure function of (language,
    // version, since), so it has an ETag of its own and answers 304 too —
    // the web app reloads with a free "nothing new". The full bundle keeps
    // its plain `"<lang>-v<version>"` tag.
    const etag =
      query.since === undefined
        ? `"${lang}-v${version}"`
        : `"${lang}-v${version}-s${query.since}"`;
    res.set('Cache-Control', 'private, no-cache');

    if (etagMatches(req.header('if-none-match'), etag)) {
      res.status(304).set('ETag', etag).end();
      return;
    }

    const translations = await this.bundle.getTranslations(
      lang,
      version,
      query.since,
    );
    res
      .status(200)
      .set('ETag', etag)
      .json({ data: { lang, version, translations } });
  }
}
