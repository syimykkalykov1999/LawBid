import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { BootstrapController } from './controllers/bootstrap.controller';
import { FeatureFlagsService } from './services/feature-flags.service';
import { AppConfigService } from './services/app-config.service';
import { BootstrapService } from './services/bootstrap.service';
import { AppVersionGuard } from './guards/app-version.guard';

/**
 * docs/01_FOUNDATION_AUTH.md §15, "Этап 1.8: Feature flags и обязательное
 * обновление": the flags module (DB + Redis cache) and `GET
 * /config/bootstrap`. Named `feature-flags`, not `config` — `ConfigModule`
 * (src/config/config.module.ts) is already the env-config wrapper around
 * `@nestjs/config`; reusing that name here would collide.
 *
 * Registers `AppVersionGuard` as a second global APP_GUARD alongside
 * `ThrottlerGuard` (AppModule) and `JwtAuthGuard` (AuthModule) — see
 * app.module.ts for why this module is imported between the two (guard
 * execution follows import order).
 *
 * No `imports: [...]` needed, same as I18nModule: PrismaModule and
 * RedisModule are both `@Global()`, so their exports are already
 * injectable here without listing them.
 */
@Module({
  controllers: [BootstrapController],
  providers: [
    FeatureFlagsService,
    AppConfigService,
    BootstrapService,
    { provide: APP_GUARD, useClass: AppVersionGuard },
  ],
  exports: [FeatureFlagsService, AppConfigService, BootstrapService],
})
export class FeatureFlagsModule {}
