import { ConfigService } from '@nestjs/config';
import { WebAuthnConfig } from './webauthn-config';

const settings = (origins: string[]) => ({
  stringList: jest.fn().mockResolvedValue(origins),
});

describe('WebAuthnConfig', () => {
  it('derives the RP ID from APP_LINK_BASE_URL and collects web, admin, extra and native origins', async () => {
    const cfg = new WebAuthnConfig(
      new ConfigService({
        NODE_ENV: 'production',
        APP_LINK_BASE_URL: 'https://lawbid.dev',
        ADMIN_ORIGINS: 'https://admin.lawbid.dev',
        WEBAUTHN_ORIGINS: 'android:apk-key-hash:abc_DEF-123',
      }),
      settings(['https://lawbid.dev', 'https://www.lawbid.dev']) as never,
    );
    const rp = await cfg.relyingParty();
    expect(rp.rpId).toBe('lawbid.dev');
    expect(rp.rpName).toBe('LawBid');
    expect(rp.origins).toEqual([
      'https://lawbid.dev',
      'https://www.lawbid.dev',
      'https://admin.lawbid.dev',
      'android:apk-key-hash:abc_DEF-123',
    ]);
    // Production never accepts a localhost origin.
    expect(cfg.allowsOrigin(rp, 'http://localhost:3000')).toBe(false);
    expect(cfg.allowsOrigin(rp, 'https://admin.lawbid.dev')).toBe(true);
  });

  it('WEBAUTHN_RP_ID overrides, and development accepts any localhost port', async () => {
    const cfg = new WebAuthnConfig(
      new ConfigService({
        NODE_ENV: 'development',
        APP_LINK_BASE_URL: 'https://lawbid.dev',
        WEBAUTHN_RP_ID: 'localhost',
      }),
      settings([]) as never,
    );
    const rp = await cfg.relyingParty();
    expect(rp.rpId).toBe('localhost');
    expect(rp.origins).toContain('https://localhost');
    expect(rp.origins).toContain('http://localhost:3000');
    expect(cfg.allowsOrigin(rp, 'http://localhost:54321')).toBe(true);
    expect(cfg.allowsOrigin(rp, 'https://evil.example')).toBe(false);
  });

  it('falls back to localhost without any base URL and drops junk origins', async () => {
    const cfg = new WebAuthnConfig(
      new ConfigService({
        NODE_ENV: 'test',
        ADMIN_ORIGINS: 'not a url, ,ftp://x',
      }),
      settings(['garbage']) as never,
    );
    const rp = await cfg.relyingParty();
    expect(rp.rpId).toBe('localhost');
    expect(rp.origins.filter((o) => !o.includes('localhost'))).toEqual([]);
  });
});
