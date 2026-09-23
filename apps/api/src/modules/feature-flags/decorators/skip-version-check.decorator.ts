import { SetMetadata } from '@nestjs/common';

export const SKIP_VERSION_CHECK_KEY = 'skipVersionCheck';

/** Opts a route out of the global AppVersionGuard (app-version.guard.ts)
 * — same `SetMetadata` shape as auth's `@Public()`
 * (auth/decorators/public.decorator.ts). Only `/config/bootstrap` and
 * the health endpoints use this; every other route stays fail-closed
 * (checked by default) the same way JwtAuthGuard's routes do. */
export const SkipVersionCheck = (): MethodDecorator & ClassDecorator =>
  SetMetadata(SKIP_VERSION_CHECK_KEY, true);
