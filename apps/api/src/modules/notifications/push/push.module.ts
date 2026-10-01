import { DynamicModule, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type Redis from 'ioredis';
import { PinoLogger } from 'nestjs-pino';
import { REDIS_CLIENT } from '../../../redis/redis.constants';
import { createEmailProvider } from '../../auth/providers/email/email-provider.factory';
import { NotificationsModule } from '../notifications.module';
import { DynamicPushSender } from './fcm-push.sender';
import { SecretsService } from '../../../common/secrets/secrets.service';
import { LoggingPushSender } from './logging-push.sender';
import { NotificationTemplateService } from './notification-template.service';
import { PushDispatcher, type PushModuleOptions } from './push-dispatcher';
import { PushTokensService } from './push-tokens.service';
import {
  NOTIFICATION_EMAIL,
  PUSH_MODULE_OPTIONS,
  PUSH_SENDER,
  type PushSender,
} from './push.constants';

/** Consumer of the `push` queue: in the API while JOBS_ENABLED, always in
 * the worker process (src/worker.ts), like the other queues. FCM is used
 * as soon as FCM_PROJECT_ID/FCM_CLIENT_EMAIL/FCM_PRIVATE_KEY are set
 * (docs/KEYS_SETUP.md), otherwise pushes are only logged. */
@Module({})
export class PushModule {
  static register(options: PushModuleOptions): DynamicModule {
    return {
      module: PushModule,
      imports: [NotificationsModule],
      providers: [
        { provide: PUSH_MODULE_OPTIONS, useValue: options },
        PushTokensService,
        {
          provide: PUSH_SENDER,
          inject: [SecretsService, PushTokensService, REDIS_CLIENT, PinoLogger],
          // Owner 2026-10-01: FCM keys from the admin or the env, per send.
          useFactory: (
            secrets: SecretsService,
            tokens: PushTokensService,
            redis: Redis,
            logger: PinoLogger,
          ): PushSender =>
            new DynamicPushSender(
              secrets,
              tokens,
              redis,
              logger,
              new LoggingPushSender(logger),
            ),
        },
        {
          provide: NOTIFICATION_EMAIL,
          inject: [ConfigService, PinoLogger, SecretsService],
          useFactory: createEmailProvider,
        },
        NotificationTemplateService,
        PushDispatcher,
      ],
      exports: [PushDispatcher, NotificationTemplateService, PushTokensService],
    };
  }
}
