import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/feature_flags/feature_flags_state.dart';

/// Owner 2026-11-09 (FR D-c2): the text-message consent wording the admin
/// keeps under «Соответствие» reaches the phone screen through
/// `/config/bootstrap` → app_config; absent or blank = the app's own
/// translated string.
void main() {
  test('no admin wording: null, so the translated string is shown', () {
    const s = FeatureFlagsState(flags: {}, appConfig: {});
    expect(s.configText(kSmsDisclosureTextConfig), isNull);
    const blank = FeatureFlagsState(
      flags: {},
      appConfig: {kSmsDisclosureTextConfig: '   '},
    );
    expect(blank.configText(kSmsDisclosureTextConfig), isNull);
  });

  test('the admin wording wins, trimmed; the version rides along', () {
    const s = FeatureFlagsState(
      flags: {},
      appConfig: {
        kSmsDisclosureTextConfig: '  Reply STOP to cancel.  ',
        kSmsDisclosureVersionConfig: 'sms-v2',
      },
    );
    expect(s.configText(kSmsDisclosureTextConfig), 'Reply STOP to cancel.');
    expect(s.configText(kSmsDisclosureVersionConfig), 'sms-v2');
  });

  test('the keys match the server (bootstrap.service.ts smsDisclosureKeys)', () {
    expect(kSmsDisclosureTextConfig, 'compliance.sms.disclosure_text');
    expect(kSmsDisclosureVersionConfig, 'compliance.sms.disclosure_version');
  });
}
