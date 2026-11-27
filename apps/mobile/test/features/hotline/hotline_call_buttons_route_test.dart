import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/navigation/app_page_transitions.dart';
import 'package:lawbid/core/navigation/app_routes.dart';
import 'package:lawbid/core/navigation/pop_then_push.dart';
import 'package:lawbid/features/calls/application/call_controller.dart';
import 'package:lawbid/features/calls/application/call_screen_addon.dart';
import 'package:lawbid/features/calls/domain/call_models.dart';
import 'package:lawbid/features/calls/presentation/call_screen.dart';
import 'package:lawbid/features/calls/presentation/call_widgets.dart';
import 'package:lawbid/features/chat/chat_routes.dart';
import 'package:lawbid/features/hotline/application/hotline_attorney_controller.dart';
import 'package:lawbid/features/hotline/application/hotline_controller.dart';
import 'package:lawbid/features/hotline/domain/hotline_attorney_models.dart';
import 'package:lawbid/features/hotline/domain/hotline_models.dart';
import 'package:lawbid/features/hotline/hotline_routes.dart';
import 'package:lawbid/features/hotline/presentation/hotline_attorney_call.dart';
import 'package:lawbid/features/hotline/presentation/hotline_call_client.dart';
import 'package:lawbid/features/hotline/presentation/hotline_case_sent_screen.dart';
import 'package:lawbid/features/profile/application/profile_providers.dart';
import 'package:material_ui/material_ui.dart';

import '../../helpers/ux_harness.dart';
import '../calls/call_screen_fakes.dart';
import '../profile/profile_fakes.dart';

/// Hotline call bug 27.11 (owner, iPhone prod): the call's name «…›»,
/// «Посмотреть профиль», «Предложить дело» and the attorney's «Профиль
/// клиента» opened the hotline's «Соединяем с адвокатом…» page (the page
/// under the call) instead of the profile — the push went first and the
/// late pop of `/call` took it away (go_router keeps only the pages below a
/// popped one). Each button must land on its own page, with the call page
/// gone (it goes on in the green «Вернуться к звонку» bar).

class _Hotline extends HotlineController {
  _Hotline(this.flow);
  final HotlineFlow flow;

  @override
  HotlineFlow build() => flow;

  @override
  Future<({String? caseId, String? code})> offerCase() async =>
      (caseId: 'case-9', code: null);
}

class _FixedLine extends HotlineAttorneyController {
  _FixedLine(this.fixed);
  final HotlineLineState fixed;

  @override
  HotlineLineState build() => fixed;
}

class _Slot extends CallScreenAddonSlot {
  _Slot(this.fixed);
  final CallScreenAddon? fixed;

  @override
  CallScreenAddon? build() => fixed;
}

const _status = HotlineRoutes.status;

const _attorney = CallPeer(
  id: 'att-1',
  isAttorney: true,
  displayName: 'Syimyk Kalykov',
  username: 'syimyk',
);

const _client = CallPeer(id: 'cl1', isAttorney: false, displayName: 'Anna K.');

const _info = HotlineCallInfo(
  requestId: 'r1',
  topic: 'Divorce',
  state: 'NV',
  practiceArea: 'family_law',
  language: 'ru',
  clientName: 'Anna K.',
  clientUsername: 'anna.k',
  clientId: 'cl1',
);

CallSession _active(CallPeer peer) => CallSession(
      phase: CallPhase.active,
      connectedAt: callScreenNow.subtract(const Duration(minutes: 2)),
      peer: peer,
      call: AppCall(
        id: 'call-1',
        conversationId: null,
        status: CallStatus.active,
        outgoing: true,
        peer: peer,
        createdAt: DateTime(2026, 11, 27),
      ),
    );

Page<void> _plain(GoRouterState state, String text) =>
    AppPageTransitions.material(state, Scaffold(body: Text(text)));

