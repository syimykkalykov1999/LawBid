import { HttpException } from '@nestjs/common';
import { contextCoverage, contextWords } from './password-context';
import {
  DEFAULT_PASSWORD_CONTEXT_WORDS,
  PasswordService,
} from './password.service';

/**
 * ASVS 5.0 V6.1.2 / V6.2.11 (STAGE2_SECURITY #11): a password built from
 * the service's name or the person's own data is refused
 * (AUTH_PASSWORD_COMPROMISED, reason `context`).
 */
describe('PasswordService: context-specific words', () => {
  const service = new PasswordService();

  async function reason(
    password: string,
    ctx: Parameters<PasswordService['assertNotCompromised']>[1] = {},
  ): Promise<string | null> {
    try {
      await service.assertNotCompromised(password, ctx);
      return null;
    } catch (e) {
      const body = (e as HttpException).getResponse() as {
        code: string;
        details?: { reason?: string };
      };
      expect(body.code).toBe('AUTH_PASSWORD_COMPROMISED');
      return body.details?.reason ?? null;
    }
  }

  it.each([
    ['LawBid2026!', {}],
    ['lawbid!2024', {}],
    ['L4wB1d!!', {}],
    ['dibwal2026', {}],
    ['john.smith1990', { firstName: 'John', lastName: 'Smith' }],
    ['JohnSmith!!', { firstName: 'John', lastName: 'Smith' }],
    ['annalee_law', { username: 'annalee_law' }],
    ['m.ivanova77', { email: 'm.ivanova@example.com' }],
    ['5551234567xy', { phone: '+15551234567' }],
  ])('refuses %j', async (pw, ctx) => {
    expect(await reason(pw, ctx)).toBe('context');
  });

  it.each([
    ['correct horse battery staple john', { firstName: 'John' }],
    ['Tr0ub4dor&3-zebra', { firstName: 'Anna' }],
    ['purple-giraffe-meadow-1987', {}],
  ])('accepts %j (the context words are not most of it)', async (pw, ctx) => {
    expect(await reason(pw, ctx)).toBeNull();
  });

  it('the admin list is the default without settings', () => {
    expect(DEFAULT_PASSWORD_CONTEXT_WORDS).toEqual([
      'lawbid',
      'law bid',
      'attorney',
      'lawyer',
    ]);
  });

  it('the admin can add a word and it is used at once', async () => {
    const settings = {
      stringList: jest.fn((key: string) =>
        Promise.resolve(
          key === 'security.password_context_words' ? ['acmelegal'] : [],
        ),
      ),
      boolean: jest.fn(() => Promise.resolve(false)),
      number: jest.fn(() => Promise.resolve(undefined)),
    };
    const withSettings = new PasswordService(settings as never);
    await expect(
      withSettings.assertNotCompromised('AcmeLegal#1'),
    ).rejects.toBeInstanceOf(HttpException);
    // «lawbid» is no longer on this admin's list.
    await expect(
      withSettings.assertNotCompromised('LawBid2026!'),
    ).resolves.toBeUndefined();
  });

  it('context words: short words are skipped, phone digits and e-mail parts added', () => {
    const words = contextWords(['lawbid', 'ab'], {
      firstName: 'Jo',
      email: 'maria.lopez+x@example.com',
      phone: '+1 (555) 123-4567',
    });
    expect(words).toEqual(
      expect.arrayContaining([
        'lawbid',
        'maria.lopez+x',
        'maria',
        'lopez',
        '15551234567',
        '5551234567',
        '1234567',
      ]),
    );
    expect(words).not.toContain('ab');
    expect(words).not.toContain('jo');
    expect(contextCoverage('anything', [])).toBe(0);
  });
});
