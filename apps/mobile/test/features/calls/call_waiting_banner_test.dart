import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/static_translator.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/features/calls/application/call_controller.dart';
import 'package:lawbid/features/calls/application/call_hold.dart';
import 'package:lawbid/features/calls/domain/call_models.dart';
import 'package:lawbid/features/calls/presentation/call_screen.dart';
import 'package:lawbid/features/calls/presentation/call_waiting_banner.dart';

import '../../helpers/ux_harness.dart';

/// Row 216 (owner 17.11, WhatsApp call waiting): the second-call prompt —
/// the caller's name, «Incoming call», «Decline» and «End & accept» — and
/// the «On hold» status line of a held call.
class _Recorder extends CallController {
  _Recorder(this.taps);
  final List<String> taps;

  @override
  CallSession build() => const CallSession();

  @override
  Future<void> declineWaiting() async => taps.add('decline');

  @override
  Future<void> endAndAcceptWaiting([String? callId]) async =>
      taps.add('end-accept');
}

final _waiting = CallWaiting(
  call: AppCall(
    id: 'w2',
    conversationId: 'conv2',
    status: CallStatus.ringing,
    outgoing: false,
    peer: const CallPeer(id: 'u2', isAttorney: false, displayName: 'Mia Lee'),
    createdAt: DateTime(2026, 11, 17),
  ),
);

Future<List<String>> _pump(
  WidgetTester tester, {
  Translator translator = const StaticTranslatorEn(),
}) async {
  final taps = <String>[];
  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        ...uxOverrides(translator: translator),
        callControllerProvider.overrideWith(() => _Recorder(taps)),
      ],
      child: MaterialApp(
        theme: AppTheme.of(AppThemeId.values.first),
        home: Scaffold(
          body: Align(
            alignment: Alignment.topCenter,
            child: CallWaitingBanner(waiting: _waiting),
          ),
        ),
      ),
    ),
  );
  await tester.pump();
  return taps;
}

void main() {
  testWidgets('shows the caller, Decline and End & accept (English)',
      (tester) async {
    await _pump(tester);
    expect(find.text('Mia Lee'), findsOneWidget);
    expect(find.text('Incoming call'), findsOneWidget);
    expect(find.text('Decline'), findsOneWidget);
    expect(find.text('End & accept'), findsOneWidget);
  });

  testWidgets('Russian: «Отклонить» and «Завершить и принять»', (tester) async {
    await _pump(tester, translator: const StaticTranslatorRu());
    expect(find.text('Отклонить'), findsOneWidget);
    expect(find.text('Завершить и принять'), findsOneWidget);
  });

  testWidgets('Decline declines the waiting call', (tester) async {
    final taps = await _pump(tester);
    await tester.tap(find.byKey(const Key('call-waiting-decline')));
    await tester.pump();
    expect(taps, ['decline']);
  });

  testWidgets('End & accept ends ours and takes the waiting one',
      (tester) async {
    final taps = await _pump(tester);
    await tester.tap(find.byKey(const Key('call-waiting-end-accept')));
    await tester.pump();
    expect(taps, ['end-accept']);
  });

  testWidgets('buttons are at least 44 pt tall (tap target)', (tester) async {
    await _pump(tester);
    for (final key in ['call-waiting-decline', 'call-waiting-end-accept']) {
      expect(
        tester.getSize(find.byKey(Key(key))).height,
        greaterThanOrEqualTo(44),
      );
    }
  });

  group('«On hold» status line', () {
    final call = AppCall(
      id: 'c1',
      conversationId: 'conv',
      status: CallStatus.active,
      outgoing: true,
      peer: const CallPeer(id: 'p1', isAttorney: true, displayName: 'Paul'),
      createdAt: DateTime(2026, 11, 17),
    );
    final talking = CallSession(
      phase: CallPhase.active,
      call: call,
      connectedAt: DateTime(2026, 11, 17, 12),
    );
    const en = StaticTranslatorEn();
    const ru = StaticTranslatorRu();

    test('held here or on the other phone reads «On hold»', () {
      expect(
        callStatusText(en, talking.copyWith(held: true)),
        'On hold',
      );
      expect(
        callStatusText(ru, talking.copyWith(peerHeld: true)),
        'На удержании',
      );
    });

    test('not held: the timer as before', () {
      expect(
        callStatusText(
          en,
          talking,
          now: DateTime(2026, 11, 17, 12, 0, 42),
        ),
        '0:42',
      );
    });

    test('reconnecting wins over hold (the link is the problem)', () {
      expect(
        callStatusText(en, talking.copyWith(held: true, reconnecting: true)),
        'Reconnecting…',
      );
    });
  });
}