/// The app's shape: the page under the call (hotline status for the
/// client, the line for the attorney), `/call` as a modal router page, and
/// the pages the buttons open.
GoRouter _router({required String base, required Widget call}) => GoRouter(
      initialLocation: base,
      routes: [
        GoRoute(
          path: base,
          pageBuilder: (_, s) => _plain(s, 'BASE'),
        ),
        GoRoute(
          path: ChatRoutes.call,
          pageBuilder: (_, s) => AppPageTransitions.modal(s, call),
        ),
        GoRoute(
          path: '/lawyer/:u',
          pageBuilder: (_, s) => _plain(s, 'LAWYER ${s.pathParameters['u']}'),
        ),
        GoRoute(
          path: '/client/:u',
          pageBuilder: (_, s) => _plain(s, 'CLIENT ${s.pathParameters['u']}'),
        ),
        GoRoute(
          path: HotlineRoutes.caseSent,
          pageBuilder: (_, s) => AppPageTransitions.push(
            s,
            const HotlineCaseSentScreen(),
          ),
        ),
      ],
    );

List<String> _stack(GoRouter r) => [
      for (final m in r.routerDelegate.currentConfiguration.matches)
        m.matchedLocation,
    ];

Future<void> _settle(WidgetTester tester) async {
  for (var i = 0; i < 12; i++) {
    await tester.pump(const Duration(milliseconds: 100));
  }
}

