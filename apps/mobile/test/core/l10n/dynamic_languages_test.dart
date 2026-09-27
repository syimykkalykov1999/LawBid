import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/app_language.dart';
import 'package:lawbid/core/l10n/available_languages.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/l10n/language_catalog.dart';
import 'package:lawbid/core/l10n/language_catalog_provider.dart';
import 'package:lawbid/core/l10n/language_providers.dart';
import 'package:lawbid/core/l10n/widgets/language_picker_sheet.dart';

import 'l10n_test_harness.dart';

/// G1 (leaf-1.5): a language that exists only on the server (`es`, e.g.
/// imported via xlsx — docs/01 §15 stage 1.6 acceptance "новый язык,
/// импортированный через xlsx, появляется в приложении без пересборки")
/// is listed, selectable and rendered from its server bundle, with no
/// client change.
void main() {
  FakeI18nApiClient serverWithSpanish() => FakeI18nApiClient(
        languages: [
          FakeI18nApiClient.lang('en', 'English', 0),
          FakeI18nApiClient.lang('ru', 'Русский', 1),
          FakeI18nApiClient.lang('es', 'Español (servidor)', 2),
          // Not in the curated catalog at all — appended by the merge.
          FakeI18nApiClient.lang('sw', 'Kiswahili', 3),
          // Known to the server but switched off by an admin.
          FakeI18nApiClient.lang('fr', 'Français', 4, active: false),
        ],
        bundles: {
          'es': {
            'auth.welcome.phone': 'Continuar con teléfono',
            'lang.picker.title': 'Idioma',
          },
        },
      );

  LanguageCatalogEntry entry(List<LanguageCatalogEntry> list, String code) =>
      list.singleWhere((e) => e.code == code);

  group('mergeLanguageCatalog', () {
    test('server list unknown: only compiled-in en/ru are selectable', () {
      final list = mergeLanguageCatalog(null);
      expect(entry(list, 'en').appLanguage, AppLanguage.en);
      expect(entry(list, 'ru').appLanguage, AppLanguage.ru);
      expect(entry(list, 'es').isEnabled, isFalse);
      expect(list.map((e) => e.code), orderedEquals(kLanguageCatalog.map((e) => e.code)));
    });

    test('active server languages become selectable; others stay "soon"', () {
      final list = mergeLanguageCatalog(const [
        ServerLanguage(code: 'en', nameNative: 'English'),
        ServerLanguage(code: 'ru', nameNative: 'Русский', sort: 1),
        ServerLanguage(code: 'es', nameNative: 'Español (servidor)', sort: 2),
        ServerLanguage(code: 'sw', nameNative: 'Kiswahili', sort: 3),
      ]);
      final es = entry(list, 'es');
      expect(es.isEnabled, isTrue);
      expect(es.appLanguage, AppLanguage.fromCode('es'));
      expect(es.nativeName, 'Español (servidor)', reason: 'server name_native wins');
      expect(es.englishName, 'Spanish', reason: 'curated English name kept');
      expect(entry(list, 'fr').isEnabled, isFalse, reason: 'not active on the server');
      expect(list.last.code, 'sw', reason: 'server-only language appended');
      expect(list.last.appLanguage, AppLanguage.fromCode('sw'));
    });

    test('en stays selectable even if the server list omits it (mandatory fallback)', () {
      final list = mergeLanguageCatalog(const [ServerLanguage(code: 'es', nameNative: 'Español')]);
      expect(entry(list, 'en').isEnabled, isTrue);
      expect(entry(list, 'ru').isEnabled, isFalse);
      expect(entry(list, 'es').isEnabled, isTrue);
    });
  });

  test('AppLanguage is a value type keyed by ISO 639-1 code', () {
    expect(AppLanguage.fromCode('ES-mx'), AppLanguage.fromCode('es'));
    expect(AppLanguage.fromCode('es').code, 'es');
    expect(AppLanguage.fromCode('es').name, 'es');
    expect(identical(AppLanguage.fromCode('en_US'), AppLanguage.en), isTrue);
    expect(AppLanguage.values, [AppLanguage.en, AppLanguage.ru]);
    expect(AppLanguage.isValidCode('xyz'), isFalse);
  });

  test('server-only language: listed, selected, rendered from its bundle with en fallback', () async {
    final api = serverWithSpanish();
    final h = await L10nHarness.create(api: api);
    final c = h.container();
    await c.read(l10nCacheControllerProvider.notifier).bootstrap();

    // Picker list, straight from GET /i18n/languages.
    final catalog = await c.read(languageCatalogProvider.future);
    final es = entry(catalog, 'es');
    expect(es.isEnabled, isTrue);
    expect(entry(catalog, 'sw').isEnabled, isTrue);
    expect(entry(catalog, 'fr').isEnabled, isFalse);

    await c.read(languageControllerProvider.notifier).setLanguage(es.appLanguage!);
    await settle();

    final t = c.read(translatorProvider);
    expect(t.t('auth.welcome.phone'), 'Continuar con teléfono');
    // Missing in the es bundle → English (§9.3 "fallback на en").
    expect(t.t('auth.otp.submit'), 'Verify');
    expect(api.calls, contains('bundle:es:-'));
    // Cached in Drift for the next (possibly offline) launch.
    expect(await h.db.loadLanguage('es'), containsPair('lang.picker.title', 'Idioma'));
  });

  test('offline cold start keeps a previously chosen server-only language', () async {
    final api = serverWithSpanish();
    final h1 = await L10nHarness.create(api: api);
    final c1 = h1.container();
    await c1.read(activeLanguagesControllerProvider.notifier).refresh();
    await c1.read(languageControllerProvider.notifier).setLanguage(AppLanguage.fromCode('es'));
    await c1.read(l10nCacheControllerProvider.notifier).refreshInBackground();
    await settle();
    expect(await h1.db.loadLanguage('es'), containsPair('auth.welcome.phone', 'Continuar con teléfono'));

    // Same device (prefs + Drift file), no network.
    api.offline = true;
    final h2 = await L10nHarness.create(keepPrefs: true, api: api, db: h1.db);
    final c2 = h2.container();
    await c2.read(l10nCacheControllerProvider.notifier).bootstrap();

    expect(await c2.read(languageControllerProvider.future), AppLanguage.fromCode('es'));
    expect(c2.read(activeLanguagesControllerProvider)!.map((l) => l.code), contains('es'));
    expect(c2.read(translatorProvider).t('auth.welcome.phone'), 'Continuar con teléfono');
    final catalog = await c2.read(languageCatalogProvider.future);
    expect(entry(catalog, 'es').isEnabled, isTrue, reason: 'cached list used offline');
  });

  testWidgets('picker: the server-only language row is tappable and switches the app', (tester) async {
    final api = serverWithSpanish();
    late L10nHarness h;
    await tester.runAsync(() async {
      h = await L10nHarness.create(api: api);
    });
    await tester.pumpWidget(
      ProviderScope(
        overrides: h.overrides(),
        child: MaterialApp(
          theme: AppTheme.light(),
          home: Scaffold(
            body: Builder(
              builder: (context) => TextButton(
                onPressed: () => LanguagePickerSheet.show(context),
                child: const Text('open'),
              ),
            ),
          ),
        ),
      ),
    );
    await tester.tap(find.text('open'));
    await tester.pump();
    await tester.runAsync(settle);
    await tester.pumpAndSettle();

    final esRow = find.text('Español (servidor)');
    expect(esRow, findsOneWidget);
    // Rows the server doesn't serve keep the "coming soon" badge.
    expect(find.text('Coming soon'), findsWidgets);
    expect(
      find.descendant(of: find.byType(LanguagePickerSheet), matching: find.text('ES')),
      findsOneWidget,
      reason: 'selectable rows show the code, not the "coming soon" badge',
    );

    await tester.tap(esRow);
    await tester.runAsync(settle);
    await tester.pumpAndSettle();

    expect(find.byType(LanguagePickerSheet), findsNothing, reason: 'sheet closes on pick');
    final container = ProviderScope.containerOf(tester.element(find.text('open')));
    expect(container.read(languageControllerProvider).value, AppLanguage.fromCode('es'));
    expect(container.read(translatorProvider).t('auth.welcome.phone'), 'Continuar con teléfono');
    await tester.runAsync(h.db.close);
  });
}
