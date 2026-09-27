import {
  isDeployedEnv,
  resolveEmailProvider,
  resolveSmsProvider,
  type EmailSelectionInput,
  type SmsSelectionInput,
} from './provider-selection';

// Format-valid dummies built at runtime — not real credentials.
const SID = `AC${'0'.repeat(32)}`;
const TOKEN = '0'.repeat(32);
const MG = `MG${'0'.repeat(32)}`;

const twilioComplete = {
  TWILIO_ACCOUNT_SID: SID,
  TWILIO_AUTH_TOKEN: TOKEN,
  TWILIO_FROM_NUMBER: '+15005550006',
};

function sms(overrides: Partial<SmsSelectionInput>): SmsSelectionInput {
  return { NODE_ENV: 'development', SMS_PROVIDER: 'auto', ...overrides };
}

function email(overrides: Partial<EmailSelectionInput>): EmailSelectionInput {
  return { NODE_ENV: 'development', EMAIL_PROVIDER: 'auto', ...overrides };
}

describe('isDeployedEnv', () => {
  it.each([
    ['production', true],
    ['staging', true],
    ['development', false],
    ['test', false],
  ])('%s → %s', (env, expected) => {
    expect(isDeployedEnv(env)).toBe(expected);
  });
});

describe('resolveSmsProvider', () => {
  it('auto + no credentials in development → mock, not fatal', () => {
    expect(resolveSmsProvider(sms({}))).toEqual({
      provider: 'mock',
      missing: [
        'TWILIO_ACCOUNT_SID',
        'TWILIO_AUTH_TOKEN',
        'TWILIO_FROM_NUMBER|TWILIO_MESSAGING_SERVICE_SID',
      ],
      fatal: false,
    });
  });

  it('auto + all credentials → twilio', () => {
    expect(resolveSmsProvider(sms(twilioComplete))).toEqual({
      provider: 'twilio',
      missing: [],
      fatal: false,
    });
  });

  it('auto + messaging service instead of from-number → twilio', () => {
    const result = resolveSmsProvider(
      sms({
        TWILIO_ACCOUNT_SID: SID,
        TWILIO_AUTH_TOKEN: TOKEN,
        TWILIO_MESSAGING_SERVICE_SID: MG,
      }),
    );
    expect(result.provider).toBe('twilio');
  });

  it('auto + partially pasted credentials in development → mock, lists what is missing', () => {
    const result = resolveSmsProvider(sms({ TWILIO_ACCOUNT_SID: SID }));
    expect(result.provider).toBe('mock');
    expect(result.fatal).toBe(false);
    expect(result.missing).toEqual([
      'TWILIO_AUTH_TOKEN',
      'TWILIO_FROM_NUMBER|TWILIO_MESSAGING_SERVICE_SID',
    ]);
  });

  it('treats whitespace-only values as missing', () => {
    const result = resolveSmsProvider(
      sms({ ...twilioComplete, TWILIO_AUTH_TOKEN: '   ' }),
    );
    expect(result.provider).toBe('mock');
    expect(result.missing).toEqual(['TWILIO_AUTH_TOKEN']);
  });

  it.each(['production', 'staging'])(
    'auto + no credentials in %s → fatal (never silently mock)',
    (NODE_ENV) => {
      const result = resolveSmsProvider(sms({ NODE_ENV }));
      expect(result.fatal).toBe(true);
      expect(result.missing.length).toBeGreaterThan(0);
    },
  );

  it('explicit mock in production → fatal', () => {
    expect(
      resolveSmsProvider(
        sms({
          NODE_ENV: 'production',
          SMS_PROVIDER: 'mock',
          ...twilioComplete,
        }),
      ).fatal,
    ).toBe(true);
  });

  it('explicit mock in development ignores present credentials', () => {
    expect(
      resolveSmsProvider(sms({ SMS_PROVIDER: 'mock', ...twilioComplete })),
    ).toMatchObject({ provider: 'mock', fatal: false });
  });

  it('forced twilio without credentials → fatal even in development', () => {
    expect(resolveSmsProvider(sms({ SMS_PROVIDER: 'twilio' }))).toMatchObject({
      provider: 'twilio',
      fatal: true,
    });
  });

  it('auto + all credentials in production → twilio, not fatal', () => {
    expect(
      resolveSmsProvider(sms({ NODE_ENV: 'production', ...twilioComplete })),
    ).toEqual({ provider: 'twilio', missing: [], fatal: false });
  });
});

describe('resolveEmailProvider', () => {
  const sesComplete = {
    SES_REGION: 'us-east-1',
    SES_FROM_ADDRESS: 'no-reply@example.com',
  };

  it('auto + nothing set in test → mock', () => {
    expect(resolveEmailProvider(email({ NODE_ENV: 'test' }))).toEqual({
      provider: 'mock',
      missing: ['SES_REGION', 'SES_FROM_ADDRESS'],
      fatal: false,
    });
  });

  it('auto + region and from address → ses', () => {
    expect(resolveEmailProvider(email(sesComplete)).provider).toBe('ses');
  });

  it('auto + only region in production → fatal, from address missing', () => {
    expect(
      resolveEmailProvider(
        email({ NODE_ENV: 'production', SES_REGION: 'us-east-1' }),
      ),
    ).toEqual({ provider: 'mock', missing: ['SES_FROM_ADDRESS'], fatal: true });
  });

  it('explicit mock in staging → fatal', () => {
    expect(
      resolveEmailProvider(
        email({ NODE_ENV: 'staging', EMAIL_PROVIDER: 'mock' }),
      ).fatal,
    ).toBe(true);
  });

  it('forced ses without settings → fatal', () => {
    expect(
      resolveEmailProvider(email({ EMAIL_PROVIDER: 'ses' })),
    ).toMatchObject({ provider: 'ses', fatal: true });
  });
});
