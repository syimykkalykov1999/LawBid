import { envSchema } from './env.schema';

// Format-valid dummies built at runtime — not real credentials.
const hex32 = '0'.repeat(32);
const strong = (label: string): string => `${label}_${'x'.repeat(40)}`;

const base: Record<string, string> = {
  NODE_ENV: 'development',
  DATABASE_URL: 'postgresql://root@localhost:26257/lawbid?sslmode=disable',
  REDIS_URL: 'redis://localhost:6379',
  JWT_KEYS: `k1:${strong('jwt')}`,
  JWT_ACTIVE_KID: 'k1',
  OTP_CODE_SECRET: strong('otp'),
  OTP_KEY_PEPPER: strong('pepper'),
  AUTH_EVENT_PEPPER: strong('event'),
};

const twilio = {
  TWILIO_ACCOUNT_SID: `AC${hex32}`,
  TWILIO_AUTH_TOKEN: hex32,
  TWILIO_FROM_NUMBER: '+15005550006',
};
const ses = {
  SES_REGION: 'us-east-1',
  SES_FROM_ADDRESS: 'LawBid <no-reply@example.com>',
};

function issues(env: Record<string, string>): string[] {
  const result = envSchema.safeParse({ ...base, ...env });
  return result.success
    ? []
    : result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
}

function issuePaths(env: Record<string, string>): string[] {
  return issues(env).map((i) => i.split(':')[0]);
}

