import { Controller, Get, Header, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { notModified } from '../../../common/sync/cheap-etag';
import { ApiTags } from '@nestjs/swagger';
import {
  ApiEnvelopeResponse,
  ApiErrors,
} from '../../../common/dto/api-docs.decorators';
import { ErrorCode } from '../../../common/errors/error-code.enum';
import { BootstrapDto } from '../dto/bootstrap-response.dto';
import { Public } from '../../auth/decorators/public.decorator';
import { SkipVersionCheck } from '../decorators/skip-version-check.decorator';
import {
  BootstrapService,
  BootstrapResponse,
} from '../services/bootstrap.service';

/**
 * `GET /config/bootstrap` (docs/01_FOUNDATION_AUTH.md §10.2 "A. Splash":
 * "загрузка feature flags и переводов"; §15 "Этап 1.8"). `@Public()` —
 * called before a session exists, same reasoning as `I18nController`'s
 * routes (see that file's class doc comment). `@SkipVersionCheck()` too:
 * this is the ONE endpoint a below-minimum-version client must still be
 * able to reach, since it's what tells that client it's below minimum in
 * the first place — see `AppVersionGuard`'s doc comment.
 */
@ApiTags('config')
@Controller('config')
export class BootstrapController {
  constructor(private readonly bootstrap: BootstrapService) {}

  @Public()
  @SkipVersionCheck()
  @Get('bootstrap')
  // Owner 2026-10-22 (client economy plan, package D): a minute in the
  // browser / CDN cache, served stale while revalidating; the weak ETag
  // (config version + 5-min bucket) answers 304 without building the body.
  @Header('Cache-Control', 'public, max-age=60, stale-while-revalidate=300')
  @ApiEnvelopeResponse(BootstrapDto)
  // No 426: @SkipVersionCheck() — see the class doc.
  @ApiErrors({
    429: [ErrorCode.RATE_LIMITED],
    500: [ErrorCode.INTERNAL_ERROR],
  })
  async getBootstrap(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<BootstrapResponse | undefined> {
    if (notModified(req, res, await this.bootstrap.etag())) return undefined;
    return this.bootstrap.build();
  }
}
