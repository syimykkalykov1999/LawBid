import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PinoLogger } from 'nestjs-pino';
import nodemailer, { type Transporter } from 'nodemailer';
import type { EmailProvider } from './email-provider.interface';

/**
 * Dev/test provider — sends through Mailhog (docker-compose.yml, stage
 * 1.1) so codes are visible in a real inbox UI instead of only in logs.
 * Selected via EMAIL_PROVIDER=mock (the default outside explicit opt-in).
 * Never logs the code itself (matches the pino redaction already applied
 * to req.body.code).
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

  async send(toEmail: string, code: string): Promise<void> {
    await this.transporter.sendMail({
      from: 'no-reply@lawbid.local',
      to: toEmail,
      subject: 'Your LawBid code',
      text: `Your code: ${code}. Expires in 10 minutes.`,
    });
    this.logger.info(
      { toEmailDomain: toEmail.split('@')[1] },
      'Mock email OTP sent via Mailhog',
    );
  }
}
