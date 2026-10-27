import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/platform/chat_notifications_channel.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  const name = 'lawbid/chat_notifications_test';
  final calls = <MethodCall>[];

  setUp(() {
    calls.clear();
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(const MethodChannel(name), (call) async {
      calls.add(call);
      return null;
    });
  });

  tearDown(() => debugDefaultTargetPlatformOverride = null);

  test('Android: the server and device token reach the notification buttons',
      () async {
    debugDefaultTargetPlatformOverride = TargetPlatform.android;
    final c = ChatNotificationsChannel(channel: const MethodChannel(name));
    await c.setPushActions(
      apiBase: 'https://api.lawbid.dev/api/v1',
      deviceToken: 'fcm-1',
    );
    expect(calls.single.method, 'setPushActions');
    expect(calls.single.arguments, {
      'url': 'https://api.lawbid.dev/api/v1',
      'token': 'fcm-1',
    });
  });

  test('other platforms: nothing is called', () async {
    debugDefaultTargetPlatformOverride = TargetPlatform.linux;
    final c = ChatNotificationsChannel(channel: const MethodChannel(name));
    await c.setPushActions(apiBase: 'x', deviceToken: 'y');
    expect(calls, isEmpty);
  });
}
