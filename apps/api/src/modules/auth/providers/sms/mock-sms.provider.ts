import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import type { SmsProvider } from './sms-provider.interface';

/**
 * Dev/test provider — never contacts a real carrier. Logs that a code
 * "was sent" WITHOUT the code itself (pino already redacts req.body.code
 * on the HTTP side; this keeps the same discipline in application logs).
 * Selected via SMS_PROVIDER=mock (the default outside explicit opt-in).
 */
@Injectable()
export class MockSmsProvider implements SmsProvider {
  constructor(private readonly logger: PinoLogger) {
    this.logger.setContext(MockSmsProvider.name);
  }

  send(toE164: string): Promise<void> {
    this.logger.info({ toE164Suffix: toE164.slice(-4) }, 'Mock SMS OTP "sent"');
    return Promise.resolve();
  }
}
