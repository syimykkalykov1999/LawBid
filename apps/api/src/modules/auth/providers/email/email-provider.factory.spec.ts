import type { EmailMessage, EmailProvider } from './email-provider.interface';
import { TemplateOverrideEmailProvider } from './email-provider.factory';
import {
  invalidateEmailTemplateCache,
  type EmailTemplateLoader,
  type EmailTemplateOverrideRow,
} from './email-template-overrides';
import { buildLoginOtpEmail } from '../../notifications/email-templates';

function setup(loader: EmailTemplateLoader) {
  const sent: EmailMessage[] = [];
  const inner: EmailProvider = {
    sendEmail: jest.fn((m: EmailMessage) => {
      sent.push(m);
      return Promise.resolve();
    }),
  };
  const logger = { warn: jest.fn() };
  const provider = new TemplateOverrideEmailProvider(inner, loader, logger);
  return { provider, sent, logger };
}

const otp = () =>
  buildLoginOtpEmail({
    email: 'u@example.com',
    code: '987654',
    ttlMinutes: 10,
  });

const row = (over: Partial<EmailTemplateOverrideRow> = {}) => ({
  subject: 'Ваш код LawBid',
  text_body: 'Код: {{code}} ({{ttlMinutes}} мин)',
  html_body: null,
  enabled: true,
  ...over,
});

describe('TemplateOverrideEmailProvider', () => {
  beforeEach(() => invalidateEmailTemplateCache());

  it('builders carry the template hook', () => {
    expect(otp().template).toEqual({
      key: 'login_otp',
      vars: { code: '987654', ttlMinutes: '10', link: '' },
    });
  });

  it('applies an enabled override for the locale (default en)', async () => {
    const loader = jest.fn().mockResolvedValue(row());
    const { provider, sent } = setup(loader);
    await provider.sendEmail(otp());
    expect(loader).toHaveBeenCalledWith('login_otp', 'en');
    expect(sent[0].subject).toBe('Ваш код LawBid');
    expect(sent[0].text).toBe('Код: 987654 (10 мин)');
    expect(sent[0].html).toContain('987654');
    expect(sent[0]).not.toHaveProperty('template');
  });

  it('uses the message locale and caches lookups for 60 s', async () => {
    const loader = jest.fn().mockResolvedValue(null);
    const { provider } = setup(loader);
    const m = { ...otp(), template: { ...otp().template!, locale: 'ru' } };
    await provider.sendEmail(m);
    await provider.sendEmail(m);
    expect(loader).toHaveBeenCalledTimes(1);
    expect(loader).toHaveBeenCalledWith('login_otp', 'ru');
  });

  it('no override / disabled override → the built-in email', async () => {
    for (const r of [null, row({ enabled: false })]) {
      invalidateEmailTemplateCache();
      const { provider, sent } = setup(jest.fn().mockResolvedValue(r));
      await provider.sendEmail(otp());
      expect(sent[0].subject).toBe('Your LawBid code');
      expect(sent[0].text).toContain('987654');
    }
  });

  it('a lookup failure falls back to the built-in (never blocks a code)', async () => {
    const { provider, sent, logger } = setup(
      jest.fn().mockRejectedValue(new Error('db down')),
    );
    await provider.sendEmail(otp());
    expect(sent).toHaveLength(1);
    expect(sent[0].subject).toBe('Your LawBid code');
    expect(logger.warn).toHaveBeenCalled();
  });

  it('an override that lost the code at send time → the built-in', async () => {
    const { provider, sent } = setup(
      jest.fn().mockResolvedValue(row({ text_body: 'Hello!' })),
    );
    await provider.sendEmail(otp());
    expect(sent[0].text).toContain('987654');
    expect(sent[0].subject).toBe('Your LawBid code');
  });

  it('messages without a template pass through untouched', async () => {
    const loader = jest.fn();
    const { provider, sent } = setup(loader);
    await provider.sendEmail({ to: 'a@b.co', subject: 's', text: 't' });
    expect(loader).not.toHaveBeenCalled();
    expect(sent[0]).toEqual({ to: 'a@b.co', subject: 's', text: 't' });
  });
});
