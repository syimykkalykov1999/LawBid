import { ErrorCode } from '../../common/errors/error-code.enum';
import type { PrismaService } from '../../prisma/prisma.service';
import { EMAIL_TEMPLATE_KEYS } from '../auth/providers/email/email-template-render';
import type { RateLimitService } from '../auth/services/rate-limit.service';
import { AdminEmailTemplatesService } from './admin-email-templates.service';
import { EMAIL_TEMPLATE_CATALOG, sampleVars } from './email-template-catalog';

const ADMIN = '22222222-2222-4222-8222-222222222222';

function setup(opts: { allowed?: boolean } = {}) {
  const prisma = {
    emailTemplate: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn().mockResolvedValue(null),
      upsert: jest.fn().mockResolvedValue({}),
      deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    user: {
      findUnique: jest.fn().mockResolvedValue({ email: 'boss@lawbid.app' }),
    },
  };
  const rateLimit = {
    consumeFixedWindow: jest.fn().mockResolvedValue({
      allowed: opts.allowed ?? true,
      remaining: 1,
      retryAfterSeconds: 60,
    }),
  };
  const email = { sendEmail: jest.fn().mockResolvedValue(undefined) };
  const costGuard = { consume: jest.fn().mockResolvedValue(undefined) };
  const service = new AdminEmailTemplatesService(
    prisma as unknown as PrismaService,
    rateLimit as unknown as RateLimitService,
    email,
    costGuard as never,
  );
  return { service, prisma, email, rateLimit, costGuard };
}

describe('email template catalog', () => {
  it('covers every key and the samples match the builders’ variables', () => {
    expect(EMAIL_TEMPLATE_CATALOG.map((e) => e.key).sort()).toEqual(
      [...EMAIL_TEMPLATE_KEYS].sort(),
    );
    for (const entry of EMAIL_TEMPLATE_CATALOG) {
      const msg = entry.sample();
      expect(msg.template?.key).toBe(entry.key);
      expect(Object.keys(msg.template?.vars ?? {}).sort()).toEqual(
        entry.variables.map((v) => v.name).sort(),
      );
      expect(msg.template?.vars).toEqual(sampleVars(entry));
    }
  });
});

describe('AdminEmailTemplatesService', () => {
  it.each(['login_otp', 'admin_login_code', 'contact_otp'] as const)(
    'rejects a %s override without {{code}}',
    async (key) => {
      const { service, prisma } = setup();
      await expect(
        service.save(ADMIN, key, 'ru', {
          subject: 'Код',
          textBody: 'Ваш код скоро придёт',
          enabled: true,
        }),
      ).rejects.toMatchObject({
        response: {
          code: ErrorCode.VALIDATION_ERROR,
          details: { missing: ['code'] },
        },
      });
      expect(prisma.emailTemplate.upsert).not.toHaveBeenCalled();
    },
  );

  it('rejects an HTML body that drops {{code}} even if the text has it', async () => {
    const { service } = setup();
    await expect(
      service.save(ADMIN, 'login_otp', 'en', {
        subject: 'Code',
        textBody: 'Code {{code}}',
        htmlBody: '<p>Hello</p>',
        enabled: true,
      }),
    ).rejects.toMatchObject({ response: { code: ErrorCode.VALIDATION_ERROR } });
  });

  it('saves a valid override with the editor id', async () => {
    const { service, prisma } = setup();
    await service.save(ADMIN, 'login_otp', 'ru', {
      subject: 'Код LawBid',
      textBody: 'Код: {{code}}',
      htmlBody: '   ',
      enabled: true,
    });
    expect(prisma.emailTemplate.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { key_locale: { key: 'login_otp', locale: 'ru' } },
        create: expect.objectContaining({
          html_body: null,
          updated_by: ADMIN,
        }),
      }),
    );
  });

  it('preview renders with sample values and reports unknown vars', () => {
    const { service } = setup();
    const out = service.preview('contact_otp', {
      subject: 'Code {{code}}',
      textBody: 'Hi {{name}}, {{code}} for {{ttlMinutes}} min',
    });
    expect(out.subject).toBe('Code 424242');
    expect(out.text).toBe('Hi , 424242 for 10 min');
    expect(out.unknownVariables).toEqual(['name']);
    expect(out.html).toContain('#C9A24A');
  });

  it('test send goes to the admin’s own email, rate limited 10/hour', async () => {
    const { service, email, rateLimit } = setup();
    const out = await service.sendTest(ADMIN, 'login_otp', 'en', {});
    expect(rateLimit.consumeFixedWindow).toHaveBeenCalledWith(
      ['admin-email-template-test', ADMIN],
      10,
      3600,
    );
    const sent = email.sendEmail.mock.calls[0][0];
    expect(sent.to).toBe('boss@lawbid.app');
    expect(sent.subject).toBe('[Test] Your LawBid code');
    expect(sent).not.toHaveProperty('template');
    expect(out.sentTo).toBe('bo***@lawbid.app');
  });

  it('test send over the limit → 429', async () => {
    const { service, email } = setup({ allowed: false });
    await expect(
      service.sendTest(ADMIN, 'login_otp', 'en', {}),
    ).rejects.toMatchObject({ response: { code: ErrorCode.RATE_LIMITED } });
    expect(email.sendEmail).not.toHaveBeenCalled();
  });

  it('reset deletes the override row', async () => {
    const { service, prisma } = setup();
    await service.reset('new_device', 'en');
    expect(prisma.emailTemplate.deleteMany).toHaveBeenCalledWith({
      where: { key: 'new_device', locale: 'en' },
    });
  });
});
