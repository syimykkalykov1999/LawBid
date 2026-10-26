import { AppSettingsService } from './app-settings.service';
import { APP_SETTINGS } from './app-settings.defaults';
import type { AppConfigService } from '../../modules/feature-flags/services/app-config.service';
import {
  avifSince,
  imageQuality,
} from '../../modules/files/processing/image-processor';
import { loadFanoutSettings } from '../../modules/notifications/case-fanout/case-fanout.settings';
import { StorageCleanupService } from '../../modules/storage/storage-cleanup.service';
import { DataRetentionService } from '../../modules/storage/data-retention.service';
import { LinkPreviewService } from '../../modules/link-preview/link-preview.service';
import { SubscriptionsService } from '../../modules/billing/subscriptions.service';
import { AuthService } from '../../modules/auth/auth.service';
import { EconomyService } from '../economy/economy.service';
import { parseAppCheckMode } from '../../modules/auth/app-check/app-check.guard';

/**
 * Switch contract (docs/dev/SWITCH_INVENTORY.md): for every admin switch
 * that starts load or money, proves (a) default, (b) off really stops the
 * reader, (c) on starts it, (d) a mode follows its value, (e) a ceiling
 * caps it. Uses the REAL AppSettingsService over a stored-config object,
 * so the stored value, the default fallback and the reader are all tested.
 */
const settingsWith = (stored: Record<string, unknown> = {}) =>
  new AppSettingsService({
    getConfig: () => Promise.resolve(stored),
  } as unknown as AppConfigService);

describe('switch contract: defaults (a)', () => {
  const table: Array<[keyof typeof APP_SETTINGS, unknown]> = [
    ['images.avif_enabled', false],
    ['case_fanout.enabled', false],
    ['billing.stripe_tax_enabled', false],
    ['sms.login_code_enabled', false],
    ['calls.channel_live_enabled', false],
    ['rewards.enabled', false],
    ['security.turnstile.mode', 'off'],
    ['security.app_check.mode', 'monitor'],
    ['economy.ceiling_mode', 'auto'],
    ['storage.auto_cleanup', true],
    ['storage.auto_retention', true],
    ['chat.link_preview_enabled', true],
    ['files.access_log_enabled', true],
    ['moderation.image.enabled', true],
    ['fraud.enabled', true],
    ['trust.enabled', true],
    ['ops.auto_pause_heavy_jobs', true],
    ['ops.auto_scale_down_on_budget', true],
  ];
  it.each(table)('%s defaults to %p with nothing stored', async (key, want) => {
    expect(APP_SETTINGS[key]).toBe(want);
    const s = settingsWith();
    const got =
      typeof want === 'boolean' ? await s.boolean(key) : await s.string(key);
    expect(got).toBe(want);
  });
});

describe('images.avif_enabled', () => {
  it('off: no AVIF twin quality, and none served', async () => {
    const s = settingsWith({ 'images.avif_since': '2026-10-25T00:00:00Z' });
    expect((await imageQuality(s)).avif).toBeNull();
    expect(await avifSince(s)).toBeNull();
  });
  it('on: twins are made with the quality ceiling clamped to 1-100 / effort 0-9', async () => {
    const s = settingsWith({
      'images.avif_enabled': true,
      'images.avif_quality': 500,
      'images.avif_effort': 99,
      'images.avif_since': '2026-10-25T00:00:00Z',
    });
    expect((await imageQuality(s)).avif).toEqual({ quality: 100, effort: 9 });
    expect(await avifSince(s)).toEqual(new Date('2026-10-25T00:00:00Z'));
  });
});

describe('case_fanout.enabled', () => {
  it('follows the switch and clamps its ceilings', async () => {
    expect((await loadFanoutSettings(settingsWith())).enabled).toBe(false);
    const on = await loadFanoutSettings(
      settingsWith({
        'case_fanout.enabled': true,
        'case_fanout.new_quota_percent': 900,
        'case_fanout.wave_size': 0,
      }),
    );
    expect(on.enabled).toBe(true);
    expect(on.newQuotaPercent).toBe(100);
    expect(on.waveSize).toBe(1);
  });
});

