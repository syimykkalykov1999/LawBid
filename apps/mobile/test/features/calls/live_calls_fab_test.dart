import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/features/calls/application/call_controller.dart';
import 'package:lawbid/features/calls/application/call_history_providers.dart';
import 'package:lawbid/features/calls/data/call_history_repository.dart';
import 'package:lawbid/features/calls/domain/call_history_models.dart';
import 'package:lawbid/features/calls/domain/call_models.dart';
import 'package:lawbid/features/calls/presentation/live_calls_fab.dart';
import 'package:lawbid/features/chat/application/realtime_providers.dart';

import '../../helpers/long_locale.dart';
import '../../helpers/ux_harness.dart';

/// Owner 2026-10-23: the call button above the Chats «+». It shows while a
/// call I am in (minimised) or can join is going on; one call: a tap joins
/// it, several: a sheet lists only those calls; it is gone the moment the
/// call ends (the realtime event); a steady dot when animations are off.
class _History implements CallHistoryRepository {
  _History(this.list);

  List<OngoingGroupCall> list;

  @override
  Future<List<OngoingGroupCall>> ongoing() async => list;

  @override
  dynamic noSuchMethod(Invocation invocation) => throw UnimplementedError();
}

class _FakeCall extends CallController {
  _FakeCall(this.session);

  final CallSession session;

  @override
  CallSession build() => session;
}

OngoingGroupCall _g(String id, {int joined = 3, bool mine = false}) =>
    OngoingGroupCall(
      id: id,
      groupId: 'g$id',
      groupTitle: 'Firm $id',
      video: false,
      joined: joined,
      mine: mine,
      startedAt:
          DateTime.now().subtract(const Duration(minutes: 5, seconds: 7)),
    );

