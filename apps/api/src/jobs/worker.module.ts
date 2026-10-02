import { Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import { ConfigModule } from '../config/config.module';
import { PrismaModule } from '../prisma/prisma.module';
import { RedisModule } from '../redis/redis.module';
import { AppSettingsModule } from '../common/app-settings/app-settings.module';
import { CostGuardModule } from '../common/cost-guard/cost-guard.module';
import { JobsModule } from './jobs.module';
import { NotificationsModule } from '../modules/notifications/notifications.module';
import { FilesWorkerModule } from '../modules/files/files-worker.module';
import { CaseHistoryModule } from '../modules/case-history/case-history.module';
import { PushModule } from '../modules/notifications/push/push.module';
import { CountersModule } from '../modules/counters/counters.module';
import { RealtimeModule } from '../modules/realtime/realtime.module';
import { BillingModule } from '../modules/billing/billing.module';
import { PrivacyModule } from '../modules/privacy/privacy.module';
import { BroadcastFanoutModule } from '../modules/admin-content/broadcast-fanout.module';

/**
 * Root module of the dedicated `worker` process (docs/06_PRODUCTION.md §6:
 * "сервис `worker` (BullMQ, cron-задачи) из одного Docker-образа, разные
 * команды запуска"). No HTTP stack — only config, DB, Redis, logging and
 * the job runner, which always runs here regardless of JOBS_ENABLED.
 */
import { SecretsModule } from '../common/secrets/secrets.module';
import { AdminAuthModule } from '../modules/admin-auth/admin-auth.module';
import { MentionsModule } from '../modules/mentions/mentions.module';
import { ModerationModule } from '../modules/moderation/moderation.module';
@Module({
  imports: [
    ConfigModule,
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
        transport:
          process.env.NODE_ENV === 'development'
            ? { target: 'pino-pretty' }
            : undefined,
      },
    }),
    PrismaModule,
    RedisModule,
    // LicenseExpiryJob: typed app_config reads + the notifications seam.
    AppSettingsModule,
    // Global paid-provider caps: FilesService (calls, client reviews in
    // the cron jobs) injects CostGuardService.
    CostGuardModule,
    // Owner 2026-10-01: keys managed in the admin (push, email, Stripe…).
    SecretsModule,
    NotificationsModule,
    // Global in the API; PostsService (reached via JobsModule) needs them.
    MentionsModule,
    ModerationModule,
    AdminAuthModule,
    JobsModule.register({ mode: 'worker' }),
    // docs/03 stage 3.2: antivirus scan + image processing (`files` queue).
    FilesWorkerModule,
    // docs/06 §1.5: stripe webhook processing + trial reminders.
    BillingModule.register({ mode: 'worker' }),
    // docs/06 §5 (stage 6.9): data export ZIP worker.
    PrivacyModule.register({ mode: 'worker' }),
    // Audit 2026-10-02: admin broadcast fan-out (`admin-broadcast` queue).
    BroadcastFanoutModule.register({ mode: 'worker' }),
    // docs/04 §12 (stage 4.7): case history PDF export queue.
    CaseHistoryModule.register({ mode: 'worker' }),
    // docs/04 stage 4.8: `push` queue consumer.
    PushModule.register({ mode: 'worker' }),
    // docs/05 stage 5.1: counters flush + nightly reconcile.
    CountersModule,
    // docs/05 §8.5: jobs publish realtime events through Redis.
    RealtimeModule,
  ],
})
export class WorkerModule {}
