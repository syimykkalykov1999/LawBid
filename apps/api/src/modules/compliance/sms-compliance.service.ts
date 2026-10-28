import { ConflictException, Injectable, Optional } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { AppSettingsService } from '../../common/app-settings/app-settings.service';
import { ErrorCode } from '../../common/errors/error-code.enum';
import { PrismaService } from '../../prisma/prisma.service';
import type { SmsProvider } from '../auth/auth.public';
import {
  disclosureHash,
  inQuietHours,
  keywordFromTwilio,
  normalizeE164,
  withStopNotice,
  type SmsKeyword,
} from './sms-compliance.logic';

export type SmsPurpose = 'marketing' | 'notifications';

export type SmsBlockReason =
  'switched_off' | 'bad_number' | 'suppressed' | 'no_consent' | 'quiet_hours';

export type SmsDecision =
  { allowed: true; phone: string } | { allowed: false; reason: SmsBlockReason };

export interface InboundSms {
  from: string | undefined;
  body: string | undefined;
  optOutType?: string;
  messageSid?: string;
}

export interface InboundResult {
  keyword: SmsKeyword | null;
  /** Text for Twilio to answer with (HELP only, when switched on). */
  reply: string | null;
}

/**
 * 2026-10-25 (TCPA, FCC 2023-2025 rules). One funnel for every text that
 * is not a sign-in code:
 *  - separate recorded consent (wording version + hash), never implied by
 *    giving a number for a code;
 *  - STOP / HELP / START from Twilio's inbound webhook, mirrored into our
 *    suppression list (revocation by any reasonable word, applied at once,
 *    well inside the 10 business days of 47 CFR 64.1200(a)(10));
 *  - quiet hours in the person's local time;
 *  - a master switch, OFF by default.
 * The sign-in code (SmsProvider.send) does not call this: it is
 * transactional and needs no marketing consent.
 */
