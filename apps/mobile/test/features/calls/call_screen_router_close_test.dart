import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/navigation/app_page_transitions.dart';
import 'package:lawbid/features/calls/application/call_controller.dart';
import 'package:lawbid/features/calls/domain/call_models.dart';
import 'package:lawbid/features/calls/presentation/call_screen.dart';
import 'package:material_ui/material_ui.dart';

import '../../helpers/ux_harness.dart';

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

  void end() => state = const CallSession();
}

/// Round 1 app check 25.11 №2: a call that ended while a sheet was open
/// over its screen (sound output, add people) left `/call` in go_router's
/// stack. The screen closed the sheet with `popUntil` and then itself with
/// `removeRoute`, which skips the pop callback go_router listens to — the
/// router still «saw» the call screen: the next call did not open and the
/// incoming banner stayed hidden (`CallHost._onCallScreen`).
void main() {
  testWidgets(
      'a 1:1 call ends under an open sheet: /call leaves the router, '
      'the chat stays', (tester) async {
    late _Live c;
    final rootKey = GlobalKey<NavigatorState>();
    final router = GoRouter(
      navigatorKey: rootKey,
      initialLocation: '/chat',
      routes: [
        GoRoute(
          path: '/chat',
          pageBuilder: (context, state) => AppPageTransitions.material(
            state,
            const Scaffold(body: Text('chat')),
          ),
        ),
        GoRoute(
          path: '/call',
          pageBuilder: (context, state) =>
              AppPageTransitions.modal(state, const CallScreen()),
        ),
      ],
    );
    addTearDown(router.dispose);
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          ...uxOverrides(),
          callMyIdProvider.overrideWithValue('u0'),
          callControllerProvider.overrideWith(() => c = _Live()),
        ],
        child: MaterialApp.router(
          theme: AppTheme.of(AppThemeId.values.first),
          routerConfig: router,
        ),
      ),
    );
    router.push<void>('/call').ignore();
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 600));
    expect(find.byType(CallScreen), findsOneWidget);

    // A sheet over the call screen.
    rootKey.currentState!
        .push(
          ModalBottomSheetRoute<void>(
            builder: (_) => const SizedBox(height: 200, child: Text('sheet')),
            isScrollControlled: false,
          ),
        )
        .ignore();
    await tester.pump(const Duration(milliseconds: 500));
    expect(find.text('sheet'), findsOneWidget);

    c.end();
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));
    await tester.pump(const Duration(seconds: 2));

    expect(find.byType(CallScreen), findsNothing);
    expect(find.text('sheet'), findsNothing);
    expect(find.text('chat'), findsOneWidget);
    expect(router.routerDelegate.currentConfiguration.uri.path, '/chat');
    expect(
      router.routerDelegate.currentConfiguration.matches
          .map((m) => m.matchedLocation),
      ['/chat'],
    );
  });
}