void main() {
  setUpAll(initializeDateFormatting);

  late StreamController<RealtimeEvent> events;
  late _History history;
  setUp(() => events = StreamController<RealtimeEvent>.broadcast());
  tearDown(() => events.close());

  Future<void> pump(
    WidgetTester tester,
    List<OngoingGroupCall> running, {
    CallSession? session,
    bool animations = false,
    List<String>? joined,
    Widget? child,
    ThemeData? theme,
  }) async {
    useNarrowPhone(tester);
    history = _History(running);
    await tester.pumpWidget(
      uxApp(
        child ??
            const Scaffold(
              floatingActionButton: LiveCallsFab(),
              body: SizedBox.expand(),
            ),
        theme: theme ?? AppTheme.light(),
        size: narrowPhone,
        disableAnimations: !animations,
        overrides: [
          translatorProvider.overrideWithValue(LongestTranslator()),
          realtimeEventsProvider.overrideWithValue(events.stream),
          callHistoryRepositoryProvider.overrideWithValue(history),
          ongoingGroupCallsProvider.overrideWith(OngoingGroupCallsNotifier.new),
          callMyIdProvider.overrideWithValue('me'),
          videoCallsEnabledProvider.overrideWithValue(true),
          if (session != null)
            callControllerProvider.overrideWith(() => _FakeCall(session)),
          if (joined != null)
            joinOngoingGroupCallProvider.overrideWithValue((call) async {
              joined.add(call.id);
              return null;
            }),
        ],
      ),
    );
    await tester.pump();
    await tester.pump();
  }

  final live = find.byKey(const ValueKey('chats-live-call'));

  testWidgets('no call going on: no button', (tester) async {
    await pump(tester, const []);
    expect(live, findsNothing);
  });

  testWidgets('one call: same shape as the «+», dot on it, a tap joins',
      (tester) async {
    final joined = <String>[];
    await pump(tester, [_g('k1')], joined: joined);
    expect(live, findsOneWidget);
    expect(find.byKey(const ValueKey('live-dot')), findsOneWidget);
    final fab = tester.widget<FloatingActionButton>(live);
    expect(fab.shape, isNull, reason: 'the theme FAB shape, like the «+»');
    expect(tester.getSize(live), const Size(56, 56));
    await tester.tap(live);
    await tester.pump();
    expect(joined, ['k1']);
    // No sheet for a single call.
    expect(find.byType(LiveCallsSheet), findsNothing);
  });

  testWidgets('several calls: a sheet with only those calls', (tester) async {
    final joined = <String>[];
    await pump(tester, [_g('k1'), _g('k2', mine: true)], joined: joined);
    await tester.tap(live);
    await tester.pumpAndSettle();
    expect(find.byType(LiveCallsSheet), findsOneWidget);
    expect(find.byKey(const ValueKey('live-call-k1')), findsOneWidget);
    expect(find.byKey(const ValueKey('live-call-k2')), findsOneWidget);
    // «Join» for the one I am not in, «Return» for mine.
    expect(find.byKey(const ValueKey('ongoing-join')), findsOneWidget);
    expect(find.byKey(const ValueKey('ongoing-return')), findsOneWidget);
    // Who, how many, how long (5:07 and ticking).
    expect(find.textContaining('5:0'), findsWidgets);
    await tester.tap(find.byKey(const ValueKey('ongoing-join')));
    await tester.pumpAndSettle();
    expect(joined, ['k1']);
    // The sheet closes after joining.
    expect(find.byType(LiveCallsSheet), findsNothing);
  });

  testWidgets('the call ends: the button goes away at once', (tester) async {
    await pump(tester, [_g('k1')]);
    expect(live, findsOneWidget);
    events.add(
      const RealtimeEvent('call:ongoing_ended', {
        'callId': 'k1',
        'groupId': 'gk1',
      }),
    );
    await tester.pump();
    await tester.pump();
    expect(live, findsNothing);
  });

  testWidgets('a call that starts shows the button', (tester) async {
    await pump(tester, const []);
    expect(live, findsNothing);
    // The server pushes `call:ongoing` for a call not listed yet; the list
    // is read again.
    history.list = [_g('k9')];
    events.add(
      const RealtimeEvent('call:ongoing', {'callId': 'k9', 'groupId': 'gk9'}),
    );
    for (var i = 0; i < 4; i++) {
      await tester.pump(const Duration(milliseconds: 20));
    }
    expect(live, findsOneWidget);
  });

  testWidgets('the call this phone is in (one to one) shows too',
      (tester) async {
    final session = CallSession(
      phase: CallPhase.active,
      connectedAt: DateTime.now().subtract(const Duration(seconds: 65)),
      peer: const CallPeer(id: 'p', isAttorney: false, displayName: 'Ann Lee'),
      call: AppCall(
        id: 'one',
        conversationId: 'c',
        status: CallStatus.active,
        outgoing: true,
        peer: const CallPeer(
          id: 'p',
          isAttorney: false,
          displayName: 'Ann Lee',
        ),
        createdAt: DateTime.now(),
      ),
    );
    await pump(tester, const [], session: session);
    expect(live, findsOneWidget);
    await tester.tap(live);
    await tester.pump();
    // One call: no sheet.
    expect(find.byType(LiveCallsSheet), findsNothing);
  });

  testWidgets('reduce motion: the dot is steady', (tester) async {
    await pump(tester, [_g('k1')]);
    final dot = find.byKey(const ValueKey('live-dot'));
    expect(tester.widget<FadeTransition>(dot).opacity.value, 1);
    await tester.pump(const Duration(milliseconds: 500));
    expect(tester.widget<FadeTransition>(dot).opacity.value, 1);
  });

  testWidgets('animations on: the dot blinks', (tester) async {
    await pump(tester, [_g('k1')], animations: true);
    final dot = find.byKey(const ValueKey('live-dot'));
    final seen = <double>{};
    for (var i = 0; i < 6; i++) {
      await tester.pump(const Duration(milliseconds: 250));
      seen.add(tester.widget<FadeTransition>(dot).opacity.value);
    }
    expect(seen.length, greaterThan(2));
    await tester.pumpWidget(const SizedBox());
  });

  for (final id in AppThemeId.values) {
    testWidgets('all themes: the button and the sheet fit (${id.name})',
        (tester) async {
      await pump(
        tester,
        [_g('k1'), _g('k2', mine: true)],
        theme: AppTheme.of(id),
      );
      await tester.tap(live);
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
      expect(find.byKey(const ValueKey('live-call-k2')), findsOneWidget);
    });
  }
}
