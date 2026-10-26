import { PinoLogger } from 'nestjs-pino';
import {
  SESClient,
  SendEmailCommand,
  SendRawEmailCommand,
} from '@aws-sdk/client-ses';
import {
  CallTimeoutError,
  CircuitBreaker,
  withTimeout,
} from '../../../../common/resilience/resilience';
import type { EmailMessage, EmailProvider } from './email-provider.interface';
import { buildMimeMessage } from './mime-message';

/** A failure on SES's side or the network (counts toward the breaker);
 * a rejected address, an unverified sender or a send-rate throttle is ours. */
export function isSesServiceFault(error: unknown): boolean {
  if (error instanceof CallTimeoutError) return true;
  const status = (error as { $metadata?: { httpStatusCode?: number } } | null)
    ?.$metadata?.httpStatusCode;
  return status === undefined || status >= 500;
}

/** One per process, shared by every provider rebuild (key changes). */
export const sesBreaker = new CircuitBreaker('ses', {
  threshold: 5,
  openMs: 60_000,
});

/** A hung SES must not hang the sign-in. No retry: a send that timed out
 * may still be delivered, and a second try would mail the code twice. */
export const SES_SEND_TIMEOUT_MS = 10_000;

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
    creds: {
      region: string;
      fromAddress: string;
      accessKeyId?: string;
      secretAccessKey?: string;
    },
    private readonly logger: PinoLogger,
  ) {
    // Without keys the AWS chain (the server role) is used.
    this.client = new SESClient({
      region: creds.region,
      // Sockets are released too, not only the awaiting caller.
      requestHandler: {
        requestTimeout: SES_SEND_TIMEOUT_MS,
        connectionTimeout: 3_000,
      },
      ...(creds.accessKeyId && creds.secretAccessKey
        ? {
            credentials: {
              accessKeyId: creds.accessKeyId,
              secretAccessKey: creds.secretAccessKey,
            },
          }
        : {}),
    });
    this.fromAddress = creds.fromAddress;
  }

  async sendEmail(message: EmailMessage): Promise<void> {
    await sesBreaker.run(
      () =>
        withTimeout('ses', SES_SEND_TIMEOUT_MS, () => this.sendOnce(message)),
      isSesServiceFault,
    );
  }

  private async sendOnce(message: EmailMessage): Promise<void> {
    if (message.headers && Object.keys(message.headers).length > 0) {
      // Owner 2026-10-05 (legal): SendEmail cannot set custom headers
      // (List-Unsubscribe on cold emails), so such messages go as raw MIME.
      await this.client.send(
        new SendRawEmailCommand({
          Source: this.fromAddress,
          Destinations: [message.to],
          RawMessage: {
            Data: Buffer.from(
              buildMimeMessage({
                from: this.fromAddress,
                to: message.to,
                subject: message.subject,
                text: message.text,
                html: message.html,
                headers: message.headers,
              }),
              'utf8',
            ),
          },
        }),
      );
      this.logger.info(
        { toEmailDomain: message.to.split('@')[1], raw: true },
        'SES email sent',
      );
      return;
    }
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
