import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lawbid/core/l10n/app_language.dart';
import 'package:lawbid/core/l10n/l10n_formats.dart';
import 'package:lawbid/core/l10n/l10n_translator.dart';
import 'package:lawbid/core/l10n/native_digits.dart';

/// Owner 2026-10-15: in Nepali (and the other languages with their own
/// digits) numbers, prices, dates, times and counters inside texts are never
/// shown in 0-9.
Future<void> main() async {
  await initializeDateFormatting();
  final asciiDigit = RegExp('[0-9]');
  const own = ['ne', 'mr', 'bn', 'ar', 'fa', 'ps', 'my'];

  test("digits map to the language's own digits", () {
    expect(localizeDigits('Step 1 of 5 · 2026', 'ne'), 'Step १ of ५ · २०२६');
    expect(localizeDigits('12:30', 'ar'), '١٢:٣٠');
    expect(localizeDigits('12:30', 'fa'), '۱۲:۳۰');
    expect(localizeDigits('10', 'bn'), '১০');
    expect(localizeDigits('10', 'my'), '၁၀');
    // Languages that use 0-9 are left alone.
    expect(localizeDigits('2026', 'ru'), '2026');
    expect(localizeDigits('2026', 'hi'), '2026');
    expect(hasNativeDigits('ne'), isTrue);
    expect(hasNativeDigits('de'), isFalse);
  });

  for (final code in own) {
    test('$code: formats and texts carry no ASCII digit', () {
      final f = L10nFormats(AppLanguage.fromCode(code));
      final at = DateTime(2026, 10, 15, 14, 5);
      for (final s in [
        f.date(at),
        f.dateLong(at),
        f.dayMonth(at),
        f.time(at),
        f.dateTime(at),
        f.number(1234567.5),
        f.currencyFromCents(123456),
      ]) {
        expect(asciiDigit.hasMatch(s), isFalse, reason: '$code: $s');
      }
      final t = L10nTranslator(
        language: AppLanguage.fromCode(code),
        cache: const {'k': '{n} / {total}', 'p.other': '{count} items'},
      );
      expect(asciiDigit.hasMatch(t.t('k', {'n': '3', 'total': '5'})), isFalse);
      expect(asciiDigit.hasMatch(t.plural('p', 12)), isFalse);
    });
  }

  test('a language with Latin digits keeps them', () {
    final f = L10nFormats(AppLanguage.fromCode('de'));
    expect(asciiDigit.hasMatch(f.number(1234)), isTrue);
  });
}