@Injectable()
export class SmsComplianceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: AppSettingsService,
    @Optional() private readonly logger?: PinoLogger,
  ) {}

  // ---- consent ------------------------------------------------------------

  /** The wording the app must show next to the consent button. */
  async disclosure(): Promise<{ version: string; text: string }> {
    const [version, text] = await Promise.all([
      this.settings.string('compliance.sms.disclosure_version'),
      this.settings.string('compliance.sms.disclosure_text'),
    ]);
    return { version, text };
  }

  /** Records a fresh opt-in. 409 when the app showed an old wording. A
   * number that sent STOP stays blocked until it texts START (the carrier
   * and Twilio enforce that too). */
  async recordConsent(input: {
    userId: string | null;
    phone: string;
    purpose: SmsPurpose;
    disclosureVersion: string;
    source: 'app' | 'web' | 'admin';
    now?: Date;
  }): Promise<{ id: string; blockedUntilStart: boolean }> {
    const phone = normalizeE164(input.phone);
    if (!phone) {
      throw new ConflictException({
        code: ErrorCode.VALIDATION_ERROR,
        message: 'Phone number must be in international format.',
      });
    }
    const current = await this.disclosure();
    if (input.disclosureVersion !== current.version) {
      throw new ConflictException({
        code: ErrorCode.VALIDATION_ERROR,
        message: 'The consent text changed; show the current text.',
        details: { disclosureVersion: current.version },
      });
    }
    const now = input.now ?? new Date();
    const row = await this.prisma.smsConsent.create({
      data: {
        user_id: input.userId,
        phone_e164: phone,
        purpose: input.purpose,
        disclosure_version: current.version,
        disclosure_hash: disclosureHash(current.text),
        source: input.source,
        granted_at: now,
      },
      select: { id: true },
    });
    return { id: row.id, blockedUntilStart: await this.isSuppressed(phone) };
  }

  /** Revokes every active consent of [phone] (all purposes). */
  async revokeConsent(
    phoneRaw: string,
    via: 'stop_reply' | 'app' | 'admin' | 'twilio_sync',
    now = new Date(),
  ): Promise<number> {
    const phone = normalizeE164(phoneRaw);
    if (!phone) return 0;
    const res = await this.prisma.smsConsent.updateMany({
      where: { phone_e164: phone, revoked_at: null },
      data: { revoked_at: now, revoked_via: via },
    });
    return res.count;
  }

  async hasConsent(phone: string, purpose: SmsPurpose): Promise<boolean> {
    const row = await this.prisma.smsConsent.findFirst({
      where: { phone_e164: phone, purpose, revoked_at: null },
      select: { id: true },
    });
    return !!row;
  }

  // ---- suppression ----------------------------------------------------------

  async isSuppressed(phoneRaw: string): Promise<boolean> {
    const phone = normalizeE164(phoneRaw);
    if (!phone) return false;
    const row = await this.prisma.smsSuppression.findUnique({
      where: { phone_e164: phone },
      select: { cleared_at: true },
    });
    return !!row && row.cleared_at === null;
  }

  async suppress(
    phoneRaw: string,
    reason: 'stop' | 'twilio' | 'admin',
    extra: { keyword?: string; messageSid?: string; now?: Date } = {},
  ): Promise<boolean> {
    const phone = normalizeE164(phoneRaw);
    if (!phone) return false;
    const now = extra.now ?? new Date();
    await this.prisma.smsSuppression.upsert({
      where: { phone_e164: phone },
      create: {
        phone_e164: phone,
        reason,
        last_keyword: extra.keyword?.slice(0, 24) ?? null,
        last_message_sid: extra.messageSid?.slice(0, 40) ?? null,
        created_at: now,
      },
      update: {
        reason,
        cleared_at: null,
        last_keyword: extra.keyword?.slice(0, 24) ?? null,
        last_message_sid: extra.messageSid?.slice(0, 40) ?? null,
      },
    });
    return true;
  }

  /** Twilio error 21610 = "recipient replied STOP to this sender": the
   * carrier-level opt-out we did not see yet. */
  async noteSendError(
    phone: string,
    twilioCode: number | string,
  ): Promise<void> {
    if (String(twilioCode) !== '21610') return;
    if (await this.suppress(phone, 'twilio')) {
      await this.revokeConsent(phone, 'twilio_sync');
    }
  }

  /** Bulk import of numbers from Twilio's Opt-Out export. */
  async importTwilioOptOuts(
    phones: string[],
  ): Promise<{ added: number; skipped: number }> {
    let added = 0;
    let skipped = 0;
    for (const p of phones) {
      if (await this.suppress(p, 'twilio')) {
        await this.revokeConsent(p, 'twilio_sync');
        added += 1;
      } else skipped += 1;
    }
    return { added, skipped };
  }

  // ---- inbound webhook ------------------------------------------------------

  async handleInbound(
    msg: InboundSms,
    now = new Date(),
  ): Promise<InboundResult> {
    const keyword = keywordFromTwilio(msg.optOutType, msg.body);
    const phone = normalizeE164(msg.from);
    if (!keyword || !phone) return { keyword: null, reply: null };
    if (keyword === 'stop') {
      await this.suppress(phone, 'stop', {
        keyword: (msg.body ?? '').trim().toLowerCase(),
        messageSid: msg.messageSid,
        now,
      });
      const n = await this.revokeConsent(phone, 'stop_reply', now);
      this.logger?.info(
        { metric: 'sms_opt_out', revoked: n, suffix: phone.slice(-4) },
        'sms STOP handled',
      );
      return { keyword, reply: null };
    }
    if (keyword === 'start') {
      await this.restart(phone, msg.messageSid, now);
      return { keyword, reply: null };
    }
    // HELP
    const reply = (await this.settings.boolean('compliance.sms.reply_to_help'))
      ? await this.settings.string('compliance.sms.help_text')
      : null;
    return { keyword, reply };
  }

  /** START: lift the block and give back the consents the STOP took away
   * (the person asked to resume the same program). */
  private async restart(phone: string, sid: string | undefined, now: Date) {
    await this.prisma.smsSuppression.updateMany({
      where: { phone_e164: phone, cleared_at: null },
      data: {
        cleared_at: now,
        last_keyword: 'start',
        last_message_sid: sid?.slice(0, 40) ?? null,
      },
    });
    const revoked = await this.prisma.smsConsent.findMany({
      where: { phone_e164: phone, revoked_via: 'stop_reply' },
      orderBy: { revoked_at: 'desc' },
      take: 10,
    });
    const seen = new Set<string>();
    for (const c of revoked) {
      if (seen.has(c.purpose)) continue;
      seen.add(c.purpose);
      const active = await this.hasConsent(phone, c.purpose as SmsPurpose);
      if (active) continue;
      await this.prisma.smsConsent.create({
        data: {
          user_id: c.user_id,
          phone_e164: phone,
          purpose: c.purpose,
          disclosure_version: c.disclosure_version,
          disclosure_hash: c.disclosure_hash,
          source: 'inbound_start',
          granted_at: now,
        },
      });
    }
  }

  // ---- the gate for non-code texts ---------------------------------------------

  async authorizeNonOtp(input: {
    phone: string;
    purpose: SmsPurpose;
    /** IANA zone of the person (users.timezone); null = strictest US set. */
    timeZone?: string | null;
    now?: Date;
  }): Promise<SmsDecision> {
    if (!(await this.settings.boolean('compliance.sms.marketing_enabled')))
      return { allowed: false, reason: 'switched_off' };
    const phone = normalizeE164(input.phone);
    if (!phone) return { allowed: false, reason: 'bad_number' };
    if (await this.isSuppressed(phone))
      return { allowed: false, reason: 'suppressed' };
    if (!(await this.hasConsent(phone, input.purpose)))
      return { allowed: false, reason: 'no_consent' };
    const [startHour, endHour] = await Promise.all([
      this.settings.number('compliance.sms.quiet_start_hour'),
      this.settings.number('compliance.sms.quiet_end_hour'),
    ]);
    if (
      inQuietHours(input.now ?? new Date(), input.timeZone, {
        startHour,
        endHour,
      })
    )
      return { allowed: false, reason: 'quiet_hours' };
    return { allowed: true, phone };
  }

  /** The only way to send a text that is not a sign-in code. Returns the
   * decision; sends only when allowed. A Twilio 21610 error is learned. */
  async sendNonOtp(
    sender: Pick<SmsProvider, 'sendText'>,
    input: {
      phone: string;
      purpose: SmsPurpose;
      body: string;
      timeZone?: string | null;
      now?: Date;
    },
  ): Promise<SmsDecision> {
    const decision = await this.authorizeNonOtp(input);
    if (!decision.allowed) return decision;
    if (!sender.sendText) {
      throw new Error('This SMS provider cannot send plain texts');
    }
    try {
      await sender.sendText(decision.phone, withStopNotice(input.body));
    } catch (e) {
      const code = (e as { code?: number | string } | null)?.code;
      if (code !== undefined) await this.noteSendError(decision.phone, code);
      throw e;
    }
    return decision;
  }
}
