import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/features/chat/domain/chat_models.dart';
import 'package:lawbid/features/chat/domain/hold_gesture.dart';
import 'package:lawbid/features/chat/presentation/chat_bubble_parts.dart';

/// Owner 2026-10-22 (WhatsApp / Telegram): hold the mic to record, slide
/// toward the start to cancel, slide up to lock, let go to send.
/// The composer feeds the finger's drag to [HoldGesture]; this harness
/// drives it with the same pointer events (down / move / up) the composer's
/// `Listener` receives.
class _Mic extends StatefulWidget {
  const _Mic(this.log);

  final List<String> log;

  @override
  State<_Mic> createState() => _MicState();
}

class _MicState extends State<_Mic> {
  Offset drag = Offset.zero;
  bool recording = false;
  bool locked = false;

  @override
  Widget build(BuildContext context) => Center(
        child: Listener(
          onPointerDown: (_) {
            recording = true;
            drag = Offset.zero;
            widget.log.add('start');
          },
          onPointerMove: (e) {
            if (!recording || locked) return;
            drag += e.delta;
            switch (HoldGesture.classify(drag)) {
              case HoldOutcome.cancel:
                recording = false;
                widget.log.add('cancel');
              case HoldOutcome.lock:
                locked = true;
                widget.log.add('lock');
              case HoldOutcome.none:
                break;
            }
          },
          onPointerUp: (_) {
            if (recording && !locked) widget.log.add('send');
            recording = false;
          },
          child: const SizedBox(width: 60, height: 60, child: Text('mic')),
        ),
      );
}

Future<void> _hold(
  WidgetTester tester,
  List<String> log,
  List<Offset> moves,
) async {
  await tester.pumpWidget(MaterialApp(home: Scaffold(body: _Mic(log))));
  final g = await tester.startGesture(tester.getCenter(find.text('mic')));
  for (final m in moves) {
    await g.moveBy(m);
    await tester.pump(const Duration(milliseconds: 16));
  }
  await g.up();
  await tester.pump();
}

void main() {
  test('thresholds: 110 dp to the start cancels, 80 dp up locks', () {
    expect(HoldGesture.classify(Offset.zero), HoldOutcome.none);
    expect(HoldGesture.classify(const Offset(-109, 0)), HoldOutcome.none);
    expect(HoldGesture.classify(const Offset(-111, 0)), HoldOutcome.cancel);
    expect(HoldGesture.classify(const Offset(0, -79)), HoldOutcome.none);
    expect(HoldGesture.classify(const Offset(0, -81)), HoldOutcome.lock);
    // Sideways wins when both are past.
    expect(HoldGesture.classify(const Offset(-120, -90)), HoldOutcome.cancel);
    // The way back to the start is not a cancel.
    expect(HoldGesture.classify(const Offset(200, 0)), HoldOutcome.none);
  });

  test('the hints fade and brighten with the finger', () {
    expect(HoldGesture.slideOpacity(Offset.zero), 1);
    expect(HoldGesture.slideOpacity(const Offset(-55, 0)), closeTo(0.5, 0.01));
    expect(HoldGesture.slideOpacity(const Offset(-500, 0)), 0.2);
    expect(HoldGesture.lockHintOpacity(Offset.zero), 0.4);
    expect(HoldGesture.lockHintOpacity(const Offset(0, -80)), 1);
  });

  testWidgets('hold and let go sends', (tester) async {
    final log = <String>[];
    await _hold(tester, log, [const Offset(4, -6)]);
    expect(log, ['start', 'send']);
  });

  testWidgets('hold and slide to the start cancels, letting go sends nothing',
      (tester) async {
    final log = <String>[];
    await _hold(tester, log, [
      for (var i = 0; i < 6; i++) const Offset(-25, 0),
    ]);
    expect(log, ['start', 'cancel']);
  });

  testWidgets('hold and slide up locks, letting go keeps recording',
      (tester) async {
    final log = <String>[];
    await _hold(tester, log, [
      for (var i = 0; i < 5; i++) const Offset(0, -20),
    ]);
    expect(log, ['start', 'lock']);
  });

  test('tick marks: clock, one tick, two ticks, alert', () {
    expect(
      ChatTicks.iconFor(DeliveryState.sending),
      isNot(ChatTicks.iconFor(DeliveryState.sent)),
    );
    final one = ChatTicks.iconFor(DeliveryState.sent);
    final two = ChatTicks.iconFor(DeliveryState.sent, delivered: true);
    final seen = ChatTicks.iconFor(DeliveryState.sent, seen: true);
    expect(two, isNot(one));
    expect(seen, two);
    expect(
      ChatTicks.iconFor(DeliveryState.failed, seen: true),
      isNot(seen),
    );
  });
}
