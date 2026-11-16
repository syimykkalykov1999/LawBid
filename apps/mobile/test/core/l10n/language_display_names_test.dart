import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/l10n/language_catalog.dart';

/// Sweep C-c6 (SYSTEMS_CHECKLIST §16): the pickers' second line is the
/// language's name in the app's language (CLDR), not always English.
///
/// Web bundle budget (15.11): the table is the asset
/// assets/l10n/language_display_names.json, read once by
/// [loadLanguageDisplayNames]; before that the English name is the answer.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  // Runs first (tests run in order): the table is not read yet.
  test('before the table is read: the English name, then CLDR', () async {
    expect(languageDisplayNamesLoaded, isFalse);
    expect(languageNameIn('ru', 'es'), 'Spanish');
    await loadLanguageDisplayNames();
    expect(languageDisplayNamesLoaded, isTrue);
    expect(languageNameIn('ru', 'es'), 'Испанский');
  });

  test('every shipped language has a row of names, one per language', () {
    final table = LanguageDisplayNames.fromJson(
      File(kLanguageDisplayNamesAsset).readAsStringSync(),
    );
    expect(table.codes, contains('ky'));
    expect(table.codes.length, greaterThanOrEqualTo(85));
    for (final row in table.names.values) {
      expect(row.length, table.codes.length);
    }
    expect(table.names.length, greaterThanOrEqualTo(80));
  });

  test('names come in the interface language', () {
    expect(languageNameIn('ru', 'es'), 'Испанский');
    expect(languageNameIn('en', 'es'), 'Spanish');
    expect(languageNameIn('es', 'ru'), 'Ruso');
    expect(languageNameIn('ky', 'en'), 'Англисче');
  });

  test('unknown interface language falls back to the English name', () {
    expect(languageNameIn('xx', 'es'), 'Spanish');
    expect(languageNameIn('xx', 'qq'), isNull);
  });

  test('the sublabel is hidden when it would repeat the own name', () {
    expect(languageSublabel('ru', 'ru', 'Русский'), isNull);
    expect(languageSublabel('ru', 'es', 'Español'), 'Испанский');
  });
}
