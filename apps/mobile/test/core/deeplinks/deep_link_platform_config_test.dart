import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/config/app_environment.dart';
import 'package:lawbid/core/deeplinks/deep_link.dart';

/// The native halves of deep linking (docs/01_FOUNDATION_AUTH.md §12): the
/// Dart parser is useless unless the OS actually hands the app these URLs.
/// `flutter test` runs from apps/mobile.
void main() {
  String read(String path) => File(path).readAsStringSync();

  test(
      'Android: lawbid:// scheme + verified App Links on the configurable host',
      () {
    final manifest = read('android/app/src/main/AndroidManifest.xml');
    expect(manifest, contains('<data android:scheme="lawbid" />'));
    expect(manifest, contains('android:autoVerify="true"'));
    expect(manifest, contains(r'<data android:host="${deepLinkHost}" />'));
    for (final p in [
      '/case/',
      '/lawyer/',
      '/attorneys/',
      '/post/',
      '/g/',
      '/c/',
    ]) {
      expect(manifest, contains('<data android:pathPrefix="$p" />'));
    }
    expect(manifest, contains('<data android:path="/auth/email-code" />'));
    // The /lawyers/ catalog tree stays in the browser.
    expect(manifest, isNot(contains('android:pathPrefix="/lawyers/"')));
    // app_links handles links, not Flutter's router deep linking.
    expect(manifest, contains('android:name="flutter_deeplinking_enabled"'));

    final gradle = read('android/app/build.gradle.kts');
    expect(gradle, contains('manifestPlaceholders["deepLinkHost"]'));
    expect(gradle, contains('"lawbid.dev"'));
  });

  test('iOS: lawbid URL scheme, Associated Domains from DEEP_LINK_HOST', () {
    final plist = read('ios/Runner/Info.plist');
    expect(plist, contains('<string>lawbid</string>'));
    expect(plist, contains('<key>FlutterDeepLinkingEnabled</key>\n\t<false/>'));
    final entitlements = read('ios/Runner/Runner.entitlements');
    expect(entitlements, contains('com.apple.developer.associated-domains'));
    expect(entitlements, contains(r'applinks:$(DEEP_LINK_HOST)'));
    // Owner 2026-10-22 (passkeys): the same domain for WebAuthn.
    expect(entitlements, contains(r'webcredentials:$(DEEP_LINK_HOST)'));
    expect(
      read('ios/Flutter/Common.xcconfig'),
      contains('DEEP_LINK_HOST = lawbid.dev'),
    );
    // The entitlements file is actually wired into every Runner config.
    final pbx = read('ios/Runner.xcodeproj/project.pbxproj');
    expect(
      'CODE_SIGN_ENTITLEMENTS = Runner/Runner.entitlements;'
          .allMatches(pbx)
          .length,
      9,
    );
  });

  test('Dart default host matches the native default', () {
    expect(AppEnvironment.defaultDeepLinkHost, 'lawbid.dev');
  });

  test(
      'hosting files (docs/deeplinks, published by seo-deploy) cover the prod app and every path',
      () {
    final aasa =
        jsonDecode(read('../../docs/deeplinks/apple-app-site-association'))
            as Map<String, dynamic>;
    final details =
        ((aasa['applinks'] as Map<String, dynamic>)['details'] as List).single
            as Map<String, dynamic>;
    expect(details['appIDs'], {'78T56RPM74.com.lawbid.lawbid'});
    final paths = (details['components'] as List)
        .map((c) => (c as Map<String, dynamic>)['/'])
        .toSet();
    expect(
      paths,
      {
        '/r/*',
        '/case/*',
        '/lawyer/*',
        '/attorneys/*',
        '/post/*',
        '/u/*',
        '/q/*',
        '/g/*',
        '/c/*',
        '/auth/email-code',
      },
    );
    // Owner 2026-10-22 (passkeys): iOS lets the app use lawbid.dev passkeys.
    expect(
      (aasa['webcredentials'] as Map<String, dynamic>)['apps'],
      ['78T56RPM74.com.lawbid.lawbid'],
    );

    final assetlinks =
        jsonDecode(read('../../docs/deeplinks/assetlinks.json')) as List;
    final packages = assetlinks
        .map(
          (e) => ((e as Map<String, dynamic>)['target']
              as Map<String, dynamic>)['package_name'],
        )
        .toSet();
    expect(packages, {'com.lawbid.lawbid'});
    for (final e in assetlinks.cast<Map<String, dynamic>>()) {
      expect(e['relation'], [
        'delegate_permission/common.handle_all_urls',
        // Owner 2026-10-22 (passkeys): Android passkeys for lawbid.dev.
        'delegate_permission/common.get_login_creds',
      ]);
    }
  });

  test('every path the phone hands over is one the app understands', () {
    // Owner 2026-10-20: a QR code / link the OS opens in the app must land on
    // a screen, not on the home tab: each published path parses.
    const samples = {
      '/r/*': 'r/ABCD1234',
      '/case/*': 'case/7b1f2c3d-0000-4000-8000-000000000001',
      '/lawyer/*': 'lawyer/jane_doe',
      '/attorneys/*': 'attorneys/jane_doe',
      '/post/*': 'post/7b1f2c3d-0000-4000-8000-000000000002',
      '/u/*': 'u/jane_doe',
      '/q/*': 'q/Xk3_aB-9Qz1LmN4pR7sT0w',
      '/g/*': 'g/Xk3_aB-9Qz1LmN4pR7sT0w',
      '/c/*': 'c/tax_news',
    };
    final aasa =
        jsonDecode(read('../../docs/deeplinks/apple-app-site-association'))
            as Map<String, dynamic>;
    final details =
        ((aasa['applinks'] as Map<String, dynamic>)['details'] as List).single
            as Map<String, dynamic>;
    final published = (details['components'] as List)
        .map((c) => (c as Map<String, dynamic>)['/'] as String)
        .where((p) => p.endsWith('*'));
    for (final path in published) {
      final sample = samples[path];
      expect(sample, isNotNull, reason: 'no sample for $path');
      for (final url in ['https://lawbid.dev/$sample', 'lawbid://$sample']) {
        expect(
          parseDeepLink(Uri.parse(url), host: 'lawbid.dev'),
          isNotNull,
          reason: url,
        );
      }
    }
  });
}
