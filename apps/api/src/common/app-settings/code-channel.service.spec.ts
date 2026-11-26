import type { ConfigService } from '@nestjs/config';
import {
  GetAccountSendingEnabledCommand,
  GetSendQuotaCommand,
} from '@aws-sdk/client-ses';
import { AppSettingsService } from './app-settings.service';
import { APP_SETTINGS } from './app-settings.defaults';
import {
  CodeChannelService,
  SES_READY_TTL_MS,
  codeTarget,
  parseCodeChannelSetting,
} from './code-channel.service';
import type { AppConfigService } from '../../modules/feature-flags/services/app-config.service';
import type { SecretsService } from '../secrets/secrets.service';

const settingsWith = (stored: Record<string, unknown> = {}) =>
  new AppSettingsService({
    getConfig: () => Promise.resolve(stored),
  } as unknown as AppConfigService);

const env = (values: Record<string, string | undefined>) =>
  ({ get: (k: string) => values[k] }) as unknown as ConfigService;

/** The SES answers a test hands to the service. */
class FakeSes extends CodeChannelService {
  calls = 0;
  constructor(
    cfg: ConfigService,
    settings: AppSettingsService,
    private readonly answer: {
      enabled?: boolean;
      max24?: number;
      fail?: boolean;
    },
    secrets?: SecretsService,
  ) {
    super(cfg, settings, secrets);
  }
  protected override client() {
    return {
      send: (cmd: unknown) => {
        this.calls += 1;
        if (this.answer.fail) return Promise.reject(new Error('AccessDenied'));
        if (cmd instanceof GetAccountSendingEnabledCommand) {
          return Promise.resolve({ Enabled: this.answer.enabled });
        }
        if (cmd instanceof GetSendQuotaCommand) {
          return Promise.resolve({ Max24HourSend: this.answer.max24 });
        }
        return Promise.reject(new Error('unexpected'));
      },
      destroy: () => undefined,
    } as never;
  }
}

const sesEnv = env({
  EMAIL_PROVIDER: 'auto',
  SES_REGION: 'us-east-1',
  SES_FROM_ADDRESS: 'no-reply@lawbid.dev',
});

describe('auth.code_channel (owner 25.11: SMS by default)', () => {
  it('defaults to sms; email / auto only when stored; a typo means sms', async () => {
    expect(APP_SETTINGS['auth.code_channel']).toBe('sms');
    expect(parseCodeChannelSetting(undefined)).toBe('sms');
    expect(parseCodeChannelSetting('zzz')).toBe('sms');
    expect(parseCodeChannelSetting('email')).toBe('email');
    expect(parseCodeChannelSetting('auto')).toBe('auto');
    const svc = (stored: Record<string, unknown>) =>
      new CodeChannelService(sesEnv, settingsWith(stored));
    expect(await svc({}).preferred()).toBe('phone');
    expect(await svc({ 'auth.code_channel': 'email' }).preferred()).toBe(
      'email',
    );
    expect(await svc({ 'auth.code_channel': 'typo' }).preferred()).toBe(
      'phone',
    );
  });

  it('auto: the e-mail only while SES sends and is out of its sandbox', async () => {
    const auto = settingsWith({ 'auth.code_channel': 'auto' });
    const prod = new FakeSes(sesEnv, auto, { enabled: true, max24: 50_000 });
    expect(await prod.preferred()).toBe('email');
    const sandbox = new FakeSes(sesEnv, auto, { enabled: true, max24: 200 });
    expect(await sandbox.preferred()).toBe('phone');
    const paused = new FakeSes(sesEnv, auto, { enabled: false, max24: 50_000 });
    expect(await paused.preferred()).toBe('phone');
    const denied = new FakeSes(sesEnv, auto, { fail: true });
    expect(await denied.preferred()).toBe('phone');
  });

  it('auto: not configured (mock / smtp / no region or sender) = SMS, SES never asked', async () => {
    const auto = settingsWith({ 'auth.code_channel': 'auto' });
    for (const cfg of [
      env({ EMAIL_PROVIDER: 'mock', SES_REGION: 'x', SES_FROM_ADDRESS: 'y' }),
      env({ EMAIL_PROVIDER: 'smtp', SES_REGION: 'x', SES_FROM_ADDRESS: 'y' }),
      env({ EMAIL_PROVIDER: 'auto' }),
    ]) {
      const svc = new FakeSes(cfg, auto, { enabled: true, max24: 50_000 });
      expect(await svc.preferred()).toBe('phone');
      expect(svc.calls).toBe(0);
    }
  });

  it('auto: the admin-saved SES keys count as configured', async () => {
    const secrets = {
      get: () =>
        Promise.resolve({
          fields: { region: 'us-east-1', fromAddress: 'a@b.c' },
        }),
    } as unknown as SecretsService;
    const svc = new FakeSes(
      env({ EMAIL_PROVIDER: 'auto' }),
      settingsWith({ 'auth.code_channel': 'auto' }),
      { enabled: true, max24: 50_000 },
      secrets,
    );
    expect(await svc.preferred()).toBe('email');
  });

  it('the SES reading is cached for the TTL', async () => {
    const svc = new FakeSes(sesEnv, settingsWith(), {
      enabled: true,
      max24: 50_000,
    });
    await svc.sesReady(0);
    await svc.sesReady(1000);
    expect(svc.calls).toBe(2); // one reading = two calls
    await svc.sesReady(SES_READY_TTL_MS + 1);
    expect(svc.calls).toBe(4);
  });
});

describe('codeTarget: the chosen contact if verified, else the other', () => {
  const both = {
    phone_e164: '+15551234567',
    phone_verified_at: new Date(1),
    email: 'Ann@Example.com',
    email_verified_at: new Date(1),
  };
  it('follows the channel', () => {
    expect(codeTarget('phone', both)).toEqual({
      channel: 'phone',
      identifier: '+15551234567',
    });
    expect(codeTarget('email', both)).toEqual({
      channel: 'email',
      identifier: 'ann@example.com',
    });
  });
  it('falls back to the other verified one, or none', () => {
    expect(codeTarget('email', { ...both, email_verified_at: null })).toEqual({
      channel: 'phone',
      identifier: '+15551234567',
    });
    expect(codeTarget('phone', { ...both, phone_verified_at: null })).toEqual({
      channel: 'email',
      identifier: 'ann@example.com',
    });
    expect(
      codeTarget('phone', {
        ...both,
        phone_verified_at: null,
        email_verified_at: null,
      }),
    ).toBeNull();
    expect(codeTarget('phone', null)).toBeNull();
  });
});
