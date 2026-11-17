import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/features/calls/application/call_hold.dart';

/// Row 216 (owner 17.11): the hold state machine — held while any source
/// (CallKit / Telecom, an iOS audio interruption, an Android cellular call)
/// holds the call, resumed only when the last one lets go.
void main() {
  test('starts not held', () {
    expect(const CallHold().held, isFalse);
  });

  test('one source holds and lets go', () {
    final held = const CallHold().apply(CallHoldSource.system, on: true);
    expect(held.held, isTrue);
    expect(held.apply(CallHoldSource.system, on: false).held, isFalse);
  });

  test('two sources: resumed only when both let go, in any order', () {
    var h = const CallHold()
        .apply(CallHoldSource.system, on: true)
        .apply(CallHoldSource.interruption, on: true);
    h = h.apply(CallHoldSource.system, on: false);
    expect(h.held, isTrue, reason: 'the interruption still holds it');
    h = h.apply(CallHoldSource.interruption, on: false);
    expect(h.held, isFalse);

    h = const CallHold()
        .apply(CallHoldSource.interruption, on: true)
        .apply(CallHoldSource.phoneCall, on: true)
        .apply(CallHoldSource.interruption, on: false);
    expect(h.held, isTrue);
    expect(h.apply(CallHoldSource.phoneCall, on: false).held, isFalse);
  });

  test('a repeated hold or release changes nothing', () {
    final h = const CallHold()
        .apply(CallHoldSource.system, on: true)
        .apply(CallHoldSource.system, on: true);
    expect(h.by, {CallHoldSource.system});
    expect(
      const CallHold().apply(CallHoldSource.system, on: false).held,
      isFalse,
    );
  });

  test('the signal the other phone reads', () {
    expect(holdSignal(on: true), {'type': 'hold', 'on': true});
    expect(holdSignal(on: false), {'type': 'hold', 'on': false});
  });
}
