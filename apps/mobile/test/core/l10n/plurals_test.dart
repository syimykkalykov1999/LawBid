import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/l10n/app_language.dart';
import 'package:lawbid/core/l10n/l10n_translator.dart';
import 'package:lawbid/core/l10n/plural_rules.dart';

/// G2 (leaf-1.5): docs/01_FOUNDATION_AUTH.md §9.2 "Плюрализация: ключи с
/// суффиксами `.one`, `.few`, `.many`, `.other` (правила CLDR)".
void main() {
  const nbsp = ' ';

  group('CLDR categories', () {
    test('English: one for exactly 1, other for everything else', () {
      expect(pluralCategoryOf('en', 1), PluralCategory.one);
      for (final n in [0, 2, 5, 11, 21, 101]) {
        expect(
          pluralCategoryOf('en', n),
          PluralCategory.other,
          reason: 'en $n',
        );
      }
      expect(pluralCategoryOf('en', 1.5), PluralCategory.other);
    });

    test('Russian: one / few / many / other', () {
      const cases = {
        1: PluralCategory.one,
        21: PluralCategory.one,
        101: PluralCategory.one,
        2: PluralCategory.few,
        3: PluralCategory.few,
        4: PluralCategory.few,
        22: PluralCategory.few,
        34: PluralCategory.few,
        0: PluralCategory.many,
        5: PluralCategory.many,
        11: PluralCategory.many,
        12: PluralCategory.many,
        14: PluralCategory.many,
        25: PluralCategory.many,
        111: PluralCategory.many,
        100: PluralCategory.many,
      };
      cases.forEach((n, category) {
        expect(pluralCategoryOf('ru', n), category, reason: 'ru $n');
      });
      expect(
        pluralCategoryOf('ru', 1.5),
        PluralCategory.other,
        reason: 'fractions are other',
      );
    });
  });

  group('Translator.plural', () {
    const ruBundle = {
      'cases.count.one': '{count} дело',
      'cases.count.few': '{count} дела',
      'cases.count.many': '{count} дел',
      'cases.count.other': '{count} дела',
    };
    const enBundle = {
      'cases.count.one': '{count} case',
      'cases.count.other': '{count} cases',
    };

    final ru = L10nTranslator(
      language: AppLanguage.ru,
      cache: ruBundle,
      englishCache: enBundle,
    );
    final en = L10nTranslator(language: AppLanguage.en, cache: enBundle);

    test('Russian picks the CLDR form and formats {count} for ru', () {
      expect(ru.plural('cases.count', 1), '1 дело');
      expect(ru.plural('cases.count', 21), '21 дело');
      expect(ru.plural('cases.count', 3), '3 дела');
      expect(ru.plural('cases.count', 5), '5 дел');
      expect(ru.plural('cases.count', 11), '11 дел');
      expect(ru.plural('cases.count', 1.5), '1,5 дела');
      expect(ru.plural('cases.count', 1234), '1${nbsp}234 дела');
    });

    test('English picks one/other and formats {count} for en', () {
      expect(en.plural('cases.count', 1), '1 case');
      expect(en.plural('cases.count', 0), '0 cases');
      expect(en.plural('cases.count', 2), '2 cases');
      expect(en.plural('cases.count', 1234), '1,234 cases');
    });

    test('a missing category falls back to .other of the same language', () {
      final partial = L10nTranslator(
        language: AppLanguage.ru,
        cache: const {'x.one': '{count} штука', 'x.other': '{count} шт.'},
      );
      expect(partial.plural('x', 1), '1 штука');
      expect(partial.plural('x', 5), '5 шт.', reason: 'many missing → other');
    });

    test('a language without the key falls back to English with English rules',
        () {
      final es = L10nTranslator(
        language: AppLanguage.fromCode('es'),
        cache: const {},
        englishCache: enBundle,
      );
      expect(es.plural('cases.count', 1), '1 case');
      expect(es.plural('cases.count', 3), '3 cases');
    });

    test('explicit params override {count}; unknown key never renders blank',
        () {
      expect(en.plural('cases.count', 3, {'count': 'three'}), 'three cases');
      expect(en.plural('no.such.key', 2), 'no.such.key.other');
    });
  });
}
