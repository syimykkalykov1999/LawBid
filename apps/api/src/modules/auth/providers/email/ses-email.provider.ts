import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PinoLogger } from 'nestjs-pino';
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import type { EmailProvider } from './email-provider.interface';

/**
 * Real provider, selected by config/provider-selection.ts once SES_REGION
 * + SES_FROM_ADDRESS are set (EMAIL_PROVIDER=auto) or forced with
 * EMAIL_PROVIDER=ses. Credentials come from the AWS SDK's default
 * credential chain (an IAM role in deployed envs; locally ~/.aws or the
 * optional AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY pair, which the chain
 * reads from process.env and env.schema.ts validates as both-or-neither).
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