describe('envSchema — credentials', () => {
  it('boots in development with every credential empty (mock providers)', () => {
    const parsed = envSchema.parse({
      ...base,
      SMS_PROVIDER: '',
      TWILIO_ACCOUNT_SID: '',
      TWILIO_AUTH_TOKEN: '',
      TWILIO_FROM_NUMBER: '',
      SES_REGION: '',
      GOOGLE_CLIENT_IDS: '',
      STRIPE_SECRET_KEY: '',
    });
    expect(parsed.SMS_PROVIDER).toBe('auto');
    expect(parsed.EMAIL_PROVIDER).toBe('auto');
    expect(parsed.TWILIO_ACCOUNT_SID).toBeUndefined();
    expect(parsed.GOOGLE_CLIENT_IDS).toBeUndefined();
  });

  it('rejects malformed Twilio values with a clear message', () => {
    const found = issues({
      TWILIO_ACCOUNT_SID: 'SK123',
      TWILIO_FROM_NUMBER: '555-123-4567',
      TWILIO_MESSAGING_SERVICE_SID: 'MGxyz',
    });
    expect(found).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^TWILIO_ACCOUNT_SID: .*"AC"/),
        expect.stringMatching(/^TWILIO_FROM_NUMBER: .*E\.164/),
        expect.stringMatching(/^TWILIO_MESSAGING_SERVICE_SID: /),
      ]),
    );
  });

  it('accepts well-formed Twilio + SES values', () => {
    expect(issues({ ...twilio, ...ses })).toEqual([]);
  });

  it('production without Twilio/SES credentials fails fast, naming each var', () => {
    const paths = issuePaths({ NODE_ENV: 'production' });
    expect(paths).toEqual(
      expect.arrayContaining([
        'TWILIO_ACCOUNT_SID',
        'TWILIO_AUTH_TOKEN',
        'TWILIO_FROM_NUMBER|TWILIO_MESSAGING_SERVICE_SID',
        'SES_REGION',
        'SES_FROM_ADDRESS',
      ]),
    );
  });

  it('production with SMS_PROVIDER=mock is refused', () => {
    expect(
      issuePaths({
        NODE_ENV: 'production',
        SMS_PROVIDER: 'mock',
        ...twilio,
        ...ses,
      }),
    ).toEqual(['SMS_PROVIDER']);
  });

  it('production with complete credentials boots', () => {
    expect(issues({ NODE_ENV: 'production', ...twilio, ...ses })).toEqual([]);
  });

  it('production refuses placeholder secrets from .env.example', () => {
    expect(
      issuePaths({
        NODE_ENV: 'production',
        ...twilio,
        ...ses,
        JWT_KEYS: 'dev1:CHANGE_ME_32_CHARS_MINIMUM_SECRET_A',
        JWT_ACTIVE_KID: 'dev1',
      }),
    ).toEqual(['JWT_KEYS']);
  });

  it('validates Google client ids and Apple bundle ids', () => {
    expect(
      issues({
        GOOGLE_CLIENT_IDS:
          '123456789012-abc123.apps.googleusercontent.com, 123456789012-def456.apps.googleusercontent.com',
        APPLE_BUNDLE_IDS: 'com.lawbid.lawbid',
        APPLE_TEAM_ID: 'ABCDE12345',
      }),
    ).toEqual([]);
    expect(
      issuePaths({
        GOOGLE_CLIENT_IDS: 'my-client-id',
        APPLE_BUNDLE_IDS: 'lawbid',
        APPLE_TEAM_ID: 'abc',
      }),
    ).toEqual(['GOOGLE_CLIENT_IDS', 'APPLE_BUNDLE_IDS', 'APPLE_TEAM_ID']);
  });

  it('requires credential pairs/groups to be complete', () => {
    expect(issuePaths({ AWS_ACCESS_KEY_ID: `AKIA${'A'.repeat(16)}` })).toEqual([
      'AWS_SECRET_ACCESS_KEY',
    ]);
    expect(issuePaths({ FCM_PROJECT_ID: 'lawbid-dev' })).toEqual([
      'FCM_CLIENT_EMAIL',
      'FCM_PRIVATE_KEY',
    ]);
  });

  it('allows Stripe test keys only outside production, live keys only in production', () => {
    const testKey = `sk_test_${'a'.repeat(24)}`;
    const liveKey = `sk_live_${'a'.repeat(24)}`;
    expect(issues({ STRIPE_SECRET_KEY: testKey })).toEqual([]);
    expect(issuePaths({ STRIPE_SECRET_KEY: liveKey })).toEqual([
      'STRIPE_SECRET_KEY',
    ]);
    expect(
      issuePaths({
        NODE_ENV: 'production',
        ...twilio,
        ...ses,
        STRIPE_SECRET_KEY: testKey,
      }),
    ).toEqual(['STRIPE_SECRET_KEY']);
    expect(
      issuePaths({
        STRIPE_WEBHOOK_SECRET: 'secret',
        STRIPE_PRICE_ID: 'prod_1',
      }),
    ).toEqual(['STRIPE_WEBHOOK_SECRET', 'STRIPE_PRICE_ID']);
  });

  it('parses boolean flags strictly ("false" is false)', () => {
    expect(
      envSchema.parse({ ...base, OTP_DEV_FIXED_CODE: 'false' })
        .OTP_DEV_FIXED_CODE,
    ).toBe(false);
    expect(
      envSchema.parse({ ...base, OTP_DEV_FIXED_CODE: 'true' })
        .OTP_DEV_FIXED_CODE,
    ).toBe(true);
    expect(
      envSchema.parse({ ...base, OTP_DEV_FIXED_CODE: '' }).OTP_DEV_FIXED_CODE,
    ).toBe(false);
    expect(issuePaths({ OTP_DEV_FIXED_CODE: 'yes' })).toEqual([
      'OTP_DEV_FIXED_CODE',
    ]);
    // The production boot that used to fail on OTP_DEV_FIXED_CODE=false.
    expect(
      issues({
        NODE_ENV: 'production',
        ...twilio,
        ...ses,
        OTP_DEV_FIXED_CODE: 'false',
      }),
    ).toEqual([]);
  });

  it('refuses a MinIO S3_ENDPOINT when deployed', () => {
    expect(
      issuePaths({
        NODE_ENV: 'staging',
        ...twilio,
        ...ses,
        S3_ENDPOINT: 'http://localhost:9000',
      }),
    ).toEqual(['S3_ENDPOINT']);
  });
});
