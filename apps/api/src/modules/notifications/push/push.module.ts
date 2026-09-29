import { DynamicModule, Module } from '@nestjs/common';
import { LoggingPushSender } from './logging-push.sender';
import { NotificationTemplateService } from './notification-template.service';
import { PushDispatcher, type PushModuleOptions } from './push-dispatcher';
import { PUSH_MODULE_OPTIONS, PUSH_SENDER } from './push.constants';

/** Consumer of the `push` queue: in the API while JOBS_ENABLED, always in
 * the worker process (src/worker.ts), like the other queues. */
@Module({})
export class PushModule {
  static register(options: PushModuleOptions): DynamicModule {
    return {
      module: PushModule,
      providers: [
        { provide: PUSH_MODULE_OPTIONS, useValue: options },
        { provide: PUSH_SENDER, useClass: LoggingPushSender },
        NotificationTemplateService,
        PushDispatcher,
      ],
      exports: [PushDispatcher, NotificationTemplateService],
    };
  }
}
