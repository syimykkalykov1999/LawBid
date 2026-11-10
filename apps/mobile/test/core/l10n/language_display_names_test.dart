import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/l10n/language_catalog.dart';
import 'package:lawbid/core/l10n/language_display_names.dart';

/// Sweep C-c6 (SYSTEMS_CHECKLIST §16): the pickers' second line is the
/// language's name in the app's language (CLDR), not always English.
void main() {
  test('every shipped language has a row of names, one per language', () {
    expect(kLanguageDisplayCodes, contains('ky'));
    expect(kLanguageDisplayCodes.length, greaterThanOrEqualTo(85));
    for (final row in kLanguageDisplayNames.values) {
      expect(row.length, kLanguageDisplayCodes.length);
    }
    expect(kLanguageDisplayNames.length, greaterThanOrEqualTo(80));
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
