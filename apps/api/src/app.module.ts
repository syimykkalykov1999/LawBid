import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerGuard } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { ConfigModule } from './config/config.module';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';
import { ThrottlerModule } from './throttler/throttler.module';
import { HealthModule } from './modules/health/health.module';
import { DevModule } from './modules/dev/dev.module';
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
            'req.body.phone',
            'req.body.email',
            'req.body.code',
            'req.body.refreshToken',
            'req.body.idToken',
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
