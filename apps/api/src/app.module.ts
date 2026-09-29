import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerGuard } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import type { Options as PinoHttpOptions } from 'pino-http';
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
import { CaseHistoryModule } from './modules/case-history/case-history.module';
import { PushModule } from './modules/notifications/push/push.module';
import { CountersModule } from './modules/counters/counters.module';
import { ModerationModule } from './modules/moderation/moderation.module';
import { PostsModule } from './modules/posts/posts.module';
import { FeedModule } from './modules/feed/feed.module';
import { CommentsModule } from './modules/comments/comments.module';
import { ReportsModule } from './modules/reports/reports.module';
import { FollowsModule } from './modules/follows/follows.module';
import { SearchModule } from './modules/search/search.module';
import { ChatModule } from './modules/chat/chat.module';
import { NotificationsApiModule } from './modules/notifications/notifications-api.module';
import { RealtimeModule } from './modules/realtime/realtime.module';
import { RealtimeGatewayModule } from './modules/realtime/realtime-gateway.module';
import { BidsModule } from './modules/bids/bids.module';
import { NegotiationsModule } from './modules/negotiations/negotiations.module';
import { JournalModule } from './modules/journal/journal.module';
import { SubscriptionsModule } from './modules/subscriptions/subscriptions.module';
import { AppSettingsModule } from './common/app-settings/app-settings.module';
import { VerificationModule } from './modules/verification/verification.module';
import { ProfilesModule } from './modules/profiles/profiles.module';
import { ReviewsModule } from './modules/reviews/reviews.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { DevModule } from './modules/dev/dev.module';
import { FilesModule } from './modules/files/files.module';
import { AdminAuthModule } from './modules/admin-auth/admin-auth.module';
import { AdminModule } from './modules/admin/admin.module';
import { AdminUsersModule } from './modules/admin-users/admin-users.module';
import { AdminCasesModule } from './modules/admin-cases/admin-cases.module';
import { AdminDataRequestsModule } from './modules/admin-data-requests/admin-data-requests.module';
import { AdminConfigModule } from './modules/admin-config/admin-config.module';
import { BillingModule } from './modules/billing/billing.module';
import { PrivacyModule } from './modules/privacy/privacy.module';
import { CostGuardModule } from './common/cost-guard/cost-guard.module';
import { JobsModule } from './jobs/jobs.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import {
  RequestIdMiddleware,
  resolveRequestId,
} from './common/middleware/request-id.middleware';

/**
 * pino-http options for LoggerModule. Exported so src/app.module.spec.ts
 * can assert the request-id wiring against the exact production config.
 *
 * genReqId: pino-http would otherwise mint its own incrementing id, so
 * log lines and the X-Request-Id header (RequestIdMiddleware) disagreed —
 * resolveRequestId() is shared by both, see its doc comment.
 */
export const pinoHttpOptions: PinoHttpOptions = {
  genReqId: (req, res) => resolveRequestId(req, res),
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
      // Device attestation blobs (DeviceAttestationGuard) — opaque,
      // large, and replayable within their validity window.
      'req.headers["x-device-attestation"]',
    ],
    censor: '[REDACTED]',
  },
  // docs/05 §7.6: search text is never logged next to the caller.
  serializers: {
    req: (req: { url?: string; query?: unknown }) =>
      req.url?.includes('/search/')
        ? {
            ...req,
            url: req.url.replace(/\?.*$/, '?[REDACTED]'),
            query: undefined,
          }
        : req,
  },
  transport:
    process.env.NODE_ENV === 'development'
      ? { target: 'pino-pretty' }
      : undefined,
};

const isDev =
  process.env.NODE_ENV !== 'production' && process.env.NODE_ENV !== 'staging';

@Module({
  imports: [
    ConfigModule,
    LoggerModule.forRoot({ pinoHttp: pinoHttpOptions }),
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
    // docs/06 stage 6.2: admin JWT, RBAC, dashboard/audit/admins.
    AdminAuthModule,
    AdminModule,
    AdminUsersModule,
    AdminCasesModule,
    AdminDataRequestsModule,
    AdminConfigModule,
    // docs/06 §1 (stage 6.7): Stripe subscriptions, webhooks, admin extend.
    BillingModule.register({ mode: 'api' }),
    // docs/06 §5 (stage 6.9): data export endpoint + privacy services.
    PrivacyModule.register({ mode: 'api' }),
    UsersModule,
    I18nModule,
    CasesModule,
    // docs/04 §12 (stage 4.7): case history + PDF export queue.
    CaseHistoryModule.register({ mode: 'api' }),
    // docs/04 stage 4.8: `push` queue consumer (while JOBS_ENABLED).
    PushModule.register({ mode: 'api' }),
    // docs/05 stage 5.1: counters aggregator + moderation hook (global).
    CountersModule,
    ModerationModule,
    // docs/05 §3 (stage 5.2).
    PostsModule,
    FeedModule,
    CommentsModule,
    ReportsModule,
    FollowsModule,
    SearchModule,
    // docs/05 §8 chats + §8.5 realtime (publisher global, gateway API-only).
    RealtimeModule,
    RealtimeGatewayModule,
    ChatModule,
    // docs/05 §9-§10 notifications REST, badges, push tokens.
    NotificationsApiModule,
    BidsModule,
    NegotiationsModule,
    JournalModule,
    SubscriptionsModule,
    AppSettingsModule,
    // Global NotificationsService.emit() seam (delivery: docs/05).
    NotificationsModule,
    VerificationModule,
    FilesModule,
    ProfilesModule,
    ReviewsModule,
    // BullMQ `cron` queue (session/OTP cleanup, disposable-domain refresh).
    // Runs in this process while JOBS_ENABLED (default true); src/worker.ts
    // runs the same module as the dedicated worker service.
    JobsModule.register({ mode: 'api' }),
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
