import { SmsComplianceService } from './sms-compliance.service';

interface Sup {
  phone_e164: string;
  reason: string;
  cleared_at: Date | null;
  last_keyword?: string | null;
}
interface Con {
  id: string;
  user_id: string | null;
  phone_e164: string;
  purpose: string;
  disclosure_version: string;
  disclosure_hash: string;
  source: string;
  granted_at: Date;
  revoked_at: Date | null;
  revoked_via: string | null;
}

function build(over: Record<string, string | number | boolean> = {}) {
  const sups: Sup[] = [];
  const cons: Con[] = [];
  let n = 0;
  const prisma = {
    smsSuppression: {
      findUnique: jest.fn(({ where }) =>
        Promise.resolve(
          sups.find((s) => s.phone_e164 === where.phone_e164) ?? null,
        ),
      ),
      upsert: jest.fn(({ where, create, update }) => {
        const cur = sups.find((s) => s.phone_e164 === where.phone_e164);
        if (cur) Object.assign(cur, update);
        else sups.push({ ...create, cleared_at: null });
        return Promise.resolve({});
      }),
      updateMany: jest.fn(({ where, data }) => {
        for (const s of sups)
          if (s.phone_e164 === where.phone_e164 && s.cleared_at === null)
            Object.assign(s, data);
        return Promise.resolve({ count: 1 });
      }),
    },
    smsConsent: {
      create: jest.fn(({ data }) => {
        const row = {
          id: `c${++n}`,
          revoked_at: null,
          revoked_via: null,
          ...data,
        };
        cons.push(row);
        return Promise.resolve(row);
      }),
      updateMany: jest.fn(({ where, data }) => {
        let count = 0;
        for (const c of cons)
          if (c.phone_e164 === where.phone_e164 && c.revoked_at === null) {
            Object.assign(c, data);
            count += 1;
          }
        return Promise.resolve({ count });
      }),
      findFirst: jest.fn(({ where }) =>
        Promise.resolve(
          cons.find(
            (c) =>
              c.phone_e164 === where.phone_e164 &&
              c.purpose === where.purpose &&
              c.revoked_at === null,
          ) ?? null,
        ),
      ),
      findMany: jest.fn(({ where }) =>
        Promise.resolve(
          cons.filter(
            (c) =>
              c.phone_e164 === where.phone_e164 &&
              c.revoked_via === where.revoked_via,
          ),
        ),
      ),
    },
  };
  const values: Record<string, string | number | boolean> = {
    'compliance.sms.marketing_enabled': true,
    'compliance.sms.quiet_start_hour': 21,
    'compliance.sms.quiet_end_hour': 8,
    'compliance.sms.disclosure_version': 'sms-v1',
    'compliance.sms.disclosure_text': 'Agree to texts. Reply STOP to cancel.',
    'compliance.sms.help_text': 'Help text',
    'compliance.sms.reply_to_help': false,
    ...over,
  };
  const settings = {
    string: jest.fn((k: string) => Promise.resolve(values[k] as string)),
    number: jest.fn((k: string) => Promise.resolve(values[k] as number)),
    boolean: jest.fn((k: string) => Promise.resolve(values[k] as boolean)),
  };
  return {
    svc: new SmsComplianceService(prisma as never, settings as never),
    sups,
    cons,
  };
}

const PHONE = '+15551230000';
const noon = new Date('2026-07-01T17:00:00Z'); // 13:00 NY, 10:00 LA

