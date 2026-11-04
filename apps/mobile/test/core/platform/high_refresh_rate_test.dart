import 'package:flutter/foundation.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/platform/high_refresh_rate.dart';

void main() {
  late int calls;
  late List<String> logs;

  setUp(() {
    calls = 0;
    logs = [];
    HighRefreshRate.request = () async => calls++;
    HighRefreshRate.log = logs.add;
  });

  tearDown(() => debugDefaultTargetPlatformOverride = null);

  test('Android asks the system for the highest refresh rate', () async {
    debugDefaultTargetPlatformOverride = TargetPlatform.android;
    expect(await HighRefreshRate.enable(), isTrue);
    expect(calls, 1);
  });

  test('iOS does not call the plugin', () async {
    debugDefaultTargetPlatformOverride = TargetPlatform.iOS;
    expect(await HighRefreshRate.enable(), isFalse);
    expect(calls, 0);
  });

  test('a failing plugin is logged, never thrown', () async {
    debugDefaultTargetPlatformOverride = TargetPlatform.android;
    HighRefreshRate.request = () async => throw StateError('no modes');
    expect(await HighRefreshRate.enable(), isFalse);
    expect(logs.single, contains('no modes'));
  });
}
