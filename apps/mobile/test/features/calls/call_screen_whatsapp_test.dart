import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/misc.dart' show Override;
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/features/calls/application/call_controller.dart';
import 'package:lawbid/features/calls/application/call_media.dart';
import 'package:lawbid/features/calls/application/call_quality.dart';
import 'package:lawbid/features/calls/application/call_video_layout.dart';
import 'package:lawbid/features/calls/domain/call_models.dart';
import 'package:lawbid/features/calls/presentation/call_screen.dart';
import 'package:lawbid/features/calls/presentation/call_widgets.dart';
import 'package:material_ui/material_ui.dart';

import '../../helpers/ux_harness.dart';
import 'call_screen_fakes.dart';

/// Row 166 (detective R2-A batch G, WhatsApp call screens): «Poor
/// connection», «X muted», the ended screen's Cancel · Call again, and a
/// ringing call that goes to the background.
class _Ended extends FixedCallController {
  _Ended(CallSession s) : super(s, null);
  int again = 0;

  @override
  Future<void> callAgain() async => again++;
}

class _TheirMicOff extends CallMicsOff {
  @override
  Set<String> build() => const {'u1'};
}

void main() {
  Future<void> open(
    WidgetTester tester,
    CallSession s, {
    CallMedia? media,
    CallController? controller,
    List<Override> extra = const [],
    bool pushed = false,
  }) async {
    tester.view
      ..physicalSize = const Size(390, 844) * 3
      ..devicePixelRatio = 3;
    addTearDown(tester.view.reset);
    final key = GlobalKey<NavigatorState>();
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          ...uxOverrides(),
          callMyIdProvider.overrideWithValue('u0'),
          callClockProvider.overrideWithValue(() => callScreenNow),
          callControllerProvider.overrideWith(
            () => controller ?? FixedCallController(s, media),
          ),
          callVideoSurfaceProvider.overrideWithValue(fakeVideo),
          groupCallsEnabledProvider.overrideWithValue(false),
          ...extra,
        ],
        child: MaterialApp(
          navigatorKey: key,
          theme: AppTheme.of(AppThemeId.values.first),
          home:
              pushed ? const Scaffold(body: Text('chat')) : const CallScreen(),
        ),
      ),
    );
    if (pushed) {
      key.currentState!
          .push(MaterialPageRoute<void>(builder: (_) => const CallScreen()))
          .ignore();
    }
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));
  }

  testWidgets('a poor link shows «Poor connection»; a good one shows nothing',
      (tester) async {
    final s = callSession1to1(CallPhase.active);
    await open(
      tester,
      s,
      media: FakeCallMedia(quality: LinkQuality.poor),
    );
    expect(find.byKey(const Key('call-poor-connection')), findsOneWidget);
    expect(find.text('Poor connection'), findsOneWidget);

    await tester.pumpWidget(const SizedBox.shrink());
    await open(tester, s, media: FakeCallMedia());
    await tester.pump(const Duration(milliseconds: 400));
    expect(find.byKey(const Key('call-poor-connection')), findsNothing);
  });

  testWidgets('their microphone off: «Amelia Hart muted» under the name',
      (tester) async {
    await open(
      tester,
      callSession1to1(CallPhase.active),
      media: FakeCallMedia(),
      extra: [callMicsOffProvider.overrideWith(_TheirMicOff.new)],
    );
    expect(find.byKey(const Key('call-peer-muted')), findsOneWidget);
    expect(find.text('Amelia Hart muted'), findsOneWidget);
  });

  testWidgets('no answer: «Cancel» and «Call again» stay on screen',
      (tester) async {
    final s = callSession1to1(CallPhase.outgoing).copyWith(
      phase: CallPhase.ended,
      outcome: CallStatus.missed,
      conversationId: 'x',
    );
    final c = _Ended(s);
    await open(tester, s, controller: c);
    expect(find.text('No answer'), findsOneWidget);
    expect(find.byKey(const Key('call-btn-ended-cancel')), findsOneWidget);
    await tester.tap(find.byKey(const Key('call-btn-call-again')));
    await tester.pump();
    expect(c.again, 1);
  });

  testWidgets('mic refused: the whole sentence and «Open settings»',
      (tester) async {
    final s = callSession1to1(CallPhase.outgoing).copyWith(
      phase: CallPhase.ended,
      outcome: CallStatus.failed,
      errorCode: kMicDenied,
      conversationId: 'x',
    );
    await open(tester, s, controller: _Ended(s));
    final text = tester.widget<Text>(
      find.text('Allow microphone access in settings to make calls.'),
    );
    expect(text.maxLines, 3);
    expect(find.byKey(const Key('call-btn-ended-settings')), findsOneWidget);
    expect(find.byKey(const Key('call-btn-call-again')), findsNothing);
  });

  testWidgets('a ringing call goes to the background on back (Android)',
      (tester) async {
    await open(
      tester,
      callSession1to1(CallPhase.incoming),
      media: FakeCallMedia(),
      pushed: true,
    );
    expect(find.byType(CallScreen), findsOneWidget);
    await tester.binding.handlePopRoute();
    await tester.pump();
    await tester.pump(const Duration(seconds: 1));
    expect(find.byType(CallScreen), findsNothing);
    expect(find.text('chat'), findsOneWidget);
  });
}
