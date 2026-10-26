import {
  EmailSuppressionService,
  blocksKind,
  SYSTEM_ACTOR,
} from './email-suppression.service';
import {
  ComplianceEmailProvider,
  withAddressFooter,
} from './compliance-email.provider';
import type { EmailMessage } from '../auth/providers/email/email-provider.interface';

function build(existing: { reason: string } | null = null) {
  const prisma = {
    emailSuppression: {
      findUnique: jest.fn().mockResolvedValue(existing),
      upsert: jest.fn().mockResolvedValue({}),
    },
    outreachSuppression: {
      createMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    outreachLead: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
  };
  return { prisma, svc: new EmailSuppressionService(prisma as never) };
}

describe('EmailSuppressionService', () => {
  it('a bounce feeds both the notification and the outreach lists', async () => {
    const { svc, prisma } = build();
    expect(
      await svc.add('Gone@Example.com', 'bounce', { messageId: 'm1' }),
    ).toBe(true);
    expect(prisma.emailSuppression.upsert.mock.calls[0][0].where).toEqual({
      email: 'gone@example.com',
    });
    expect(
      prisma.outreachSuppression.createMany.mock.calls[0][0].data[0],
    ).toMatchObject({
      kind: 'email',
      value: 'gone@example.com',
      created_by: SYSTEM_ACTOR,
    });
    // leads stop being e-mailed, but a bounce is not a do-not-call
    expect(prisma.outreachLead.updateMany).toHaveBeenCalledTimes(1);
    expect(prisma.outreachLead.updateMany.mock.calls[0][0].data).toHaveProperty(
      'unsubscribed_at',
    );
  });

  it('a complaint also makes matching leads do-not-contact', async () => {
    const { svc, prisma } = build();
    await svc.add('a@b.co', 'complaint');
    expect(prisma.outreachLead.updateMany).toHaveBeenCalledTimes(2);
    expect(prisma.outreachLead.updateMany.mock.calls[1][0].data).toMatchObject({
      do_not_contact_reason: 'unsubscribed',
    });
  });

  it('a later bounce does not downgrade a complaint', async () => {
    const { svc, prisma } = build({ reason: 'complaint' });
    await svc.add('a@b.co', 'bounce');
    expect(prisma.emailSuppression.upsert.mock.calls[0][0].update).toEqual({});
  });

  it('ignores an unusable address', async () => {
    const { svc, prisma } = build();
    expect(await svc.add('not-an-email', 'bounce')).toBe(false);
    expect(prisma.emailSuppression.upsert).not.toHaveBeenCalled();
  });

  it('bounce blocks every kind, a complaint spares the sign-in code', () => {
    expect(blocksKind('bounce', 'transactional')).toBe(true);
    expect(blocksKind('complaint', 'transactional')).toBe(false);
    expect(blocksKind('complaint', 'notification')).toBe(true);
    expect(blocksKind('manual', 'marketing')).toBe(true);
  });
});

describe('ComplianceEmailProvider', () => {
  const msg = (kind?: EmailMessage['kind']): EmailMessage => ({
    to: 'User@Example.com',
    subject: 's',
    text: 'body',
    html: '<html><body><p>hi</p></body></html>',
    ...(kind ? { kind } : {}),
  });
  function make(
    suppression: { reason: string } | null,
    own: unknown = '1 Main St, New York, NY 10001',
  ) {
    const inner = { sendEmail: jest.fn().mockResolvedValue(undefined) };
    const prisma = {
      emailSuppression: {
        findUnique: jest.fn().mockResolvedValue(suppression),
      },
      appConfig: {
        findUnique: jest.fn(({ where }: { where: { key: string } }) =>
          Promise.resolve(
            where.key === 'compliance.email.footer_address'
              ? { value: own }
              : null,
          ),
        ),
      },
    };
    const logger = { warn: jest.fn(), info: jest.fn() };
    return {
      inner,
      prisma,
      p: new ComplianceEmailProvider(inner, prisma as never, logger),
    };
  }

  it('lets a sign-in code through untouched, no lookups', async () => {
    const { inner, prisma, p } = make({ reason: 'complaint' });
    const m = msg();
    await p.sendEmail(m);
    expect(inner.sendEmail).toHaveBeenCalledWith(m);
    expect(prisma.emailSuppression.findUnique).not.toHaveBeenCalled();
  });

  it('skips a notification to a suppressed address', async () => {
    const { inner, p } = make({ reason: 'complaint' });
    await p.sendEmail(msg('notification'));
    expect(inner.sendEmail).not.toHaveBeenCalled();
  });

  it('adds the postal address footer to a notification', async () => {
    const { inner, p } = make(null);
    await p.sendEmail(msg('notification'));
    const sent = inner.sendEmail.mock.calls[0][0] as EmailMessage;
    expect(sent.text).toContain('1 Main St, New York, NY 10001');
    expect(sent.html).toContain('1 Main St, New York, NY 10001</p></body>');
  });

  it('sends without a footer when no address is set, and never blocks on a broken lookup', async () => {
    const { inner, p } = make(null, '');
    await p.sendEmail(msg('marketing'));
    expect((inner.sendEmail.mock.calls[0][0] as EmailMessage).text).toBe(
      'body',
    );
  });

  it('keeps the caller’s headers', async () => {
    const { inner, p } = make(null);
    await p.sendEmail({
      ...msg('marketing'),
      headers: {
        'List-Unsubscribe': '<https://x>',
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      },
    });
    expect(
      (inner.sendEmail.mock.calls[0][0] as EmailMessage).headers,
    ).toMatchObject({
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    });
  });

  it('footer is added once', () => {
    const once = withAddressFooter(msg(), 'Addr 1');
    expect(withAddressFooter(once, 'Addr 1')).toBe(once);
  });
});
