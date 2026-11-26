import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/features/onboarding/domain/current_user.dart';
import 'package:lawbid/shared/domain/user_role.dart';

import '../../../helpers/fixtures.dart';

/// Owner 25.11 («по умолчанию SMS», `auth.code_channel`): the confirmation
/// code goes to the channel the server names if that contact is verified,
/// else to the other verified one — the server's own rule.
void main() {
  final both = meFixture(
    role: UserRole.client,
    consents: true,
    phone: '+15551234567',
    phoneVerified: true,
    email: 'ann@example.com',
    emailVerified: true,
  );

  test('the phone by default, the e-mail when the server says so', () {
    expect(
      both.codeTarget(preferEmail: false),
      (channel: 'phone', identifier: '+15551234567'),
    );
    expect(
      both.codeTarget(preferEmail: true),
      (channel: 'email', identifier: 'ann@example.com'),
    );
  });

  test('the other verified contact when the chosen one is missing', () {
    final phoneOnly = meFixture(
      role: UserRole.client,
      consents: true,
      phone: '+15551234567',
      phoneVerified: true,
      email: 'ann@example.com',
    );
    expect(
      phoneOnly.codeTarget(preferEmail: true),
      (channel: 'phone', identifier: '+15551234567'),
    );
    final none = meFixture(role: UserRole.client, consents: true);
    expect(none.codeTarget(preferEmail: false), isNull);
  });

  test('the target line: «+1 ••• 67» for a phone, the e-mail as is', () {
    expect(
      codeTargetLabel((channel: 'phone', identifier: '+15551234567')),
      '+1 ••• 67',
    );
    expect(
      codeTargetLabel((channel: 'phone', identifier: '+447911123456')),
      '+44 ••• 56',
    );
    expect(
      codeTargetLabel((channel: 'email', identifier: 'ann@example.com')),
      'ann@example.com',
    );
  });
}
