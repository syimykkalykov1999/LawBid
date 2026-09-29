import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import type { PushMessage, PushSender } from './push.constants';

/**
 * Default PushSender until docs/05 wires FCM (push_tokens, UNREGISTERED
 * cleanup). Logs ids only — never the text or personal data.
 * TODO(docs/05 §9.5): replace with the FCM sender.
 */
@Injectable()
export class LoggingPushSender implements PushSender {
  constructor(private readonly logger: PinoLogger) {
    this.logger.setContext(LoggingPushSender.name);
  }

  send(message: PushMessage): Promise<void> {
    this.logger.debug(
      { userId: message.userId, notificationId: message.data.notificationId },
      'push (no sender configured)',
    );
    return Promise.resolve();
  }
}
