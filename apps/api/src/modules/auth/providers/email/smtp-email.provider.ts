import nodemailer, { type Transporter } from 'nodemailer';
import { PinoLogger } from 'nestjs-pino';
import {
  CircuitBreaker,
  withTimeout,
} from '../../../../common/resilience/resilience';
import type { EmailMessage, EmailProvider } from './email-provider.interface';

/**
 * Owner 2026-11-10 (own servers, no AWS): mail through any SMTP server —
 * our own MTA (Postfix / Postal / Haraka) or a relay. Nodemailer (MIT), the
 * library the dev provider already sends to Mailhog with; here with a login
 * and TLS. `secure` = implicit TLS (port 465); otherwise STARTTLS is
 * required, so the password never travels in clear.
 */
export interface SmtpSettings {
  host: string;
  port: number;
  secure: boolean;
  user?: string;
  password?: string;
  fromAddress: string;
}

/** One per process, like the SES breaker: a dead relay must not hang
 * every sign-in that sends a code. */
export const smtpBreaker = new CircuitBreaker('smtp', {
  threshold: 5,
  openMs: 60_000,
});

/** Same as SES: no retry — a send that timed out may still be delivered. */
export const SMTP_SEND_TIMEOUT_MS = 10_000;

export class SmtpEmailProvider implements EmailProvider {
  private readonly transporter: Transporter;

  constructor(
    private readonly settings: SmtpSettings,
    private readonly logger: PinoLogger,
  ) {
    this.transporter = nodemailer.createTransport({
      host: settings.host,
      port: settings.port,
      secure: settings.secure,
      requireTLS: !settings.secure,
      connectionTimeout: 3_000,
      greetingTimeout: 5_000,
      socketTimeout: SMTP_SEND_TIMEOUT_MS,
      ...(settings.user
        ? { auth: { user: settings.user, pass: settings.password ?? '' } }
        : {}),
    });
  }

  async sendEmail(message: EmailMessage): Promise<void> {
    await smtpBreaker.run(() =>
      withTimeout('smtp', SMTP_SEND_TIMEOUT_MS, () =>
        this.transporter.sendMail({
          from: this.settings.fromAddress,
          to: message.to,
          subject: message.subject,
          text: message.text,
          ...(message.html ? { html: message.html } : {}),
          // Owner 2026-10-05 (legal): List-Unsubscribe etc. on cold emails.
          ...(message.headers ? { headers: message.headers } : {}),
        }),
      ),
    );
    this.logger.info(
      { toEmailDomain: message.to.split('@')[1] },
      'SMTP email sent',
    );
  }
}
