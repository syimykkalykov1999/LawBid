import type { PinoLogger } from 'nestjs-pino';
import type { PrismaService } from '../../prisma/prisma.service';
import type { EmailMessage, EmailProvider } from '../auth/auth.public';
import {
  OUTREACH_SETTINGS_KEY,
  parseOutreachSettings,
} from '../outreach/outreach.settings';
import {
  blocksKind,
  normalizeEmailAddress,
  type EmailSuppressionReason,
} from './email-suppression.service';

const TTL_MS = 60_000;

/** Appends the postal-address footer once (text and html). */
export function withAddressFooter(
  message: EmailMessage,
  address: string,
): EmailMessage {
  if (!address || message.text.includes(address)) return message;
  const text = `${message.text}\n\n--\n${address}`;
  const escaped = address
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  const block = `<p style="font-size:12px;color:#777;margin-top:24px">${escaped}</p>`;
  const html = message.html
    ? message.html.includes('</body>')
      ? message.html.replace('</body>', `${block}</body>`)
      : message.html + block
    : undefined;
  return { ...message, text, ...(html ? { html } : {}) };
}

/**
 * 2026-10-25 (CAN-SPAM, Gmail/Yahoo bulk-sender rules): the last step
 * before the real sender. For `notification` and `marketing` mail it
 *  - skips an address that bounced (permanent) or complained, as recorded
 *    from the SES events (email_suppressions), and
 *  - prints the company's postal address in the footer (setting
 *    `compliance.email.footer_address`, else the outreach address).
 * `transactional` mail (sign-in codes) passes through untouched: SES's own
 * account-level suppression list covers bounces for it, and a person who
 * complained must still get a code they ask for. Headers set by the caller
 * (List-Unsubscribe, List-Unsubscribe-Post) are passed on.
 */
export class ComplianceEmailProvider implements EmailProvider {
  private footer?: { value: string; until: number };

  constructor(
    private readonly inner: EmailProvider,
    private readonly prisma: Pick<
      PrismaService,
      'emailSuppression' | 'appConfig'
    >,
    private readonly logger: Pick<PinoLogger, 'warn' | 'info'>,
  ) {}

  async sendEmail(message: EmailMessage): Promise<void> {
    const kind = message.kind ?? 'transactional';
    if (kind === 'transactional') return this.inner.sendEmail(message);
    try {
      const email = normalizeEmailAddress(message.to);
      if (email) {
        const row = await this.prisma.emailSuppression.findUnique({
          where: { email },
          select: { reason: true },
        });
        if (row && blocksKind(row.reason as EmailSuppressionReason, kind)) {
          this.logger.info(
            { metric: 'email_suppressed_skip', reason: row.reason, kind },
            'email skipped: address is on the suppression list',
          );
          return;
        }
      }
    } catch (e) {
      // A broken list lookup must not stop a system notice.
      this.logger.warn({ err: String(e) }, 'email suppression lookup failed');
    }
    let out = message;
    try {
      out = withAddressFooter(message, await this.footerAddress());
    } catch (e) {
      this.logger.warn({ err: String(e) }, 'email footer lookup failed');
    }
    return this.inner.sendEmail(out);
  }

  private async footerAddress(): Promise<string> {
    const now = Date.now();
    if (this.footer && this.footer.until > now) return this.footer.value;
    const own = await this.prisma.appConfig.findUnique({
      where: { key: 'compliance.email.footer_address' },
      select: { value: true },
    });
    let value =
      typeof own?.value === 'string' ? own.value.trim().slice(0, 300) : '';
    if (!value) {
      const outreach = await this.prisma.appConfig.findUnique({
        where: { key: OUTREACH_SETTINGS_KEY },
        select: { value: true },
      });
      value = parseOutreachSettings(outreach?.value).footerAddress.trim();
    }
    this.footer = { value, until: now + TTL_MS };
    return value;
  }
}
