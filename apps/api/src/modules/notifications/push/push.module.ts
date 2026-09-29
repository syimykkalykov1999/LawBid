import { DynamicModule, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type Redis from 'ioredis';
import { PinoLogger } from 'nestjs-pino';
import { REDIS_CLIENT } from '../../../redis/redis.constants';
import { createEmailProvider } from '../../auth/providers/email/email-provider.factory';
import { NotificationsModule } from '../notifications.module';
import { FcmPushSender } from './fcm-push.sender';
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
          inject: [ConfigService, PushTokensService, REDIS_CLIENT, PinoLogger],
          useFactory: (
            config: ConfigService,
            tokens: PushTokensService,
            redis: Redis,
            logger: PinoLogger,
          ): PushSender =>
            config.get<string>('FCM_PROJECT_ID')
              ? new FcmPushSender(config, tokens, redis, logger)
              : new LoggingPushSender(logger),
        },
        {
          provide: NOTIFICATION_EMAIL,
          inject: [ConfigService, PinoLogger],
          useFactory: createEmailProvider,
        },
        NotificationTemplateService,
        PushDispatcher,
      ],
      exports: [PushDispatcher, NotificationTemplateService, PushTokensService],
    };
  }
}
