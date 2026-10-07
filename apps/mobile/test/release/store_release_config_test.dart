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

  test('build number is automatic on every path (no manual bump, no repeats)', () {
    // pubspec keeps +1 = "automatic"; Android and iOS replace it with the
    // minutes since 2026-01-01 UTC, the same formula on both.
    expect(read('pubspec.yaml'), contains(RegExp(r'^version: \d+\.\d+\.\d+\+1$', multiLine: true)));
    final gradle = read('android/app/build.gradle.kts');
    expect(gradle, contains('versionCode = flutter.versionCode.takeIf { it != 1 } ?: autoBuildNumber()'));
    expect(gradle, contains('System.currentTimeMillis() / 1000 - 1767225600L) / 60'));
    final pbx = read('ios/Runner.xcodeproj/project.pbxproj');
    expect(pbx, contains('/* Auto build number */,'));
    expect(pbx, contains(r'Set :CFBundleVersion $(( ($(date -u +%s) - 1767225600) / 60 ))'));
    // CI and fastlane must not pin a small counter that would sort below a
    // Mac build already uploaded.
    expect(read('../../.github/workflows/mobile-release.yml'), isNot(contains('run_number')));
    for (final lane in ['ios/fastlane/Fastfile', 'android/fastlane/Fastfile']) {
      expect(read(lane), isNot(contains("ENV.fetch('BUILD_NUMBER', '1')")), reason: lane);
    }
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

  test('store listings: every language fits the store limits and keeps the disclaimer', () {
    // ios/fastlane/metadata and android/fastlane/metadata/android are
    // uploaded by `fastlane ios metadata` / `fastlane android metadata`.
    // Limits: App Store name/subtitle 30, keywords 100, promo 170,
    // description 4000; Google Play title 30, short 80, full 4000.
    const ios = {
      'name.txt': 30,
      'subtitle.txt': 30,
      'keywords.txt': 100,
      'promotional_text.txt': 170,
      'description.txt': 4000,
    };
    const play = {
      'title.txt': 30,
      'short_description.txt': 80,
      'full_description.txt': 4000,
    };
    var checked = 0;
    void checkDir(String root, Map<String, int> limits, int minLocales) {
      final locales = Directory(root).listSync().whereType<Directory>().toList();
      expect(locales.length, greaterThanOrEqualTo(minLocales), reason: root);
      for (final dir in locales) {
        for (final entry in limits.entries) {
          final text = File('${dir.path}/${entry.key}').readAsStringSync().trim();
          final length = text.runes.length;
          expect(length, inInclusiveRange(1, entry.value), reason: '${dir.path}/${entry.key}');
          checked++;
        }
        final name = File('${dir.path}/${limits.keys.first}').readAsStringSync();
        expect(name, startsWith('LawBid'), reason: dir.path);
        final description = File('${dir.path}/${limits.keys.last}').readAsStringSync();
        expect(description, contains('https://lawbid.dev/privacy'), reason: dir.path);
      }
    }

    checkDir('ios/fastlane/metadata', ios, 39);
    checkDir('android/fastlane/metadata/android', play, 80);
    expect(checked, greaterThan(0));
    for (final dir in Directory('ios/fastlane/metadata').listSync().whereType<Directory>()) {
      final keywords = File('${dir.path}/keywords.txt').readAsStringSync().trim();
      expect(keywords, isNot(contains(', ')), reason: dir.path);
    }
  });
}
