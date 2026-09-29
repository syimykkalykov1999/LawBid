import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import type { PushMessage, PushSender } from './push.constants';

/**
 * PushSender when FCM isn't configured (dev/test, docs/KEYS_SETUP.md);
 * FcmPushSender is selected automatically once FCM_* env is set. Logs ids
 * only — never the text or personal data.
 */
@Injectable()
export class LoggingPushSender implements PushSender {
  constructor(private readonly logger: PinoLogger) {
    this.logger.setContext(LoggingPushSender.name);
  }

  send(message: PushMessage, dedupeKey: string): Promise<void> {
    this.logger.debug(
      { userId: message.userId, dedupeKey },
      'push (no sender configured)',
    );
    return Promise.resolve();
  }
}
