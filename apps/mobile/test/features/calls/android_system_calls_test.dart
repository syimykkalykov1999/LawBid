import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/feature_flags/default_feature_flags.dart';
import 'package:lawbid/features/calls/application/call_controller.dart';
import 'package:lawbid/features/calls/application/call_foreground.dart';
import 'package:lawbid/features/calls/application/callkit_bridge.dart';

/// Owner 26.11: Android calls are system calls (Telecom, native
/// SystemCalls.kt). What Dart sends on `lawbid/call_service`.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  const channel = MethodChannel('lawbid/call_service');
  late List<MethodCall> calls;

  setUp(() {
    calls = [];
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(channel, (call) async {
      calls.add(call);
      return call.method == 'start' ? true : null;
    });
  });

  tearDown(() {
    debugDefaultTargetPlatformOverride = null;
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(channel, null);
  });

  test('the switch is off by default (until checked on a phone)', () {
    expect(kAndroidSystemCallsFlag, 'calls_android_telecom');
    expect(defaultFeatureFlags[kAndroidSystemCallsFlag], isFalse);
  });

  test('a ring on Android is watched natively (headset / car answer)',
      () async {
    await watchSystemRing(
      'c1',
      const Duration(seconds: 45),
      platform: TargetPlatform.android,
    );
    expect(calls.single.method, 'watchRing');
    expect(calls.single.arguments, {'id': 'c1', 'ringMs': 45000});
  });

  test('iOS has CallKit: nothing is watched', () async {
    await watchSystemRing(
      'c1',
      const Duration(seconds: 45),
      platform: TargetPlatform.iOS,
    );
    expect(calls, isEmpty);
  });

  test('no host (the push isolate): the watch never throws', () async {
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(channel, null);
    await watchSystemRing(
      'c1',
      const Duration(seconds: 45),
      platform: TargetPlatform.android,
    );
  });

  test('the ongoing call carries its id, direction and end cause', () async {
    debugDefaultTargetPlatformOverride = TargetPlatform.android;
    final fg = CallForeground();
    await fg.start(name: 'Paul', id: 'c1', outgoing: true, since: 5);
    await fg.setSystemCalls(on: true);
    await fg.route('speaker');
    await fg.stop(cause: 'ended');
    await fg.stop();
    expect(calls.map((c) => c.method), [
      'start',
      'setSystemCalls',
      'route',
      'stop',
      'stop',
    ]);
    final start = calls[0].arguments as Map;
    expect(start['id'], 'c1');
    expect(start['outgoing'], isTrue);
    expect(calls[1].arguments, {'on': true});
    expect(calls[2].arguments, {'kind': 'speaker'});
    expect(calls[3].arguments, {'cause': 'ended'});
    expect(calls[4].arguments, <String, Object?>{});
  });

  test('not Android: the service channel is never called', () async {
    debugDefaultTargetPlatformOverride = TargetPlatform.iOS;
    final fg = CallForeground();
    await fg.setSystemCalls(on: true);
    await fg.route('speaker');
    await fg.stop(cause: 'ended');
    expect(calls, isEmpty);
  });
}