describe('SmsComplianceService', () => {
  it('blocks everything while the master switch is off', async () => {
    const { svc } = build({ 'compliance.sms.marketing_enabled': false });
    expect(
      await svc.authorizeNonOtp({
        phone: PHONE,
        purpose: 'marketing',
        now: noon,
      }),
    ).toEqual({
      allowed: false,
      reason: 'switched_off',
    });
  });

  it('needs separate recorded consent (a code does not count)', async () => {
    const { svc } = build();
    expect(
      await svc.authorizeNonOtp({
        phone: PHONE,
        purpose: 'marketing',
        now: noon,
      }),
    ).toEqual({
      allowed: false,
      reason: 'no_consent',
    });
    await svc.recordConsent({
      userId: 'u1',
      phone: PHONE,
      purpose: 'marketing',
      disclosureVersion: 'sms-v1',
      source: 'app',
    });
    expect(
      await svc.authorizeNonOtp({
        phone: PHONE,
        purpose: 'marketing',
        now: noon,
      }),
    ).toEqual({ allowed: true, phone: PHONE });
  });

  it('refuses a consent for an outdated wording', async () => {
    const { svc } = build();
    await expect(
      svc.recordConsent({
        userId: 'u1',
        phone: PHONE,
        purpose: 'marketing',
        disclosureVersion: 'sms-v0',
        source: 'app',
      }),
    ).rejects.toThrow();
  });

  it('stores the wording version and a hash of the text', async () => {
    const { svc, cons } = build();
    await svc.recordConsent({
      userId: 'u1',
      phone: PHONE,
      purpose: 'marketing',
      disclosureVersion: 'sms-v1',
      source: 'app',
    });
    expect(cons[0].disclosure_version).toBe('sms-v1');
    expect(cons[0].disclosure_hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('blocks in quiet hours, judged in the person’s zone', async () => {
    const { svc } = build();
    await svc.recordConsent({
      userId: 'u1',
      phone: PHONE,
      purpose: 'marketing',
      disclosureVersion: 'sms-v1',
      source: 'app',
    });
    const night = new Date('2026-07-02T03:00:00Z'); // 23:00 NY
    expect(
      await svc.authorizeNonOtp({
        phone: PHONE,
        purpose: 'marketing',
        timeZone: 'America/New_York',
        now: night,
      }),
    ).toEqual({ allowed: false, reason: 'quiet_hours' });
  });

  it('STOP suppresses the number and revokes consent at once', async () => {
    const { svc, cons } = build();
    await svc.recordConsent({
      userId: 'u1',
      phone: PHONE,
      purpose: 'marketing',
      disclosureVersion: 'sms-v1',
      source: 'app',
    });
    const r = await svc.handleInbound({
      from: PHONE,
      body: 'Stop',
      messageSid: 'SM1',
    });
    expect(r).toEqual({ keyword: 'stop', reply: null });
    expect(await svc.isSuppressed(PHONE)).toBe(true);
    expect(cons[0].revoked_via).toBe('stop_reply');
    expect(
      await svc.authorizeNonOtp({
        phone: PHONE,
        purpose: 'marketing',
        now: noon,
      }),
    ).toEqual({ allowed: false, reason: 'suppressed' });
  });

  it('START lifts the block and restores the consent the STOP took', async () => {
    const { svc } = build();
    await svc.recordConsent({
      userId: 'u1',
      phone: PHONE,
      purpose: 'marketing',
      disclosureVersion: 'sms-v1',
      source: 'app',
    });
    await svc.handleInbound({ from: PHONE, body: 'STOP' });
    await svc.handleInbound({ from: PHONE, body: 'START' });
    expect(await svc.isSuppressed(PHONE)).toBe(false);
    expect(
      await svc.authorizeNonOtp({
        phone: PHONE,
        purpose: 'marketing',
        now: noon,
      }),
    ).toEqual({ allowed: true, phone: PHONE });
  });

  it('honours Twilio’s OptOutType even for odd words', async () => {
    const { svc } = build();
    await svc.handleInbound({
      from: PHONE,
      body: 'leave me alone',
      optOutType: 'STOP',
    });
    expect(await svc.isSuppressed(PHONE)).toBe(true);
  });

  it('HELP answers only when switched on', async () => {
    expect(
      (await build().svc.handleInbound({ from: PHONE, body: 'HELP' })).reply,
    ).toBeNull();
    const on = build({ 'compliance.sms.reply_to_help': true });
    expect(
      (await on.svc.handleInbound({ from: PHONE, body: 'help' })).reply,
    ).toBe('Help text');
  });

  it('ordinary replies do nothing', async () => {
    const { svc } = build();
    expect(await svc.handleInbound({ from: PHONE, body: 'thanks!' })).toEqual({
      keyword: null,
      reply: null,
    });
    expect(await svc.isSuppressed(PHONE)).toBe(false);
  });

  it('learns a carrier-level opt-out from Twilio error 21610 only', async () => {
    const { svc } = build();
    await svc.noteSendError(PHONE, 30003);
    expect(await svc.isSuppressed(PHONE)).toBe(false);
    await svc.noteSendError(PHONE, 21610);
    expect(await svc.isSuppressed(PHONE)).toBe(true);
  });

  it('sendNonOtp sends with a STOP notice only when allowed', async () => {
    const { svc } = build();
    const sendText = jest.fn().mockResolvedValue(undefined);
    const denied = await svc.sendNonOtp(
      { sendText },
      { phone: PHONE, purpose: 'marketing', body: 'Hi', now: noon },
    );
    expect(denied.allowed).toBe(false);
    expect(sendText).not.toHaveBeenCalled();
    await svc.recordConsent({
      userId: 'u1',
      phone: PHONE,
      purpose: 'marketing',
      disclosureVersion: 'sms-v1',
      source: 'app',
    });
    await svc.sendNonOtp(
      { sendText },
      { phone: PHONE, purpose: 'marketing', body: 'Hi', now: noon },
    );
    expect(sendText).toHaveBeenCalledWith(PHONE, 'Hi Reply STOP to opt out.');
  });

  it('imports Twilio opt-outs', async () => {
    const { svc } = build();
    expect(await svc.importTwilioOptOuts([PHONE, 'junk'])).toEqual({
      added: 1,
      skipped: 1,
    });
    expect(await svc.isSuppressed(PHONE)).toBe(true);
  });
});
