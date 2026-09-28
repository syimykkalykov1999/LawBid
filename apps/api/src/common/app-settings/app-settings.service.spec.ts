import { AppSettingsService } from './app-settings.service';
import { FILE_03_SETTINGS, FILE_04_SETTINGS } from './app-settings.defaults';
import type { AppConfigService } from '../../modules/feature-flags/services/app-config.service';

describe('AppSettingsService (docs/03 §9)', () => {
  const withConfig = (config: Record<string, unknown>) =>
    new AppSettingsService({
      getConfig: () => Promise.resolve(config),
    } as unknown as AppConfigService);

  it('returns the stored value when it has the right type', async () => {
    const s = withConfig({
      'review.edit_window_days': 21,
      'verification.license_expiry_notify_days': [60, 14],
      'profile.reserved_usernames': ['boss'],
    });
    expect(await s.number('review.edit_window_days')).toBe(21);
    expect(
      await s.numberList('verification.license_expiry_notify_days'),
    ).toEqual([60, 14]);
    expect(await s.stringList('profile.reserved_usernames')).toEqual(['boss']);
  });

  it('falls back to the spec default when missing or wrongly typed', async () => {
    const s = withConfig({
      'files.max_size_mb': '10',
      'verification.license_expiry_notify_days': [30, 'x'],
    });
    expect(await s.number('files.max_size_mb')).toBe(10);
    expect(await s.number('verification.max_submissions_30d')).toBe(5);
    expect(
      await s.numberList('verification.license_expiry_notify_days'),
    ).toEqual([30, 7]);
    expect(await s.stringList('profile.reserved_usernames')).toContain('admin');
  });

  it('defaults match docs/03 §9', () => {
    expect(FILE_03_SETTINGS).toMatchObject({
      'verification.max_submissions_30d': 5,
      'verification.signed_url_ttl_sec': 300,
      'verification.license_expiry_notify_days': [30, 7],
      'profile.username_change_cooldown_days': 30,
      'review.edit_window_days': 14,
      'review.reminder_after_days': 7,
      'files.max_size_mb': 10,
      'files.avatar_max_size_mb': 5,
    });
  });

  it('file 04 defaults match docs/04 §14 and are readable', async () => {
    expect(FILE_04_SETTINGS).toEqual({
      'contacts.suspend_after_confirmed_reports': 3,
    });
    const s = withConfig({});
    expect(await s.number('contacts.suspend_after_confirmed_reports')).toBe(3);
    const edited = withConfig({
      'contacts.suspend_after_confirmed_reports': 5,
    });
    expect(
      await edited.number('contacts.suspend_after_confirmed_reports'),
    ).toBe(5);
  });
});
