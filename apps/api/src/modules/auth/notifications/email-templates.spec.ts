import {
  buildAppLinks,
  buildContactOtpEmail,
  buildLoginOtpEmail,
  buildNewDeviceEmail,
} from './email-templates';

describe('buildAppLinks', () => {
  it('builds a lawbid:// deep link with url-encoded query and no universal link when unset', () => {
    const links = buildAppLinks(
      'auth/email-code',
      { email: 'a+b@example.com', code: '123456' },
      undefined,
    );
    expect(links.deepLink).toBe(
      'lawbid://auth/email-code?email=a%2Bb%40example.com&code=123456',
    );
    expect(links.universalLink).toBeUndefined();
  });

  it('adds the https universal-link variant from APP_LINK_BASE_URL', () => {
    const links = buildAppLinks(
      'auth/email-code',
      { email: 'x@y.co', code: '000001' },
      'https://lawbid.app/',
    );
    expect(links.universalLink).toBe(
      'https://lawbid.app/auth/email-code?email=x%40y.co&code=000001',
    );
  });
});

describe('buildLoginOtpEmail', () => {
  const TOKEN = 'a'.repeat(43);

  it('keeps the code in the body; no link without a device-bound token', () => {
    const msg = buildLoginOtpEmail({
      email: 'user@example.com',
      code: '424242',
      ttlMinutes: 10,
    });
    expect(msg.to).toBe('user@example.com');
    expect(msg.text).toContain('424242');
    expect(msg.text).toContain('expires in 10 minutes');
    expect(msg.text).not.toContain('lawbid://');
    expect(msg.html).not.toContain('href=');
  });

  it('the magic link carries only the one-time token, never the code or email', () => {
    const msg = buildLoginOtpEmail({
      email: 'user@example.com',
      code: '424242',
      ttlMinutes: 10,
      linkToken: TOKEN,
      appLinkBaseUrl: 'https://lawbid.app',
    });
    expect(msg.text).toContain(
      `https://lawbid.app/auth/email-code?token=${TOKEN}`,
    );
    expect(msg.text).toContain(`lawbid://auth/email-code?token=${TOKEN}`);
    for (const link of msg.text.split(/\s+/).filter((w) => w.includes('://'))) {
      expect(link).not.toContain('424242');
      expect(link).not.toContain('example.com');
    }
    expect(msg.html).toMatch(
      /<a href="https:\/\/lawbid\.app\/auth\/email-code\?token=/,
    );
    expect(msg.html).not.toMatch(/href="[^"]*424242/);
  });
});

describe('buildContactOtpEmail', () => {
  it('carries the code but never a sign-in link', () => {
    const msg = buildContactOtpEmail({
      email: 'c@example.com',
      code: '111222',
      ttlMinutes: 10,
    });
    expect(msg.text).toContain('111222');
    expect(msg.text).not.toContain('lawbid://');
    expect(msg.html).not.toContain('lawbid://');
  });
});

describe('buildNewDeviceEmail', () => {
  it('names the device, links to Active devices, and escapes client-supplied text in HTML', () => {
    const msg = buildNewDeviceEmail({
      email: 'u@example.com',
      deviceName: '<script>alert(1)</script> iPhone',
      platform: 'ios',
      at: new Date('2026-09-27T12:34:56Z'),
      appLinkBaseUrl: 'https://lawbid.app',
    });
    expect(msg.subject).toBe('New sign-in to your LawBid account');
    expect(msg.text).toContain('2026-09-27 12:34 UTC');
    expect(msg.text).toContain('lawbid://profile/settings/devices');
    expect(msg.text).toContain('https://lawbid.app/profile/settings/devices');
    expect(msg.html).not.toContain('<script>');
    expect(msg.html).toContain('&lt;script&gt;');
  });

  it('falls back to a generic device label', () => {
    const msg = buildNewDeviceEmail({
      email: 'u@example.com',
      at: new Date(),
    });
    expect(msg.text).toContain('an unrecognized device');
  });
});
