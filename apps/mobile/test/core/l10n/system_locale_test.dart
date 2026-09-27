import 'dart:ui' show Locale;

import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/l10n/app_language.dart';
import 'package:lawbid/core/l10n/available_languages.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/l10n/language_providers.dart';

import 'l10n_test_harness.dart';

/// G1 (leaf-1.5): docs/01_FOUNDATION_AUTH.md §9.4 "Автоопределение языка
/// по системной локали, если такой язык активен, иначе `en`".
void main() {
  group('detectSystemLanguage', () {
    const compiled = {'en', 'ru'};

    test('picks the first system locale whose language is selectable', () {
      expect(detectSystemLanguage(const [Locale('ru', 'RU')], compiled), AppLanguage.ru);
      expect(
        detectSystemLanguage(const [Locale('fr', 'FR'), Locale('ru')], compiled),
        AppLanguage.ru,
        reason: 'walks the preference list, skipping unsupported languages',
      );
      expect(
        detectSystemLanguage(const [Locale('es', 'MX')], {...compiled, 'es'}),
        AppLanguage.fromCode('es'),
        reason: 'region is ignored: es-MX → es',
      );
    });

    test('falls back to en when no system language is active', () {
      expect(detectSystemLanguage(const [Locale('fr', 'FR')], compiled), AppLanguage.en);
      expect(detectSystemLanguage(const [], compiled), AppLanguage.en);
      expect(
        detectSystemLanguage(const [Locale('es')], compiled),
        AppLanguage.en,
        reason: 'es is not selectable until the server lists it',
      );
    });
  });

  group('first launch (nothing stored)', () {
    test('Russian device → ru, no network needed', () async {
      final h = await L10nHarness.create();
      h.api.offline = true;
      final c = h.container(systemLocales: const [Locale('ru', 'RU')]);
      await c.read(l10nCacheControllerProvider.notifier).bootstrap();

      expect(await c.read(languageControllerProvider.future), AppLanguage.ru);
      expect(c.read(translatorProvider).t('auth.otp.submit'), 'Подтвердить');
    });

    test('unsupported device language → en', () async {
      final h = await L10nHarness.create();
      final c = h.container(systemLocales: const [Locale('de', 'DE')]);
      expect(await c.read(languageControllerProvider.future), AppLanguage.en);
    });

    test('Spanish device: en offline, then es once the server reports es active', () async {
      final h = await L10nHarness.create(
        api: FakeI18nApiClient(
          languages: [
            FakeI18nApiClient.lang('en', 'English', 0),
            FakeI18nApiClient.lang('es', 'Español', 1),
          ],
          bundles: {
            'es': {'auth.otp.submit': 'Verificar'},
          },
        ),
      );
      final c = h.container(systemLocales: const [Locale('es', 'ES')]);
      await c.read(l10nCacheControllerProvider.notifier).bootstrap();
      expect(await c.read(languageControllerProvider.future), AppLanguage.en);

      // Splash's background refresh brings the language list.
      await c.read(l10nCacheControllerProvider.notifier).refreshInBackground();
      await settle();

      expect(c.read(languageControllerProvider).value, AppLanguage.fromCode('es'));
      expect(c.read(translatorProvider).t('auth.otp.submit'), 'Verificar');
      expect(h.prefs.getString('l10n.language'), isNull,
          reason: 'auto-detection is not an explicit choice; it keeps following the device',);
    });

    test('next cold start uses the cached server list for detection, offline', () async {
      final h = await L10nHarness.create(
        prefsValues: {
          'l10n.languages.active':
              '[{"code":"en","nameNative":"English","isRtl":false,"sort":0},'
                  '{"code":"es","nameNative":"Español","isRtl":false,"sort":1}]',
        },
      );
      h.api.offline = true;
      final c = h.container(systemLocales: const [Locale('es')]);
      expect(await c.read(languageControllerProvider.future), AppLanguage.fromCode('es'));
    });
  });

  group('explicit choice', () {
    test('a stored choice beats the system locale', () async {
      final h = await L10nHarness.create(prefsValues: {'l10n.language': 'en'});
      final c = h.container(systemLocales: const [Locale('ru', 'RU')]);
      expect(await c.read(languageControllerProvider.future), AppLanguage.en);
    });

    test('setLanguage persists and survives a restart', () async {
      final h = await L10nHarness.create();
      final c = h.container();
      await c.read(languageControllerProvider.notifier).setLanguage(AppLanguage.ru);
      expect(h.prefs.getString('l10n.language'), 'ru');

      final c2 = (await L10nHarness.create(keepPrefs: true)).container();
      expect(await c2.read(languageControllerProvider.future), AppLanguage.ru);
    });

    test('a stored language the server deactivated falls back to detection', () async {
      final h = await L10nHarness.create(
        prefsValues: {'l10n.language': 'es'},
        api: FakeI18nApiClient(languages: [FakeI18nApiClient.lang('en', 'English', 0)]),
      );
      final c = h.container(systemLocales: const [Locale('de')]);
      expect(await c.read(languageControllerProvider.future), AppLanguage.fromCode('es'),
          reason: 'server list unknown yet: trust the stored choice',);

      await c.read(activeLanguagesControllerProvider.notifier).refresh();
      await settle();
      expect(c.read(languageControllerProvider).value, AppLanguage.en);
    });
  });
}
