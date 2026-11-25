import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/navigation/app_router.dart';
import 'package:lawbid/core/navigation/app_routes.dart';
import 'package:lawbid/features/demo/application/demo_providers.dart';
import 'package:lawbid/features/demo/data/demo_repository.dart';
import 'package:lawbid/features/demo/domain/demo_models.dart';
import 'package:lawbid/features/demo/presentation/demo_code_sheet.dart';
import 'package:lawbid/features/demo/presentation/demo_section.dart';
import 'package:lawbid/features/onboarding/application/current_user_controller.dart';
import 'package:lawbid/features/onboarding/domain/current_user.dart';
import 'package:material_ui/material_ui.dart';

import '../../helpers/ux_harness.dart';

DemoSession _session() => DemoSession.fromJson(const {
      'account': {
        'id': 'demo-1',
        'role': 'client',
        'displayName': 'Demo',
        'createdAt': '2026-11-25T00:00:00Z',
        'expiresAt': '2026-12-25T00:00:00Z',
      },
      'tokens': {
        'accessToken': 'test-access-token',
        'refreshToken': 'test-refresh-token',
      },
    });

class _Repo implements DemoRepository {
  @override
  Future<DemoMe> me() async => const DemoMe(
        enabled: true,
        canCreate: true,
        maxAccounts: 3,
        ttlDays: 7,
        accounts: [],
      );

  @override
  Future<DemoSession> create(DemoRole role) async => _session();

  @override
  Future<DemoSession> redeem(String code) async => _session();

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

/// A real sign-in (token store, session switch) outlives the sheet's
/// 250 ms slide-out.
class _SlowDemoSession extends DemoSessionController {
  final entered = <String>[];

  @override
  DemoUiState build() => const DemoUiState();

  @override
  Future<void> enterDemo(DemoSession session) async {
    await Future<void>.delayed(const Duration(seconds: 1));
    entered.add(session.account.id);
  }
}

class _User extends CurrentUserController {
  int loads = 0;

  @override
  CurrentUserState build() => const CurrentUserState.idle();

  @override
  Future<CurrentUser?> ensureLoaded() async {
    loads++;
    return null;
  }
}

/// Round 1 app check 25.11 №29: demo sign-in started from a sheet (the
/// role picker of «Создать демо-аккаунт», the code sheet of the welcome
/// screen). The sheet closed itself, then the sign-in went on with the
/// sheet's own `ref` — disposed with the sheet (Riverpod 3) — so the
/// `GET /users/me` wait and the move to the feed were lost silently.
void main() {
  setUpAll(initializeDateFormatting);

  /// Frame by frame, so the closed sheet is really unmounted (its route
  /// disposed) before the 1 s sign-in ends — one long `pump` would run the
  /// sign-in's timer before the frame that removes the sheet.
  Future<void> waitSignIn(WidgetTester tester) async {
    for (var i = 0; i < 20; i++) {
      await tester.pump(const Duration(milliseconds: 100));
    }
    await tester.pumpAndSettle();
  }

  Future<({GoRouter router, _SlowDemoSession demo, _User user})> pump(
    WidgetTester tester,
    Widget home,
  ) async {
    final demo = _SlowDemoSession();
    final user = _User();
    final router = GoRouter(
      routes: [
        GoRoute(
          path: '/',
          builder: (_, __) => Scaffold(body: home),
        ),
        GoRoute(
          path: AppRoutes.feed,
          builder: (_, __) => const Scaffold(body: Text('feed')),
        ),
      ],
    );
    addTearDown(router.dispose);
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          ...uxOverrides(),
          demoRepositoryProvider.overrideWithValue(_Repo()),
          demoSessionControllerProvider.overrideWith(() => demo),
          currentUserControllerProvider.overrideWith(() => user),
          appRouterProvider.overrideWith((ref) => router),
        ],
        child: MaterialApp.router(
          theme: AppTheme.of(AppThemeId.values.first),
          routerConfig: router,
        ),
      ),
    );
    await tester.pumpAndSettle();
    return (router: router, demo: demo, user: user);
  }

  testWidgets('the code sheet signs in and opens the feed', (tester) async {
    final r = await pump(
      tester,
      Builder(
        builder: (context) => TextButton(
          onPressed: () => DemoCodeSheet.show(context),
          child: const Text('code'),
        ),
      ),
    );
    await tester.tap(find.text('code'));
    await tester.pumpAndSettle();
    await tester.enterText(
      find.descendant(
        of: find.byKey(const ValueKey('demo-code-field')),
        matching: find.byType(EditableText),
      ),
      'ABCD1234',
    );
    await tester.pump();
    await tester.tap(find.byKey(const ValueKey('demo-code-submit')));
    await waitSignIn(tester);

    expect(tester.takeException(), isNull);
    expect(find.byType(DemoCodeSheet), findsNothing);
    expect(r.demo.entered, ['demo-1']);
    expect(r.user.loads, 1);
    expect(r.router.state.matchedLocation, AppRoutes.feed);
    expect(find.text('feed'), findsOneWidget);
  });

  testWidgets('the role picker creates, signs in and opens the feed',
      (tester) async {
    final r = await pump(
      tester,
      const SingleChildScrollView(child: DemoSection()),
    );
    await tester.tap(find.byKey(const ValueKey('demo-create')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey('demo-role-client')));
    await waitSignIn(tester);

    expect(tester.takeException(), isNull);
    expect(r.demo.entered, ['demo-1']);
    expect(r.user.loads, 1);
    expect(r.router.state.matchedLocation, AppRoutes.feed);
    expect(find.text('feed'), findsOneWidget);
  });
}
