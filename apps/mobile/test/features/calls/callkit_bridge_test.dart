import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/features/calls/application/call_controller.dart';
import 'package:lawbid/features/calls/application/callkit_bridge.dart';
import 'package:lawbid/features/calls/domain/call_models.dart';

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
}