void main() {
  setUpAll(initializeDateFormatting);

  void phone(WidgetTester tester) {
    tester.view
      ..physicalSize = const Size(390, 844) * 3
      ..devicePixelRatio = 3;
    addTearDown(tester.view.reset);
  }

  const flow = HotlineFlow(
    config: HotlineConfig(enabled: true),
    callId: 'call-1',
    draft: HotlineDraft(
      topic: 'Развод',
      practice: 'family_law',
      state: 'NV',
      languages: ['ru'],
    ),
    request: HotlineRequest(
      id: 'req-1',
      status: HotlineStatus.connected,
      callId: 'call-1',
      lawyer: HotlineLawyer(
        id: 'att-1',
        name: 'Syimyk Kalykov',
        username: 'syimyk',
        state: 'NV',
      ),
    ),
  );

  Future<GoRouter> client(WidgetTester tester) async {
    phone(tester);
    final router = _router(
      base: _status,
      call: const Scaffold(
        backgroundColor: AppCallColors.stage,
        body: HotlineCallClientPanel(
          peer: _attorney,
          clock: Text('2:00'),
          bottomInset: 0,
        ),
      ),
    );
    addTearDown(router.dispose);
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          ...uxOverrides(),
          callMyIdProvider.overrideWithValue('u0'),
          callControllerProvider.overrideWith(
            () => FixedCallController(_active(_attorney), null),
          ),
          publicAttorneyProfileProvider('syimyk').overrideWith(
            (ref) async => attorneyProfile(username: 'syimyk'),
          ),
          hotlineControllerProvider.overrideWith(() => _Hotline(flow)),
        ],
        child: MaterialApp.router(
          theme: AppTheme.of(AppThemeId.values.first),
          routerConfig: router,
        ),
      ),
    );
    router.push<void>(ChatRoutes.call).ignore();
    await _settle(tester);
    expect(_stack(router), [_status, ChatRoutes.call]);
    return router;
  }

  for (final key in ['hotline-call-name', 'hotline-call-profile']) {
    testWidgets(
        'client: «$key» opens the attorney profile, the call '
        'minimises (not «Соединяем с адвокатом…»)', (tester) async {
      final router = await client(tester);
      await tester.tap(find.byKey(ValueKey(key)));
      await _settle(tester);
      expect(_stack(router), [_status, AppRoutes.lawyer('syimyk')]);
      expect(find.text('LAWYER syimyk'), findsOneWidget);
      expect(find.text('BASE'), findsNothing);
      await tester.pumpWidget(const SizedBox.shrink());
      await tester.pump(const Duration(minutes: 1));
    });
  }

  testWidgets(
      'client: «Предложить дело» opens «Дело отправлено» over the '
      'minimised call; «Вернуться к звонку» brings the call back',
      (tester) async {
    final router = await client(tester);
    await tester.tap(find.byKey(const ValueKey('hotline-call-offer')));
    await _settle(tester);
    expect(_stack(router), [_status, HotlineRoutes.caseSent]);
    expect(find.byKey(const ValueKey('hotline-case-sent')), findsOneWidget);

    await tester.tap(find.byKey(const ValueKey('hotline-case-sent-back')));
    await _settle(tester);
    expect(_stack(router), [_status, ChatRoutes.call]);
    expect(find.byType(HotlineCallClientPanel), findsOneWidget);
    await tester.pumpWidget(const SizedBox.shrink());
    await tester.pump(const Duration(minutes: 1));
  });

  testWidgets(
      'attorney: «⋯» → «Профиль клиента» opens the client profile, the '
      'call minimises', (tester) async {
    phone(tester);
    final info = _info.withCall('call-1');
    final router = _router(base: '/line', call: const CallScreen());
    addTearDown(router.dispose);
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          ...uxOverrides(),
          callMyIdProvider.overrideWithValue('u0'),
          callClockProvider.overrideWithValue(() => callScreenNow),
          callControllerProvider
              .overrideWith(() => FixedCallController(_active(_client), null)),
          callVideoSurfaceProvider.overrideWithValue(fakeVideo),
          groupCallsEnabledProvider.overrideWithValue(true),
          practiceTreeProvider.overrideWith((ref) async => const []),
          hotlineAttorneyControllerProvider.overrideWith(
            () => _FixedLine(HotlineLineState(online: true, call: info)),
          ),
          callScreenAddonProvider.overrideWith(
            () => _Slot(hotlineAttorneyAddon(info, moreLabel: 'More')),
          ),
        ],
        child: MaterialApp.router(
          theme: AppTheme.of(AppThemeId.values.first),
          routerConfig: router,
        ),
      ),
    );
    router.push<void>(ChatRoutes.call).ignore();
    await _settle(tester);
    expect(_stack(router), ['/line', ChatRoutes.call]);

    await tester.tap(find.byKey(const Key('hotline-call-more')));
    await _settle(tester);
    await tester.tap(find.byKey(const ValueKey('hotline-menu-profile')));
    await _settle(tester);
    expect(_stack(router), ['/line', AppRoutes.client('anna.k')]);
    expect(find.text('CLIENT anna.k'), findsOneWidget);
    await tester.pumpWidget(const SizedBox.shrink());
    await tester.pump(const Duration(minutes: 1));
  });

  group('popThenPush (the order that fixes it)', () {
    Future<(GoRouter, BuildContext Function())> plain(
      WidgetTester tester,
    ) async {
      late BuildContext callCtx;
      final router = _router(
        base: _status,
        call: Builder(
          builder: (ctx) {
            callCtx = ctx;
            return const Scaffold(body: Text('CALL'));
          },
        ),
      );
      addTearDown(router.dispose);
      await tester.pumpWidget(MaterialApp.router(routerConfig: router));
      router.push<void>(ChatRoutes.call).ignore();
      await _settle(tester);
      return (router, () => callCtx);
    }

    testWidgets(
        'the old order (maybePop, push in the same tick) lost the pushed '
        'page and left the page under the call — the bug', (tester) async {
      final (router, ctx) = await plain(tester);
      Navigator.of(ctx()).maybePop().ignore();
      router.push<void>(AppRoutes.lawyer('syimyk')).ignore();
      await _settle(tester);
      expect(_stack(router), [_status]);
    });

    testWidgets('popThenPush lands on the pushed page, the call page gone',
        (tester) async {
      final (router, ctx) = await plain(tester);
      ctx().popThenPush<void>(AppRoutes.lawyer('syimyk')).ignore();
      await _settle(tester);
      expect(_stack(router), [_status, AppRoutes.lawyer('syimyk')]);
    });

    testWidgets('popNavigatorThenPush: the same from a host (bid form)',
        (tester) async {
      final (router, ctx) = await plain(tester);
      popNavigatorThenPush<void>(
        navigator: Navigator.of(ctx()),
        router: router,
        location: AppRoutes.client('anna.k'),
      ).ignore();
      await _settle(tester);
      expect(_stack(router), [_status, AppRoutes.client('anna.k')]);
    });
  });
}