describe('storage.auto_cleanup / storage.auto_retention', () => {
  it('cleanup: off never runs, on runs', async () => {
    const runNow = jest.fn().mockResolvedValue({ ok: 1 });
    const make = (stored: Record<string, unknown>) =>
      Object.assign(Object.create(StorageCleanupService.prototype), {
        settings: settingsWith(stored),
        runNow,
      }) as StorageCleanupService;
    expect(await make({ 'storage.auto_cleanup': false }).run()).toBeNull();
    expect(runNow).not.toHaveBeenCalled();
    await make({ 'storage.auto_cleanup': true }).run();
    expect(runNow).toHaveBeenCalledTimes(1);
  });
  it('retention: off returns before any delete, on goes on to read the periods', async () => {
    const prisma = new Proxy(
      {},
      {
        get: () => {
          throw new Error('DB touched');
        },
      },
    );
    const make = (stored: Record<string, unknown>) =>
      Object.assign(Object.create(DataRetentionService.prototype), {
        settings: settingsWith(stored),
        prisma,
        config: { get: () => undefined },
        logger: { info: jest.fn(), warn: jest.fn() },
      }) as DataRetentionService;
    expect(await make({ 'storage.auto_retention': false }).run()).toBeNull();
    await expect(
      make({ 'storage.auto_retention': true }).run(),
    ).rejects.toThrow('DB touched');
  });
});

describe('chat.link_preview_enabled', () => {
  const make = (stored: Record<string, unknown>) => {
    const redis = { get: jest.fn().mockResolvedValue(null), set: jest.fn() };
    const svc = Object.assign(Object.create(LinkPreviewService.prototype), {
      redis,
      limiter: {
        consumeFixedWindow: jest.fn().mockResolvedValue({ allowed: true }),
      },
      settings: settingsWith({
        'chat.link_preview_denylist': [],
        ...stored,
      }),
      config: { get: () => 'test' },
      inflight: new Map(),
      denylist: jest.fn().mockResolvedValue([]),
    }) as LinkPreviewService;
    return { svc, redis };
  };
  it('off: empty card, no cache read, no outbound fetch, no cache write', async () => {
    const { svc, redis } = make({ 'chat.link_preview_enabled': false });
    const r = await svc.preview('u1', 'https://example.com/');
    expect(r.title).toBeNull();
    expect(redis.get).not.toHaveBeenCalled();
    expect(redis.set).not.toHaveBeenCalled();
  });
  it('on: goes on to the cache lookup', async () => {
    const { svc, redis } = make({ 'chat.link_preview_enabled': true });
    redis.get.mockResolvedValue(
      JSON.stringify({ url: 'https://example.com/', title: 'T' }),
    );
    await svc.preview('u1', 'https://example.com/');
    expect(redis.get).toHaveBeenCalled();
  });
});

describe('billing.stripe_tax_enabled', () => {
  it('follows the switch (off by default)', async () => {
    const f = (stored: Record<string, unknown>) =>
      SubscriptionsService.prototype.stripeTaxEnabled.call({
        settings: settingsWith(stored),
      });
    expect(await f({})).toBe(false);
    expect(await f({ 'billing.stripe_tax_enabled': true })).toBe(true);
  });
});

describe('sms.login_code_enabled', () => {
  const run = (stored: Record<string, unknown>) => {
    const findUnique = jest.fn().mockResolvedValue({
      user_id: 'u9',
      user: { password_hash: 'x' },
    });
    const self = {
      settings: settingsWith(stored),
      prisma: { userIdentifier: { findUnique } },
    };
    const call = (
      AuthService.prototype as unknown as {
        assertSmsOnlyForNewNumber(i: string, c?: string): Promise<void>;
      }
    ).assertSmsOnlyForNewNumber.call(self, '+10000000000');
    return { call, findUnique };
  };
  it('off (default): a registered number is refused a code', async () => {
    await expect(run({}).call).rejects.toMatchObject({ status: 409 });
  });
  it('on: the old passwordless code is allowed again, no lookup', async () => {
    const { call, findUnique } = run({ 'sms.login_code_enabled': true });
    await expect(call).resolves.toBeUndefined();
    expect(findUnique).not.toHaveBeenCalled();
  });
});

describe('security.app_check.mode / security.turnstile.mode (off | monitor | enforce)', () => {
  it.each([
    ['off', 'off'],
    ['monitor', 'monitor'],
    ['enforce', 'enforce'],
    ['typo', 'monitor'],
  ])('app_check %s -> %s (a typo never blocks)', (raw, want) => {
    expect(parseAppCheckMode(raw)).toBe(want);
  });
});

describe('economy.ceiling_mode (auto | manual)', () => {
  const get = async (stored: Record<string, unknown>) =>
    (
      await EconomyService.prototype.settings.call({
        settingsSvc: settingsWith(stored),
      } as never)
    ).ceilingMode;
  it('auto by default, manual only when set, a typo means auto', async () => {
    expect(await get({})).toBe('auto');
    expect(await get({ 'economy.ceiling_mode': 'manual' })).toBe('manual');
    expect(await get({ 'economy.ceiling_mode': 'zzz' })).toBe('auto');
  });
});
