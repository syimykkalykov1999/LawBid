import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/features/calls/application/call_controller.dart';
import 'package:lawbid/features/calls/presentation/call_screen.dart';

/// Owner 2026-10-28 («when I end a call the screen's slide-down stops
/// halfway and then it just disappears», iPhone and Samsung): the
/// controller goes idle while the call screen slides away; the screen keeps
/// drawing the ended call until it is gone.
void main() {
  const ended = CallSession(phase: CallPhase.ended);
  const idle = CallSession();

  test('a closing screen keeps the ended call once the controller is idle', () {
    expect(
      shownWhileClosing(live: idle, last: ended, closing: true),
      same(ended),
    );
  });

  test('an open screen always shows the live call', () {
    expect(
      shownWhileClosing(live: idle, last: ended, closing: false),
      same(idle),
    );
    const ringing = CallSession(phase: CallPhase.outgoing);
    expect(
      shownWhileClosing(live: ringing, last: ended, closing: true),
      same(ringing),
    );
  });

  test('nothing shown before: the live state', () {
    expect(
      shownWhileClosing(live: idle, last: null, closing: true),
      same(idle),
    );
  });
}
