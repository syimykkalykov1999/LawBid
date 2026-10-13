import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/features/contacts_sync/data/phone_numbers.dart';

void main() {
  test('normalizes common formats to E.164', () {
    expect(normalizeToE164('+1 (415) 555-2680'), '+14155552680');
    expect(normalizeToE164('4155552680'), '+14155552680');
    expect(normalizeToE164('14155552680'), '+14155552680');
    expect(normalizeToE164('0044 20 7946 0958'), '+442079460958');
    expect(normalizeToE164('+1 415 555 2680 x12'), '+14155552680');
  });

  test('skips what it cannot place', () {
    expect(normalizeToE164('555-2680'), isNull);
    expect(normalizeToE164('abc'), isNull);
    expect(normalizeToE164(''), isNull);
  });

  test('hashes are 64 lowercase hex and exclude the own number', () {
    final h = contactHashes(
      ['+14155552680', '415-555-2681', '(415) 555-2680'],
      ownNumber: '+14155552681',
    );
    expect(h.length, 1);
    expect(RegExp(r'^[0-9a-f]{64}$').hasMatch(h.first), isTrue);
  });
}
