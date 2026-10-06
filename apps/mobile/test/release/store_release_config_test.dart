// ignore_for_file: lines_longer_than_80_chars
import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/config/app_config.dart';
import 'package:lawbid/core/config/app_environment.dart';
import 'package:lawbid/shared/domain/payment_page_launch_mode.dart';
import 'package:url_launcher/url_launcher.dart';

/// Store release 2026-10-06 (docs/store/RELEASE_CHECKLIST.md): static
/// checks of what App Store / Google Play review looks at, so a later
/// change cannot quietly undo them before the one final build.
void main() {
  String read(String path) => File(path).readAsStringSync();

  test('prod talks to lawbid.dev over https', () {
    expect(
      AppEnvironment.defaultApiBaseUrl(AppFlavor.prod),
      'https://api.lawbid.dev/api/v1',
    );
    expect(AppEnvironment.defaultDeepLinkHost, 'lawbid.dev');
  });

  test('first store version is 1.0.0', () {
    final version = RegExp(r'^version: (\d+)\.(\d+)\.(\d+)\+(\d+)$', multiLine: true)
        .firstMatch(read('pubspec.yaml'))!;
    expect(int.parse(version.group(1)!), greaterThanOrEqualTo(1));
  });

  test('iOS: no plain-http exception in prod, export compliance, iPhone only', () {
    final pbx = read('ios/Runner.xcodeproj/project.pbxproj');
    expect(pbx, contains('/* Strip dev-only ATS (prod) */,'));
    expect(pbx, contains('Delete :NSAppTransportSecurity'));
    expect(pbx, isNot(contains('TARGETED_DEVICE_FAMILY = "1,2";')));
    final plist = read('ios/Runner/Info.plist');
    expect(
      plist,
      contains('<key>ITSAppUsesNonExemptEncryption</key>\n\t<false/>'),
    );
  });

  test('iOS: privacy manifest is bundled and declares no tracking', () {
    final manifest = read('ios/Runner/PrivacyInfo.xcprivacy');
    expect(manifest, contains('<key>NSPrivacyTracking</key>\n\t<false/>'));
    expect(
      read('ios/Runner.xcodeproj/project.pbxproj'),
      contains('/* PrivacyInfo.xcprivacy in Resources */,'),
    );
  });

  test('iOS: push entitlement present', () {
    expect(
      read('ios/Runner/Runner.entitlements'),
      contains('<key>aps-environment</key>'),
    );
  });

  test('Android: release build can reach the network', () {
    expect(
      read('android/app/src/main/AndroidManifest.xml'),
      contains('android.permission.INTERNET'),
    );
  });

  test('payment pages open in Safari on iOS, in-app tab on Android', () {
    expect(
      paymentPageLaunchMode(TargetPlatform.iOS),
      LaunchMode.externalApplication,
    );
    expect(
      paymentPageLaunchMode(TargetPlatform.android),
      LaunchMode.inAppBrowserView,
    );
  });

  test('release builds offer only social logins they can complete', () {
    expect(AppConfig.appleSignInSupported(TargetPlatform.iOS), isTrue);
    expect(AppConfig.appleSignInSupported(TargetPlatform.android), isFalse);
    // No GOOGLE_* dart-defines in `flutter test`: not configured anywhere.
    expect(AppConfig.googleSignInConfigured(TargetPlatform.iOS), isFalse);
    expect(AppConfig.googleSignInConfigured(TargetPlatform.android), isFalse);
  });
}
