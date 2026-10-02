// ignore_for_file: lines_longer_than_80_chars
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/config/app_environment.dart';

/// Static checks of the three side-by-side variants (p12 leaf-1.4). The
/// real proof is `node tool/verify_flavors.mjs android|ios`, which builds
/// each flavor and inspects the artifact; these keep the config from
/// drifting between runs of that slow script.
void main() {
  String read(String path) => File(path).readAsStringSync();

  const flavors = {
    'dev': ('com.lawbid.lawbid.dev', 'LawBid'),
    'staging': ('com.lawbid.lawbid.staging', 'LawBid Staging'),
    'prod': ('com.lawbid.lawbid', 'LawBid'),
  };

  test('AppEnvironment: names, API defaults, dart-define override', () {
    for (final f in AppFlavor.values) {
      final env = AppEnvironment.forFlavor(f);
      expect(env.appName, flavors[f.name]!.$2);
      expect(env.apiBaseUrl, AppEnvironment.defaultApiBaseUrl(f));
    }
    expect(
      AppEnvironment.defaultApiBaseUrl(AppFlavor.prod),
      'https://api.lawbid.app/api/v1',
    );
    expect(
      AppEnvironment.forFlavor(
        AppFlavor.prod,
        apiBaseUrlOverride: 'https://x.test/api/v1',
      ).apiBaseUrl,
      'https://x.test/api/v1',
    );
    expect(AppEnvironment.forFlavor(AppFlavor.prod).isProd, isTrue);
  });

  test('entry points exist per flavor; main.dart is dev', () {
    for (final f in flavors.keys) {
      expect(read('lib/main_$f.dart'), contains('runLawBid(AppFlavor.$f)'));
      expect(
        File('config/$f.example.json').existsSync(),
        isTrue,
        reason: 'config/$f.example.json',
      );
    }
    expect(
      read('lib/main.dart'),
      contains("import 'package:lawbid/main_dev.dart'"),
    );
  });

  test('Android: minSdk 26, env flavors with suffix + label, manifest label',
      () {
    final gradle = read('android/app/build.gradle.kts');
    expect(RegExp(r'minSdk\s*=\s*(\d+)').firstMatch(gradle)!.group(1), '26');
    expect(gradle, contains('applicationId = "com.lawbid.lawbid"'));
    expect(gradle, contains('flavorDimensions += "env"'));
    expect(gradle, contains('applicationIdSuffix = ".dev"'));
    expect(gradle, contains('applicationIdSuffix = ".staging"'));
    for (final f in flavors.entries) {
      expect(gradle, contains('create("${f.key}")'));
      expect(
        gradle,
        contains('resValue("string", "app_name", "${f.value.$2}")'),
      );
    }
    expect(
      read('android/app/src/main/AndroidManifest.xml'),
      contains('android:label="@string/app_name"'),
    );
  });

  test(
      'iOS: 9 flavor configs, 3 schemes, bundle id + display name per flavor, CocoaPods mapping',
      () {
    final pbx = read('ios/Runner.xcodeproj/project.pbxproj');
    final podfile = read('ios/Podfile');
    for (final f in flavors.entries) {
      for (final mode in ['Debug', 'Profile', 'Release']) {
        final config = '$mode-${f.key}';
        expect(pbx, contains('name = "$config";'));
        expect(podfile, contains("'$config' =>"));
        expect(File('ios/Flutter/$config.xcconfig').existsSync(), isTrue);
      }
      final scheme =
          read('ios/Runner.xcodeproj/xcshareddata/xcschemes/${f.key}.xcscheme');
      expect(scheme, contains('buildConfiguration = "Debug-${f.key}"'));
      expect(scheme, contains('buildConfiguration = "Release-${f.key}"'));
      expect(pbx, contains('PRODUCT_BUNDLE_IDENTIFIER = ${f.value.$1};'));
    }
    expect(pbx, contains('APP_DISPLAY_NAME = "LawBid Staging";'));
    expect(pbx, contains('APP_DISPLAY_NAME = LawBid;'));
    expect(
      read('ios/Runner/Info.plist'),
      contains(r'<string>$(APP_DISPLAY_NAME)</string>'),
    );
  });

  test('pubspec: default flavor dev + platform packages', () {
    final pubspec = read('pubspec.yaml');
    expect(pubspec, contains('default-flavor: dev'));
    for (final pkg in [
      'package_info_plus',
      'app_links',
      'smart_auth',
      'url_launcher',
    ]) {
      expect(pubspec, contains('  $pkg:'));
    }
  });
}
