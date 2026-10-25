import {
  LegalRequestService,
  gagInForce,
  renderNotice,
} from './legal-request.service';

const NOW = new Date('2026-10-28T12:00:00Z');
const DAY = 24 * 3600 * 1000;
const admin = { id: 'a1', sessionId: 's1', ip: '1.1.1.1' } as any;

function request(over: Record<string, unknown> = {}) {
  return {
    id: 'r1',
    reference_number: 'GJ-77',
    agency: 'US District Court',
    subject_user_id: 'u1',
    do_not_notify: false,
    nondisclosure_until: null,
    user_notified_at: null,
    ...over,
  };
}

function build(
  row: any,
  user: any = { email: 'p@example.com', ui_language: 'en' },
) {
  const sendEmail = jest.fn().mockResolvedValue(undefined);
  const update = jest.fn().mockResolvedValue({});
  const tx = { dataAccessRequest: { update } };
  const prisma = {
    dataAccessRequest: {
      findUnique: jest.fn().mockResolvedValue(row),
      findUniqueOrThrow: jest.fn().mockResolvedValue(row),
    },
    user: { findUnique: jest.fn().mockResolvedValue(user) },
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call
    $transaction: jest.fn((fn: any) => fn(tx)),
  } as any;
  const audit = { record: jest.fn() } as any;
  const auth = { assertStepUp: jest.fn().mockResolvedValue(undefined) } as any;
  const settings = {
    string: jest
      .fn()
      .mockResolvedValue('Request {{reference}} from {{agency}}.'),
  } as any;
  const svc = new LegalRequestService(prisma, audit, auth, settings, {
    sendEmail,
  });
  return { svc, sendEmail, update, audit, auth };
}

describe('gag order', () => {
  it('is in force without an end date, or before the end date', () => {
    expect(
      gagInForce({ do_not_notify: true, nondisclosure_until: null }, NOW),
    ).toBe(true);
    expect(
      gagInForce(
        { do_not_notify: true, nondisclosure_until: new Date(+NOW + DAY) },
        NOW,
      ),
    ).toBe(true);
  });
  it('is over after the end date, or when there is none', () => {
    expect(
      gagInForce(
        { do_not_notify: true, nondisclosure_until: new Date(+NOW - DAY) },
        NOW,
      ),
    ).toBe(false);
    expect(
      gagInForce({ do_not_notify: false, nondisclosure_until: null }, NOW),
    ).toBe(false);
  });
  it('renders the template', () => {
    expect(
      renderNotice('{{reference}} / {{ agency }}', {
        reference: 'A1',
        agency: 'Court',
      }),
    ).toBe('A1 / Court');
  });
});

describe('LegalRequestService notice to the user', () => {
  it('sends the notice, marks it and audits when no gag order is in force', async () => {
    const { svc, sendEmail, update, audit, auth } = build(request());
    const res = await svc.notifyUser(admin, 'r1');
    expect(auth.assertStepUp).toHaveBeenCalledWith('s1');
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(sendEmail.mock.calls[0][0].text).toBe(
      'Request GJ-77 from US District Court.',
    );
    expect(update.mock.calls[0][0].data.user_notified_at).toBeInstanceOf(Date);
    expect(audit.record.mock.calls[0][0].action).toBe(
      'data_request.notify_user',
    );
    expect(res.userNotifiedAt).not.toBeNull();
  });

  it('REFUSES while a gag order is in force and sends nothing', async () => {
    const { svc, sendEmail, update } = build(
      request({
        do_not_notify: true,
        nondisclosure_until: new Date(Date.now() + DAY),
      }),
    );
    await expect(svc.notifyUser(admin, 'r1')).rejects.toThrow('gag');
    expect(sendEmail).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it('allows it again once the gag order has expired', async () => {
    const { svc, sendEmail } = build(
      request({
        do_not_notify: true,
        nondisclosure_until: new Date(Date.now() - DAY),
      }),
    );
    await svc.notifyUser(admin, 'r1');
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });

  it('does not notify twice, and needs a subject with an e-mail', async () => {
    const twice = build(request({ user_notified_at: new Date() }));
    await expect(twice.svc.notifyUser(admin, 'r1')).rejects.toThrow('already');
    const noMail = build(request(), { email: null, ui_language: 'en' });
    await expect(noMail.svc.notifyUser(admin, 'r1')).rejects.toThrow('e-mail');
    const noSubject = build(request({ subject_user_id: null }));
    await expect(noSubject.svc.notifyUser(admin, 'r1')).rejects.toThrow(
      'no user',
    );
  });

  it('uses the Russian template for a Russian-speaking user', async () => {
    const { svc } = build(request(), {
      email: 'p@example.com',
      ui_language: 'ru',
    });
    const p = await svc.noticePreview('r1');
    expect(p.language).toBe('ru');
    expect(p.allowed).toBe(true);
  });
});
