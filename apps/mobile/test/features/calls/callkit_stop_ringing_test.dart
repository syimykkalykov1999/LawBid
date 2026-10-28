import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/features/calls/application/callkit_bridge.dart';

/// Owner 2026-10-26 (Samsung kept ringing after the caller hung up): the
/// «call_ended» push stops the system ringing screen at once — Android's
/// background isolate ends the plugin's call (its CallStyle notification,
/// ringtone and Telecom ConnectionService call go with it); a call this
/// phone answered is never ended by a mere «stop ringing».
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  const channel = MethodChannel('flutter_callkit_incoming');
  late List<MethodCall> seen;
  late List<Map<String, Object?>> active;

  setUp(() {
    seen = [];
    active = [];
    debugDefaultTargetPlatformOverride = TargetPlatform.android;
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(channel, (call) async {
      seen.add(call);
      if (call.method == 'activeCalls') return active;
      return null;
    });
  });

  tearDown(() {
    debugDefaultTargetPlatformOverride = null;
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(channel, null);
  });

  List<String> endedIds() => [
        for (final c in seen)
          if (c.method == 'endCall') (c.arguments as Map)['id'] as String,
      ];

  test('Android, app closed: the stop push ends the ringing call at once',
      () async {
    active = [
      {'id': 'c1', 'isAccepted': false},
    ];
    await lawbidBackgroundMessage(
      const RemoteMessage(data: {'type': 'call_ended', 'callId': 'c1'}),
    );
    expect(endedIds(), ['c1']);
  });

  test('a call answered on this phone keeps going on a ring stop', () async {
    active = [
      {'id': 'c2', 'isAccepted': true},
    ];
    await lawbidBackgroundMessage(
      const RemoteMessage(data: {'type': 'call_ended', 'callId': 'c2'}),
    );
    expect(endedIds(), isEmpty);
  });

  test('the answered call is over (ended=1): its system call ends too',
      () async {
    active = [
      {'id': 'c3', 'isAccepted': true},
    ];
    await lawbidBackgroundMessage(
      const RemoteMessage(
        data: {'type': 'call_ended', 'callId': 'c3', 'ended': '1'},
      ),
    );
    expect(endedIds(), ['c3']);
  });

  test('a stop for a call no longer shown touches nothing else', () async {
    active = [
      {'id': 'other', 'isAccepted': false},
    ];
    await stopLawbidIncoming('gone');
    expect(endedIds(), isEmpty);
  });
}
