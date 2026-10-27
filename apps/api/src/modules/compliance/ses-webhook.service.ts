import { Injectable, Optional } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { AppSettingsService } from '../../common/app-settings/app-settings.service';
import { EmailSuppressionService } from './email-suppression.service';
import {
  isTrustedSnsUrl,
  parseSnsMessage,
  suppressionsFromSesEvent,
  verifySnsSignature,
} from './ses-sns';

export type SesWebhookOutcome =
  'rejected' | 'confirmed' | 'processed' | 'ignored';

const FETCH_TIMEOUT_MS = 5_000;
const CERT_TTL_MS = 3_600_000;

/**
 * 2026-10-25 (Gmail/Yahoo bulk-sender rules, CAN-SPAM): receives SES
 * bounce and complaint events through an Amazon SNS HTTPS subscription.
 * Nothing is trusted before the SNS signature checks out against a
 * certificate from sns.<region>.amazonaws.com AND the topic is on the
 * admin's list (compliance.sns.topic_arns, empty = receiving is off).
 */
@Injectable()
export class SesWebhookService {
  private readonly certs = new Map<string, { pem: string; until: number }>();

  constructor(
    private readonly settings: AppSettingsService,
    private readonly suppressions: EmailSuppressionService,
    @Optional() private readonly logger?: PinoLogger,
  ) {}

  async receive(raw: string): Promise<SesWebhookOutcome> {
    const msg = parseSnsMessage(raw);
    if (!msg) return 'rejected';
    const allowed = (await this.settings.string('compliance.sns.topic_arns'))
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (!allowed.includes(msg.TopicArn)) return 'rejected';
    if (!isTrustedSnsUrl(msg.SigningCertURL)) return 'rejected';
    let pem: string;
    try {
      pem = await this.certificate(msg.SigningCertURL);
    } catch (e) {
      this.logger?.warn({ err: String(e) }, 'SNS certificate fetch failed');
      return 'rejected';
    }
    if (!verifySnsSignature(msg, pem)) return 'rejected';

    if (msg.Type === 'SubscriptionConfirmation') {
      if (!isTrustedSnsUrl(msg.SubscribeURL)) return 'rejected';
      await this.fetchText(msg.SubscribeURL as string);
      this.logger?.info({ topic: msg.TopicArn }, 'SNS subscription confirmed');
      return 'confirmed';
    }
    if (msg.Type !== 'Notification') return 'ignored';

    let event: unknown;
    try {
      event = JSON.parse(msg.Message);
    } catch {
      return 'ignored';
    }
    const items = suppressionsFromSesEvent(event);
    for (const it of items) {
      await this.suppressions.add(it.email, it.kind, {
        detail: it.detail,
        messageId: it.messageId,
      });
    }
    return items.length > 0 ? 'processed' : 'ignored';
  }

  private async certificate(url: string): Promise<string> {
    const hit = this.certs.get(url);
    if (hit && hit.until > Date.now()) return hit.pem;
    const pem = await this.fetchText(url);
    this.certs.set(url, { pem, until: Date.now() + CERT_TTL_MS });
    return pem;
  }

  /** GET [url] (https, a host already checked by the caller). */
  protected async fetchText(url: string): Promise<string> {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      redirect: 'error',
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.text();
  }
}
