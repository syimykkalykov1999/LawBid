import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/platform/chat_notifications_channel.dart';

/// Owner 2026-10-22 (message pushes like WhatsApp): what the app tells the
/// phone's own chat notifications, and the chat a tapped one opens.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  const channel = MethodChannel('lawbid/chat_notifications-test');
  final calls = <MethodCall>[];
  final messenger =
      TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger;

  setUp(() {
    calls.clear();
    messenger.setMockMethodCallHandler(channel, (call) async {
      calls.add(call);
      if (call.method == 'pendingOpen') {
        return {'type': 'new_message', 'conversationId': 'c1', 'x': 1};
      }
      return null;
    });
  });

  tearDown(() => messenger.setMockMethodCallHandler(channel, null));

  test('saved phone-book names go to the platform, blanks skipped', () async {
    final names = contactNamesForPush([
      (userId: 'u1', phoneName: ' Мама '),
      (userId: 'u2', phoneName: ''),
      (userId: 'u3', phoneName: 'Адвокат Иванов'),
    ]);
    expect(names, {'u1': 'Мама', 'u3': 'Адвокат Иванов'});
    await ChatNotificationsChannel(channel: channel).setContactNames(names);
    expect(calls.single.method, 'setContactNames');
    expect(calls.single.arguments, {'names': names});
  });

  test('an opened chat clears its notification; sign-out clears all',
      () async {
    final c = ChatNotificationsChannel(channel: channel);
    await c.clearChat('c1');
    await c.clearAll();
    expect(calls.map((m) => m.method), ['clear', 'clearAll']);
    expect(calls.first.arguments, {'conversationId': 'c1'});
  });

  test('the chat the app was started from (strings only)', () async {
    final open =
        await ChatNotificationsChannel(channel: channel).takeLaunchOpen();
    expect(open, {'type': 'new_message', 'conversationId': 'c1'});
  });

  test('a tap while the app runs reaches the stream', () async {
    final c = ChatNotificationsChannel(channel: channel);
    final first = c.opens.first;
    await messenger.handlePlatformMessage(
      channel.name,
      const StandardMethodCodec().encodeMethodCall(
        const MethodCall('open', {'type': 'new_message', 'groupId': 'g1'}),
      ),
      (_) {},
    );
    expect(await first, {'type': 'new_message', 'groupId': 'g1'});
  });

  test('a build without the channel is a quiet no-op', () async {
    const missing = MethodChannel('lawbid/chat_notifications-none');
    final c = ChatNotificationsChannel(channel: missing);
    await c.clearChat('c1');
    expect(await c.takeLaunchOpen(), isNull);
  });
}
