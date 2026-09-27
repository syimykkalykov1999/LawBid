import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerGuard } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { ConfigModule } from './config/config.module';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';
import { ThrottlerModule } from './throttler/throttler.module';
import { HealthModule } from './modules/health/health.module';
import { FeatureFlagsModule } from './modules/feature-flags/feature-flags.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { I18nModule } from './modules/i18n/i18n.module';
import { CasesModule } from './modules/cases/cases.module';
import { DevModule } from './modules/dev/dev.module';
import { CostGuardModule } from './common/cost-guard/cost-guard.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import { RequestIdMiddleware } from './common/middleware/request-id.middleware';

const isDev =
  process.env.NODE_ENV !== 'production' && process.env.NODE_ENV !== 'staging';

@Module({
  imports: [
    ConfigModule,
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
        // docs/06_PRODUCTION.md §12: "персональные данные в логи не писать" —
        // redact list per §4.3 (extended as later stages add more PII fields).
        redact: {
          paths: [
            'req.headers.authorization',
            'req.headers.cookie',
            'req.headers["x-reauth-token"]',
            'req.body.phone',
            'req.body.email',
            // Stage 1.4 (docs/CHANGELOG.md): auth/contacts DTOs use a
            // generic `identifier` field (phone OR email, see
            // OtpRequestDto/OtpVerifyDto/ReauthDto) and `value` (Contacts
            // DTOs) instead of separate phone/email fields — both are PII
            // and must be redacted the same as the literal names above.
            'req.body.identifier',
            'req.body.value',
            'req.body.code',
            'req.body.refreshToken',
            'req.body.idToken',
            'req.body.nonce',
            'req.body.reauthToken',
          ],
          censor: '[REDACTED]',
        },
        transport:
          process.env.NODE_ENV === 'development'
            ? { target: 'pino-pretty' }
            : undefined,
      },
    }),
    PrismaModule,
    RedisModule,
    ThrottlerModule,
    HealthModule,
    // Registered after ThrottlerModule and before AuthModule so global
    // APP_GUARDs run in this order: ThrottlerGuard (cheap per-IP rate
    // limit) -> AppVersionGuard (FeatureFlagsModule, stage 1.8 —
    // rejects a stale client before spending any JWT-verification work
    // on it) -> JwtAuthGuard (AuthModule). See feature-flags.module.ts
    // and auth.module.ts's doc comments.
    FeatureFlagsModule,
    // Global: CostGuardService for every paid provider call.
    CostGuardModule,
    AuthModule,
    UsersModule,
    I18nModule,
    CasesModule,
    ...(isDev ? [DevModule] : []),
  ],
  providers: [
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_INTERCEPTOR, useClass: ResponseInterceptor },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestIdMiddleware).forRoutes('*');
  }
}
