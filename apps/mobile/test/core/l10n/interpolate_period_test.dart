import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/l10n/plural_rules.dart';

void main() {
  test('a value ending with a period does not double the sentence period', () {
    expect(
      interpolate('Списание {price} — {date}.', {
        'price': r'499 $',
        'date': '19 окт. 2026 г.',
      }),
      r'Списание 499 $ — 19 окт. 2026 г.',
    );
    expect(interpolate('Until {date}.', {'date': 'Oct 19'}), 'Until Oct 19.');
  });

  test('an empty value leaves no space before the punctuation', () {
    expect(
      interpolate('Закроется автоматически {date}.', {'date': ''}),
      'Закроется автоматически.',
    );
  });
}
