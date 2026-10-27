import { OutreachService, type LeadWithPartner } from './outreach.service';
import type { EmailMessage } from '../auth/providers/email/email-provider.interface';

const settings = {
  footerAddress: '1 Main St, New York, NY 10001',
  apiPublicUrl: 'https://api.example.com',
  fromName: 'LawBid',
  dailyEmailLimit: 50,
  clientLeadsEnabled: true,
};

function build(over: { ses?: unknown; stop?: unknown } = {}) {
  const sent: EmailMessage[] = [];
  const prisma = {
    appConfig: { findUnique: jest.fn().mockResolvedValue({ value: settings }) },
    emailSuppression: {
      findUnique: jest.fn().mockResolvedValue(over.ses ?? null),
    },
    outreachSuppression: {
      findFirst: jest.fn().mockResolvedValue(over.stop ?? null),
    },
    user: {
      findUnique: jest
        .fn()
        .mockResolvedValue({ first_name: 'A', last_name: 'B' }),
    },
    outreachLead: { update: jest.fn().mockResolvedValue({}) },
    outreachActivity: { create: jest.fn().mockResolvedValue({}) },
  };
  const partners = {
    ensureCode: jest.fn().mockResolvedValue('CODE'),
    shareUrl: jest.fn().mockReturnValue('https://x/CODE'),
  };
  const rateLimit = {
    consumeFixedWindow: jest
      .fn()
      .mockResolvedValue({ allowed: true, remaining: 49 }),
  };
  const email = {
    sendEmail: jest.fn((m: EmailMessage) => (sent.push(m), Promise.resolve())),
  };
  const svc = new OutreachService(
    prisma as never,
    partners as never,
    rateLimit as never,
    email,
  );
  // Not under test here: the status move and activity log.
  jest.spyOn(svc, 'moveStatus').mockResolvedValue(undefined as never);
  jest.spyOn(svc, 'log').mockResolvedValue(undefined as never);
  return { svc, sent, email };
}

const lead = {
  id: 'l1',
  kind: 'attorney',
  email: 'lawyer@example.com',
  first_name: 'Jo',
  last_name: 'Doe',
  company: null,
  unsubscribe_token: 'tok_tok_tok_tok_tok_tok_1234',
  partner_id: null,
  partner: null,
  do_not_contact_at: null,
  unsubscribed_at: null,
  emails_sent: 0,
  last_email_at: null,
  state_code: 'NY',
} as unknown as LeadWithPartner;
const template = {
  id: 't1',
  subject: 'Hi {{first_name}}',
  body: 'Join {{link}}',
  kind: 'any',
  active: true,
} as never;
const admin = { id: 'a1', adminRole: 'super_admin' } as never;
const scope = { partner: null, manager: true };

describe('outreach cold email compliance', () => {
  it('sends marketing mail with the postal address, an unsubscribe link and RFC 8058 one-click headers', async () => {
    const { svc, sent } = build();
    await svc.sendEmail(admin, scope, lead, template);
    const m = sent[0];
    const url =
      'https://api.example.com/api/v1/outreach/unsubscribe/tok_tok_tok_tok_tok_tok_1234';
    expect(m.kind).toBe('marketing');
    expect(m.headers).toEqual({
      'List-Unsubscribe': `<${url}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    });
    expect(m.text).toContain('1 Main St, New York, NY 10001');
    expect(m.text).toContain(url);
    expect(m.html).toContain('1 Main St, New York, NY 10001');
  });

  it('refuses an address that bounced or complained (SES list)', async () => {
    const { svc, email } = build({ ses: { id: 's1' } });
    await expect(svc.sendEmail(admin, scope, lead, template)).rejects.toThrow(
      /suppression list/,
    );
    expect(email.sendEmail).not.toHaveBeenCalled();
  });

  it('refuses an address on the outreach stop-list', async () => {
    const { svc, email } = build({ stop: { id: 'o1' } });
    await expect(svc.sendEmail(admin, scope, lead, template)).rejects.toThrow(
      /suppression list/,
    );
    expect(email.sendEmail).not.toHaveBeenCalled();
  });

  it('refuses to send without the postal address (CAN-SPAM)', async () => {
    const { svc, email } = build();
    (
      svc as unknown as { prisma: { appConfig: { findUnique: jest.Mock } } }
    ).prisma.appConfig.findUnique.mockResolvedValue({
      value: { ...settings, footerAddress: '' },
    });
    await expect(svc.sendEmail(admin, scope, lead, template)).rejects.toThrow(
      /postal address/,
    );
    expect(email.sendEmail).not.toHaveBeenCalled();
  });
});
