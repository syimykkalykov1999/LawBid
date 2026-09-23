import { Controller, Get } from '@nestjs/common';
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
@Controller('config')
export class BootstrapController {
  constructor(private readonly bootstrap: BootstrapService) {}

  @Public()
  @SkipVersionCheck()
  @Get('bootstrap')
  async getBootstrap(): Promise<BootstrapResponse> {
    return this.bootstrap.build();
  }
}
