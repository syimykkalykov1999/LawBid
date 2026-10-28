import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/features/calls/application/call_controller.dart';
import 'package:lawbid/features/calls/application/callkit_bridge.dart';
import 'package:lawbid/features/calls/domain/call_models.dart';
import 'package:shared_preferences/shared_preferences.dart';

const _peer = CallPeer(id: 'p1', isAttorney: true, displayName: 'Paul Phone');

AppCall _call(String id) => AppCall(
      id: id,
      conversationId: 'conv',
      status: CallStatus.active,
      outgoing: false,
      peer: _peer,
      createdAt: DateTime(2026, 10, 20),
    );

/// Owner 2026-10-20: answering from the system sheet / heads-up took the
/// app in and then cancelled the call — our own dismiss of the ringing
/// screen came back as an "ended" event and hung up the call just answered.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  ringClaimTests();

  test('our own dismiss never counts as the user hanging up', () async {
    final s = CallSession(phase: CallPhase.connecting, call: _call('a1'));
    expect(systemEndHangsUp(s, 'a1'), isTrue);
    await const CallkitSystemUi().dismiss('a1');
    expect(callEndedByUs('a1'), isTrue);
    expect(systemEndHangsUp(s, 'a1'), isFalse);
  });

  test('the answer swap on Android marks the end as ours', () async {
    final c = _call('a2');
    final s = CallSession(phase: CallPhase.connecting, call: c);
    await const CallkitSystemUi().answered(c);
    expect(systemEndHangsUp(s, 'a2'), isFalse);
  });

  test('"End" hangs up only a call that is running here', () {
    final ringing = CallSession(phase: CallPhase.incoming, call: _call('b1'));
    expect(systemEndHangsUp(ringing, 'b1'), isFalse);
    final active = CallSession(phase: CallPhase.active, call: _call('b2'));
    expect(systemEndHangsUp(active, 'b2'), isTrue);
    expect(systemEndHangsUp(active, 'other'), isFalse);
    expect(systemEndHangsUp(const CallSession(), 'b2'), isFalse);
  });

  test('Android: after a call the plugin ends all its calls', () async {
    debugDefaultTargetPlatformOverride = TargetPlatform.android;
    addTearDown(() => debugDefaultTargetPlatformOverride = null);
    final seen = <String>[];
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(
      const MethodChannel('flutter_callkit_incoming'),
      (call) async {
        seen.add(call.method);
        return null;
      },
    );
    addTearDown(
      () => TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
          .setMockMethodCallHandler(
        const MethodChannel('flutter_callkit_incoming'),
        null,
      ),
    );
    await const CallkitSystemUi().endAll();
    expect(seen, ['endAllCalls']);
  });
}

void ringClaimTests() {
  group('one system ring per call id (push and socket both ring it)', () {
    setUp(() {
      SharedPreferences.setMockInitialValues({});
      forgetRingClaimsForTest();
    });

    test('the second report of the same call is refused', () async {
      expect(await claimRingForTest('c1'), isTrue);
      expect(await claimRingForTest('c1'), isFalse);
    });

    test('another call is its own', () async {
      expect(await claimRingForTest('c1'), isTrue);
      expect(await claimRingForTest('c2'), isTrue);
    });

    test('a claim made by the other isolate (preferences) counts', () async {
      SharedPreferences.setMockInitialValues({
        'call.ring.c9': DateTime.now().millisecondsSinceEpoch,
      });
      expect(await claimRingForTest('c9'), isFalse);
    });
  });
}
