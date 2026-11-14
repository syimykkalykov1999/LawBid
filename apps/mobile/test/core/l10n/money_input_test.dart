import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/l10n/money_input.dart';

// Detective R2 item 3 (14.11): «1,500» was read as $1.50 and «1,500.50»
// not at all (`replaceAll(',', '.')` + `double.tryParse`).
void main() {
  int? en(String s) => parseMoneyCents(s, locale: 'en');
  int? ru(String s) => parseMoneyCents(s, locale: 'ru');

  test('en: US thousands and decimals', () {
    expect(en('1,500'), 150000);
    expect(en('1,500.50'), 150050);
    expect(en('1500.5'), 150050);
    expect(en('1,250,000'), 125000000);
    expect(en('12,50'), 1250, reason: 'a comma before 2 digits is decimal');
    expect(en(' 1 500.50 '), 150050);
  });

  test('ru: space grouping, comma decimal, a typed dot too', () {
    expect(ru('1 500,50'), 150050);
    expect(ru('1 500,50'), 150050);
    expect(ru('1500,5'), 150050);
    expect(ru('1500.5'), 150050);
    expect(ru('1.500'), 150000);
  });

  test('not an amount', () {
    expect(en(''), isNull);
    expect(en('0'), isNull);
    expect(en('abc'), isNull);
    expect(ru('-5'), isNull);
  });

  test('the old parser was wrong on these (regression proof)', () {
    int? old(String s) {
      final v = double.tryParse(s.replaceAll(',', '.').trim());
      return v == null || v <= 0 ? null : (v * 100).round();
    }

    expect(old('1,500'), 150, reason: r'$1.50 instead of $1,500');
    expect(old('1,500.50'), isNull);
    expect(en('1,500'), 150000);
  });
}
