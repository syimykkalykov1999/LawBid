import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PinoLogger } from 'nestjs-pino';
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import type { EmailProvider } from './email-provider.interface';

/**
 * Real provider, gated behind EMAIL_PROVIDER=ses. Credentials come from
 * the AWS SDK's default credential chain (an IAM role in deployed envs);
 * no AWS_ACCESS_KEY_ID/SECRET is required by env.schema.ts specifically
 * for this — add those only if local dev needs them outside a role.
 * Untested against a real SES account in this environment (docs/
 * CHANGELOG.md, same caveat as the Twilio provider).
 */
@Injectable()
export class SesEmailProvider implements EmailProvider {
  private readonly client: SESClient;
  private readonly fromAddress: string;

  constructor(
    private readonly config: ConfigService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(SesEmailProvider.name);
    this.client = new SESClient({
      region: this.config.getOrThrow<string>('SES_REGION'),
    });
    this.fromAddress = this.config.getOrThrow<string>('SES_FROM_ADDRESS');
  }

  async send(toEmail: string, code: string): Promise<void> {
    await this.client.send(
      new SendEmailCommand({
        Source: this.fromAddress,
        Destination: { ToAddresses: [toEmail] },
        Message: {
          Subject: { Data: 'Your LawBid code' },
          Body: {
            Text: { Data: `Your code: ${code}. Expires in 10 minutes.` },
          },
        },
      }),
    );
    this.logger.info(
      { toEmailDomain: toEmail.split('@')[1] },
      'SES OTP email sent',
    );
  }
}
