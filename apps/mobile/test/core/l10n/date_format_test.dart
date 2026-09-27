import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lawbid/core/l10n/app_language.dart';
import 'package:lawbid/core/l10n/l10n_formats.dart';
import 'package:lawbid/core/l10n/language_providers.dart';

import 'l10n_test_harness.dart';

/// G2 (leaf-1.5): docs/01_FOUNDATION_AUTH.md §9.4 "Даты/числа/валюта
/// форматируются через `intl` по выбранной локали".
void main() {
  const nbsp = ' ';
  const nnbsp = ' ';
  // Local wall-clock time, so the expectations don't depend on the
  // machine's time zone.
  final moment = DateTime(2026, 9, 27, 15, 5);

  setUpAll(initializeDateFormatting);

  test('dates per language', () {
    expect(L10nFormats(AppLanguage.en).date(moment), 'Sep 27, 2026');
    expect(L10nFormats(AppLanguage.ru).date(moment), '27 сент. 2026$nnbspг.');
    expect(L10nFormats(AppLanguage.fromCode('es')).date(moment), '27 sept 2026');

    expect(L10nFormats(AppLanguage.en).dateLong(moment), 'September 27, 2026');
    expect(L10nFormats(AppLanguage.ru).dateLong(moment), '27 сентября 2026$nnbspг.');
  });

  test('time uses 12h for en and 24h for ru', () {
    expect(L10nFormats(AppLanguage.en).time(moment), '3:05${nnbsp}PM');
    expect(L10nFormats(AppLanguage.ru).time(moment), '15:05');
    expect(L10nFormats(AppLanguage.en).dateTime(moment), 'Sep 27, 2026 3:05${nnbsp}PM');
  });

  test('UTC server timestamps are shown in local time', () {
    final utc = DateTime.utc(2026, 9, 27, 12);
    expect(L10nFormats(AppLanguage.ru).time(utc), L10nFormats(AppLanguage.ru).time(utc.toLocal()));
  });

  test('numbers and money (integer cents) per language', () {
    expect(L10nFormats(AppLanguage.en).number(1234.5), '1,234.5');
    expect(L10nFormats(AppLanguage.ru).number(1234.5), '1${nbsp}234,5');
    expect(L10nFormats(AppLanguage.en).currencyFromCents(123450), r'$1,234.50');
    expect(L10nFormats(AppLanguage.ru).currencyFromCents(123450), '1${nbsp}234,50$nbsp\$');
  });

  test('a language intl has no data for formats as English instead of throwing', () {
    final formats = L10nFormats(AppLanguage.fromCode('zz'));
    expect(formats.locale, 'en');
    expect(formats.date(moment), 'Sep 27, 2026');
  });

  test('l10nFormatsProvider follows the selected language', () async {
    final h = await L10nHarness.create(prefsValues: {'l10n.language': 'en'});
    final c = h.container();
    await c.read(languageControllerProvider.future);
    expect(c.read(l10nFormatsProvider).date(moment), 'Sep 27, 2026');

    await c.read(languageControllerProvider.notifier).setLanguage(AppLanguage.ru);
    expect(c.read(l10nFormatsProvider).date(moment), '27 сент. 2026$nnbspг.');
  });
}
