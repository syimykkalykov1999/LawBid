import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/features/calls/application/call_controller.dart';
import 'package:lawbid/features/calls/domain/call_models.dart';
import 'package:lawbid/features/calls/presentation/call_screen.dart';

import '../../helpers/ux_harness.dart';

/// Owner 2026-10-28 («when I end a call the screen's slide-down stops
/// halfway and then it just disappears», iPhone and Samsung): the
/// controller goes idle while the call screen slides away; the screen keeps
/// drawing the ended call until it is gone.
class _Ending extends CallController {
  static final _call = AppCall(
    id: 'c',
    conversationId: 'x',
    status: CallStatus.active,
    outgoing: true,
    peer: const CallPeer(id: 'u1', isAttorney: true, displayName: 'Peer'),
    createdAt: DateTime(2026, 10, 28),
  );

  @override
  CallSession build() => CallSession(
        phase: CallPhase.active,
        connectedAt: DateTime.now(),
        call: _call,
      );

  void end() => state = state.copyWith(
        phase: CallPhase.ended,
        outcome: CallStatus.ended,
        endedAt: DateTime.now(),
        releasing: true,
      );
  void released() => state = state.copyWith(releasing: false);
  void idle() => state = const CallSession();
}

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

  testWidgets(
      'R-037: the sheet holds still while the call is let go, slides once '
      'released, and the screen is gone after the pop animation — no timer '
      'of its own', (tester) async {
    final key = GlobalKey<NavigatorState>();
    late _Ending c;
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          ...uxOverrides(),
          callMyIdProvider.overrideWithValue('u0'),
          callControllerProvider.overrideWith(() => c = _Ending()),
        ],
        child: MaterialApp(
          navigatorKey: key,
          theme: AppTheme.of(AppThemeId.values.first),
          home: const Scaffold(body: Text('chat')),
        ),
      ),
    );
    key.currentState!
        .push(MaterialPageRoute<void>(builder: (_) => const CallScreen()))
        .ignore();
    await tester.pumpAndSettle();

    Offset sheet() => tester
        .widget<AnimatedSlide>(
          find
              .ancestor(
                of: find.byKey(const Key('call-btn-end')),
                matching: find.byType(AnimatedSlide),
              )
              .first,
        )
        .offset;
    expect(sheet(), Offset.zero);

    // Ended, still letting go: nothing moves (native work holds frames).
    c.end();
    await tester.pump();
    await tester.pump(const Duration(seconds: 2));
    expect(sheet(), Offset.zero);
    expect(find.byType(CallScreen), findsOneWidget);

    // Let go: the sheet slides away; the screen stays while «Call ended»
    // is read — however long, until the controller says idle.
    c.released();
    await tester.pump();
    expect(sheet(), isNot(Offset.zero));
    await tester.pump(const Duration(seconds: 10));
    expect(find.byType(CallScreen), findsOneWidget);

    // Idle: the screen pops after this frame and is gone once the route's
    // animation is over, the chat under it untouched.
    c.idle();
    await tester.pumpAndSettle();
    expect(find.byType(CallScreen), findsNothing);
    expect(find.text('chat'), findsOneWidget);
  });
}
