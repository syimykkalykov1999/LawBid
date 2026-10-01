import { PinoLogger } from 'nestjs-pino';
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import type { EmailMessage, EmailProvider } from './email-provider.interface';

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
export class SesEmailProvider implements EmailProvider {
  private readonly client: SESClient;
  private readonly fromAddress: string;

  constructor(
    creds: { region: string; fromAddress: string },
    private readonly logger: PinoLogger,
  ) {
    this.client = new SESClient({ region: creds.region });
    this.fromAddress = creds.fromAddress;
  }

  async sendEmail(message: EmailMessage): Promise<void> {
    await this.client.send(
      new SendEmailCommand({
        Source: this.fromAddress,
        Destination: { ToAddresses: [message.to] },
        Message: {
          Subject: { Data: message.subject, Charset: 'UTF-8' },
          Body: {
            Text: { Data: message.text, Charset: 'UTF-8' },
            ...(message.html
              ? { Html: { Data: message.html, Charset: 'UTF-8' } }
              : {}),
          },
        },
      }),
    );
    this.logger.info(
      { toEmailDomain: message.to.split('@')[1] },
      'SES email sent',
    );
  }
}
