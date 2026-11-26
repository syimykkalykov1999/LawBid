import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/features/chat/e2ee/e2ee_notice.dart';
import 'package:lawbid/features/chat/e2ee/safety_number.dart';

/// Item 25: the 60-digit security code (WhatsApp / Signal numeric
/// fingerprint over every device key of each person).
void main() {
  Uint8List key(int seed) =>
      Uint8List.fromList(List.generate(32, (i) => (i * 7 + seed) % 256));

  test('both phones show the same 60 digits; any key change changes them',
      () {
    final a = SafetyNumber.of(
      meId: 'ua',
      myKeys: [key(1)],
      otherId: 'ub',
      otherKeys: [key(2), key(3)],
    );
    final b = SafetyNumber.of(
      meId: 'ub',
      myKeys: [key(3), key(2)],
      otherId: 'ua',
      otherKeys: [key(1)],
    );
    expect(a, b);
    expect(a, matches(RegExp(r'^\d{60}$')));
    expect(SafetyNumber.groups(a), hasLength(12));
    final newDevice = SafetyNumber.of(
      meId: 'ua',
      myKeys: [key(1)],
      otherId: 'ub',
      otherKeys: [key(2), key(3), key(4)],
    );
    expect(newDevice, isNot(a));
  });

  test('the QR carries the code; foreign codes are refused', () {
    const digits =
        '123451234512345123451234512345123451234512345123451234512345';
    expect(SafetyNumber.fromQr(SafetyNumber.qrPayload(digits)), digits);
    expect(SafetyNumber.fromQr('https://example.com'), isNull);
    expect(SafetyNumber.fromQr('lawbid-sc:0:123'), isNull);
  });

  test('the notice goes above the first message sent after encryption', () {
    final on = DateTime.utc(2026, 11, 25, 12);
    expect(e2eeStartsAt(null, on, null), isFalse);
    expect(e2eeStartsAt(on, on.add(const Duration(minutes: 1)), null), isTrue);
    expect(
      e2eeStartsAt(
        on,
        on.add(const Duration(minutes: 1)),
        on.subtract(const Duration(hours: 1)),
      ),
      isTrue,
    );
    expect(
      e2eeStartsAt(
        on,
        on.add(const Duration(minutes: 2)),
        on.add(const Duration(minutes: 1)),
      ),
      isFalse,
    );
    expect(
      e2eeStartsAt(on, on.subtract(const Duration(minutes: 1)), null),
      isFalse,
    );
  });
}
