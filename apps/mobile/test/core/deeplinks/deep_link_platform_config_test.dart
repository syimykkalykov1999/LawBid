import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/config/app_environment.dart';

/// The native halves of deep linking (docs/01_FOUNDATION_AUTH.md §12): the
/// Dart parser is useless unless the OS actually hands the app these URLs.
/// `flutter test` runs from apps/mobile.
void main() {
  String read(String path) => File(path).readAsStringSync();

  test('Android: lawbid:// scheme + verified App Links on the configurable host', () {
    final manifest = read('android/app/src/main/AndroidManifest.xml');
    expect(manifest, contains('<data android:scheme="lawbid" />'));
    expect(manifest, contains('android:autoVerify="true"'));
    expect(manifest, contains(r'<data android:host="${deepLinkHost}" />'));
    for (final p in ['/case/', '/lawyer/', '/post/']) {
      expect(manifest, contains('<data android:pathPrefix="$p" />'));
    }
    expect(manifest, contains('<data android:path="/auth/email-code" />'));
    // app_links handles links, not Flutter's router deep linking.
    expect(manifest, contains('android:name="flutter_deeplinking_enabled"'));

    final gradle = read('android/app/build.gradle.kts');
    expect(gradle, contains('manifestPlaceholders["deepLinkHost"]'));
    expect(gradle, contains('"lawbid.app"'));
  });

  test('iOS: lawbid URL scheme, Associated Domains from DEEP_LINK_HOST', () {
    final plist = read('ios/Runner/Info.plist');
    expect(plist, contains('<string>lawbid</string>'));
    expect(plist, contains('<key>FlutterDeepLinkingEnabled</key>\n\t<false/>'));
    final entitlements = read('ios/Runner/Runner.entitlements');
    expect(entitlements, contains('com.apple.developer.associated-domains'));
    expect(entitlements, contains(r'applinks:$(DEEP_LINK_HOST)'));
    expect(read('ios/Flutter/Common.xcconfig'), contains('DEEP_LINK_HOST = lawbid.app'));
    // The entitlements file is actually wired into every Runner config.
    final pbx = read('ios/Runner.xcodeproj/project.pbxproj');
    expect(
      'CODE_SIGN_ENTITLEMENTS = Runner/Runner.entitlements;'.allMatches(pbx).length,
      9,
    );
  });

  test('Dart default host matches the native default', () {
    expect(AppEnvironment.defaultDeepLinkHost, 'lawbid.app');
  });

  test('hosting templates (docs/deeplinks) cover every flavor and path', () {
    final aasa = jsonDecode(read('../../docs/deeplinks/apple-app-site-association')) as Map<String, dynamic>;
    final details = ((aasa['applinks'] as Map<String, dynamic>)['details'] as List).single as Map<String, dynamic>;
    expect(details['appIDs'], {
      'TEAM_ID.com.lawbid.lawbid',
      'TEAM_ID.com.lawbid.lawbid.staging',
      'TEAM_ID.com.lawbid.lawbid.dev',
    });
    final paths = (details['components'] as List).map((c) => (c as Map<String, dynamic>)['/']).toSet();
    expect(paths, {'/case/*', '/lawyer/*', '/post/*', '/auth/email-code'});

    final assetlinks = jsonDecode(read('../../docs/deeplinks/assetlinks.json')) as List;
    final packages = assetlinks
        .map((e) => ((e as Map<String, dynamic>)['target'] as Map<String, dynamic>)['package_name'])
        .toSet();
    expect(packages, {'com.lawbid.lawbid', 'com.lawbid.lawbid.staging', 'com.lawbid.lawbid.dev'});
    for (final e in assetlinks.cast<Map<String, dynamic>>()) {
      expect(e['relation'], ['delegate_permission/common.handle_all_urls']);
    }
  });
}
