import { Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import { ConfigModule } from '../config/config.module';
import { PrismaModule } from '../prisma/prisma.module';
import { RedisModule } from '../redis/redis.module';
import { AppSettingsModule } from '../common/app-settings/app-settings.module';
import { JobsModule } from './jobs.module';
import { NotificationsModule } from '../modules/notifications/notifications.module';
import { FilesWorkerModule } from '../modules/files/files-worker.module';
import { CaseHistoryModule } from '../modules/case-history/case-history.module';
import { PushModule } from '../modules/notifications/push/push.module';

/**
 * Root module of the dedicated `worker` process (docs/06_PRODUCTION.md §6:
 * "сервис `worker` (BullMQ, cron-задачи) из одного Docker-образа, разные
 * команды запуска"). No HTTP stack — only config, DB, Redis, logging and
 * the job runner, which always runs here regardless of JOBS_ENABLED.
 */
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
    NotificationsModule,
    JobsModule.register({ mode: 'worker' }),
    // docs/03 stage 3.2: antivirus scan + image processing (`files` queue).
    FilesWorkerModule,
    // docs/04 §12 (stage 4.7): case history PDF export queue.
    CaseHistoryModule.register({ mode: 'worker' }),
    // docs/04 stage 4.8: `push` queue consumer.
    PushModule.register({ mode: 'worker' }),
  ],
})
export class WorkerModule {}
