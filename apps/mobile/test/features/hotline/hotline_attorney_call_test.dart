import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/features/calls/application/call_controller.dart';
import 'package:lawbid/features/calls/application/call_screen_addon.dart';
import 'package:lawbid/features/calls/domain/call_models.dart';
import 'package:lawbid/features/calls/presentation/call_screen.dart';
import 'package:lawbid/features/calls/presentation/call_widgets.dart';
import 'package:lawbid/features/hotline/application/hotline_attorney_controller.dart';
import 'package:lawbid/features/hotline/domain/hotline_attorney_models.dart';
import 'package:lawbid/features/hotline/presentation/hotline_attorney_call.dart';
import 'package:lawbid/features/profile/application/profile_providers.dart';
import 'package:material_ui/material_ui.dart';

import '../../helpers/ux_harness.dart';
import '../calls/call_screen_fakes.dart';

/// Owner row 87 (mockup a4–a7): the attorney's hotline call on OUR call
/// screen — the chips while it rings, «⋯» and the topic line while he
/// talks, «Клиент ждёт» — and nothing of it on a 1:1 call.
class _FixedLine extends HotlineAttorneyController {
  _FixedLine(this.fixed, this.taps);
  final HotlineLineState fixed;
  final List<String> taps;

  @override
  HotlineLineState build() => fixed;

  @override
  void dismissWaiting() => taps.add('dismiss');

  @override
  Future<void> answerWaiting() async => taps.add('answer');
}

/// The slot as the attorney host fills it (HotlineAttorneyHost).
class _Slot extends CallScreenAddonSlot {
  _Slot(this.fixed);
  final CallScreenAddon? fixed;

  @override
  CallScreenAddon? build() => fixed;
}

const _client = CallPeer(id: 'cl1', isAttorney: false, displayName: 'Anna K.');

const _info = HotlineCallInfo(
  requestId: 'r1',
  topic: 'Divorce, splitting the flat',
  state: 'NV',
  practiceArea: 'family_law',
  language: 'ru',
  clientName: 'Anna K.',
  clientUsername: 'anna.k',
  clientId: 'cl1',
);

CallSession _session(CallPhase phase, String id) => CallSession(
      phase: phase,
      connectedAt: phase == CallPhase.active
          ? callScreenNow.subtract(const Duration(minutes: 3, seconds: 15))
          : null,
      peer: _client,
      call: AppCall(
        id: id,
        conversationId: null,
        status:
            phase == CallPhase.active ? CallStatus.active : CallStatus.ringing,
        outgoing: false,
        peer: _client,
        createdAt: DateTime(2026, 11, 24),
      ),
    );

void main() {
  Future<List<String>> open(
    WidgetTester tester,
    CallSession s, {
    HotlineLineState line = const HotlineLineState(),
  }) async {
    tester.view
      ..physicalSize = const Size(390, 844) * 3
      ..devicePixelRatio = 3;
    addTearDown(tester.view.reset);
    final taps = <String>[];
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          ...uxOverrides(),
          callMyIdProvider.overrideWithValue('u0'),
          callClockProvider.overrideWithValue(() => callScreenNow),
          callControllerProvider
              .overrideWith(() => FixedCallController(s, null)),
          callVideoSurfaceProvider.overrideWithValue(fakeVideo),
          groupCallsEnabledProvider.overrideWithValue(true),
          practiceTreeProvider.overrideWith((ref) async => const []),
          hotlineAttorneyControllerProvider
              .overrideWith(() => _FixedLine(line, taps)),
          callScreenAddonProvider.overrideWith(
            () => _Slot(hotlineAttorneyAddon(line.call, moreLabel: 'More')),
          ),
        ],
        child: MaterialApp(
          theme: AppTheme.of(AppThemeId.values.first),
          home: const CallScreen(),
        ),
      ),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));
    return taps;
  }

  testWidgets(
      'a4: the line rings on our call screen with topic, practice, '
      'state and the LANGUAGE chip, Decline / Accept', (tester) async {
    await open(
      tester,
      _session(CallPhase.incoming, _info.ringId),
      line: const HotlineLineState(online: true, call: _info),
    );
    expect(find.byKey(const ValueKey('hotline-incoming-card')), findsOneWidget);
    expect(find.text('Divorce, splitting the flat'), findsOneWidget);
    expect(find.text('Nevada'), findsOneWidget);
    expect(find.text('Русский'), findsOneWidget);
    expect(find.byKey(const Key('call-btn-decline')), findsOneWidget);
    expect(find.byKey(const Key('call-btn-accept')), findsOneWidget);
    // no camera, no «Add participant» on a hotline call
    expect(find.byKey(const Key('call-btn-add')), findsNothing);
  });

  testWidgets(
      'a5 / a7: talking — «⋯», the topic · language line, and '
      '«Клиент ждёт» with Decline / Answer', (tester) async {
    final taps = await open(
      tester,
      _session(CallPhase.active, 'call-1'),
      line: HotlineLineState(
        online: true,
        call: _info.withCall('call-1'),
        waiting: HotlineWaiting(
          requestId: 'r2',
          topic: 'Inheritance',
          state: 'NV',
          practiceArea: 'estate',
          language: 'ru',
          waitingSince:
              DateTime.now().subtract(const Duration(minutes: 1, seconds: 40)),
        ),
      ),
    );
    expect(find.byKey(const Key('hotline-call-more')), findsOneWidget);
    expect(find.byKey(const Key('call-btn-add')), findsNothing);
    expect(
      find.text('Divorce, splitting the flat · Русский'),
      findsOneWidget,
    );
    expect(find.byKey(const Key('hotline-waiting-banner')), findsOneWidget);
    expect(find.textContaining('Русский'), findsWidgets);
    await tester.tap(find.byKey(const Key('hotline-waiting-decline')));
    await tester.tap(find.byKey(const Key('hotline-waiting-answer')));
    await tester.pump();
    expect(taps, ['dismiss', 'answer']);
  });

  testWidgets(
      'a6: «⋯» opens «Принимать звонки», «Профиль клиента», '
      '«Заблокировать и пожаловаться»', (tester) async {
    await open(
      tester,
      _session(CallPhase.active, 'call-1'),
      line: HotlineLineState(online: true, call: _info.withCall('call-1')),
    );
    await tester.tap(find.byKey(const Key('hotline-call-more')));
    await tester.pumpAndSettle();
    expect(
      find.byKey(const ValueKey('hotline-menu-accepting')),
      findsOneWidget,
    );
    expect(find.byKey(const ValueKey('hotline-menu-profile')), findsOneWidget);
    expect(find.byKey(const ValueKey('hotline-menu-block')), findsOneWidget);
  });

  testWidgets('a 1:1 call shows nothing of the hotline (calls untouched)',
      (tester) async {
    await open(
      tester,
      callSession1to1(CallPhase.active),
      // even with a hotline call remembered for ANOTHER id
      line: HotlineLineState(online: true, call: _info.withCall('call-9')),
    );
    expect(find.byKey(const ValueKey('hotline-incoming-card')), findsNothing);
    expect(find.byKey(const ValueKey('hotline-call-topic')), findsNothing);
    expect(find.byKey(const Key('hotline-call-more')), findsNothing);
    expect(find.byKey(const Key('hotline-waiting-banner')), findsNothing);
    expect(find.byKey(const Key('call-btn-add')), findsOneWidget);
  });
}
