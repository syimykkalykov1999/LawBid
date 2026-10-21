import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/features/calls/application/call_controller.dart';
import 'package:lawbid/features/calls/domain/call_models.dart';
import 'package:lawbid/features/calls/presentation/call_screen.dart';

import '../../helpers/ux_harness.dart';

/// Device test 2026-10-21: after a 1:1 call ended («ended», then «idle»)
/// the call screen closed twice — the chat under it went too.
class _Live extends CallController {
  @override
  CallSession build() => CallSession(
        phase: CallPhase.active,
        connectedAt: DateTime.now(),
        call: AppCall(
          id: 'c',
          conversationId: 'x',
          status: CallStatus.active,
          outgoing: true,
          peer: const CallPeer(id: 'u1', isAttorney: true, displayName: 'Peer'),
          createdAt: DateTime.now(),
        ),
      );

  void go(CallPhase phase) => state = CallSession(phase: phase);
}

void main() {
  testWidgets('the call is over: only the call screen closes, the chat stays',
      (tester) async {
    final key = GlobalKey<NavigatorState>();
    late _Live c;
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          ...uxOverrides(),
          callMyIdProvider.overrideWithValue('u0'),
          callControllerProvider.overrideWith(() => c = _Live()),
        ],
        child: MaterialApp(
          navigatorKey: key,
          theme: AppTheme.of(AppThemeId.values.first),
          home: const Scaffold(body: Text('feed')),
        ),
      ),
    );
    key.currentState!
        .push(
          MaterialPageRoute<void>(
            builder: (_) => const Scaffold(body: Text('chat')),
          ),
        )
        .ignore();
    await tester.pumpAndSettle();
    key.currentState!
        .push(MaterialPageRoute<void>(builder: (_) => const CallScreen()))
        .ignore();
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 500));
    expect(find.byType(CallScreen), findsOneWidget);

    c.go(CallPhase.ended);
    await tester.pump(const Duration(milliseconds: 1600));
    c.go(CallPhase.idle);
    await tester.pump(const Duration(milliseconds: 100));
    await tester.pump(const Duration(seconds: 2));

    expect(find.byType(CallScreen), findsNothing);
    expect(find.text('chat'), findsOneWidget);
  });
}
