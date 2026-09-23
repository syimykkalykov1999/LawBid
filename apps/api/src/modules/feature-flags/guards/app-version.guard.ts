import {
  CanActivate,
  ExecutionContext,
  HttpException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { ErrorCode } from '../../../common/errors/error-code.enum';
import { isVersionBelow } from '../../../common/utils/semver.util';
import { AppConfigService } from '../services/app-config.service';
import { SKIP_VERSION_CHECK_KEY } from '../decorators/skip-version-check.decorator';

/**
 * Global guard (registered as APP_GUARD in FeatureFlagsModule, imported
 * in app.module.ts right after ThrottlerModule and before AuthModule —
 * see that file's comment on guard ordering) enforcing
 * docs/01_FOUNDATION_AUTH.md §7: "Минимальная поддерживаемая версия
 * приложения проверяется сервером (426 Upgrade Required с кодом
 * APP_UPDATE_REQUIRED), настраивается в админке."
 *
 * Deliberately permissive, not fail-closed like JwtAuthGuard: every
 * missing-information case (no `X-App-Version` header, no `X-Platform`
 * header, an unrecognized platform value, an unparseable version string,
 * `app_config` not seeded yet in a given environment) lets the request
 * through rather than rejecting it. A malformed/absent version header is
 * business as usual for anything that isn't the Flutter app itself
 * (Swagger, curl, this repo's own e2e tests, a future admin panel) — see
 * `HeadersInterceptor` on the Flutter side, which is the only real
 * sender of these headers and always sends both. Blocking on "can't
 * tell" would be the wrong failure mode for a check whose entire purpose
 * is compatibility, not security.
 *
 * `@SkipVersionCheck()` (this module's decorator) is for the narrower
 * case of a route that must stay reachable even by a client that WOULD
 * otherwise fail this check — `/config/bootstrap` itself (the endpoint
 * that tells a stale client it's stale) and the health endpoints.
 */
@Injectable()
export class AppVersionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly appConfig: AppConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const skip = this.reflector.getAllAndOverride<boolean>(
      SKIP_VERSION_CHECK_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (skip) return true;

    const req = context.switchToHttp().getRequest<Request>();
    const appVersion = req.header('x-app-version');
    const platform = req.header('x-platform');
    if (!appVersion || (platform !== 'ios' && platform !== 'android'))
      return true;

    const minVersion = await this.appConfig.getMinAppVersion(platform);
    if (!minVersion) return true;

    if (isVersionBelow(appVersion, minVersion)) {
      throw new HttpException(
        {
          code: ErrorCode.APP_UPDATE_REQUIRED,
          message: `App version ${appVersion} is below the minimum supported version ${minVersion}.`,
        },
        426,
      );
    }
    return true;
  }
}
