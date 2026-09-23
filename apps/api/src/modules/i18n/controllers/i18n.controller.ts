import { Controller, Get, Param, Query, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
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
@Controller('i18n')
export class I18nController {
  constructor(
    private readonly languages: I18nLanguagesService,
    private readonly bundle: I18nBundleService,
  ) {}

  @Public()
  @Get('languages')
  async listLanguages() {
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
   * ETag/304 is the plain-GET HTTP-cache path (no `since`): if the
   * client's If-None-Match matches the language's current version, 304
   * with no body. `since` is the separate, explicit delta-poll path
   * (§9.3: "полный или дельта-набор + version") — it always returns 200
   * with a (possibly empty) JSON body, never a 304, since it's a
   * versioned query the client is actively asking for, not a cache
   * revalidation.
   */
  @Public()
  @Get('bundle/:lang')
  async getBundle(
    @Param('lang') lang: string,
    @Query() query: I18nBundleQueryDto,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const version = await this.bundle.getCurrentVersion(lang);
    const etag = `"${lang}-v${version}"`;

    if (query.since === undefined && req.header('if-none-match') === etag) {
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
