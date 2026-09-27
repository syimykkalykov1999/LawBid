import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PinoLogger } from 'nestjs-pino';
import nodemailer, { type Transporter } from 'nodemailer';
import type { EmailMessage, EmailProvider } from './email-provider.interface';

/**
 * Dev/test provider — sends through Mailhog (docker-compose.yml, stage
 * 1.1) so codes are visible in a real inbox UI instead of only in logs.
 * Selected via EMAIL_PROVIDER=mock, or EMAIL_PROVIDER=auto while SES
 * settings are incomplete — never in staging/production
 * (config/provider-selection.ts).
 * Never logs the body (it can carry an OTP code — matches the pino
 * redaction already applied to req.body.code).
 */
@Injectable()
export class MockEmailProvider implements EmailProvider {
  private readonly transporter: Transporter;

  constructor(
    private readonly config: ConfigService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(MockEmailProvider.name);
    this.transporter = nodemailer.createTransport({
      host: this.config.getOrThrow<string>('SMTP_HOST'),
      port: this.config.getOrThrow<number>('SMTP_PORT'),
      secure: false,
    });
  }

  async sendEmail(message: EmailMessage): Promise<void> {
    await this.transporter.sendMail({
      from: 'no-reply@lawbid.local',
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html,
    });
    this.logger.info(
      { toEmailDomain: message.to.split('@')[1] },
      'Mock email sent via Mailhog',
    );
  }
}
