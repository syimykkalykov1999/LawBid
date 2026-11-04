import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/features/auth/domain/login_identifier.dart';

/// Owner 2026-11-03: the phone was typed as 2244224434 (10 digits, no +1) on
/// the password sign-in. It must reach the server as +12244224434, the same
/// way the code flow normalises it.
void main() {
  for (final raw in [
    '2244224434',
    '+12244224434',
    '(224) 422-4434',
    ' 224-422-4434 ',
    '12244224434',
  ]) {
    test('«$raw» -> +12244224434', () {
      final id = LoginIdentifier.tryParse(raw);
      expect(id, isNotNull);
      expect(id!.value, '+12244224434');
      expect(id.isEmail, isFalse);
    });
  }

  test('e-mail is lower-cased; garbage gives null (screen shows a message)',
      () {
    expect(
      LoginIdentifier.tryParse('Ann@Example.com')!.value,
      'ann@example.com',
    );
    expect(LoginIdentifier.tryParse('12345'), isNull);
    expect(LoginIdentifier.tryParse('abc'), isNull);
  });
}
