import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/l10n/static_translator.dart';
import 'package:lawbid/core/session/guest_mode.dart';
import 'package:lawbid/core/startup/app_startup.dart';
import 'package:lawbid/features/auth/auth_routes.dart';
import 'package:lawbid/features/feed/presentation/screens/guest_feed_screen.dart';
import 'package:lawbid/features/search/application/public_directory_providers.dart';
import 'package:lawbid/features/search/presentation/screens/guest_search_screen.dart';
import 'package:lawbid/features/social/presentation/widgets/attorney_tile.dart';
import 'package:lawbid/shared/presentation/guest_gate.dart';

import '../../helpers/long_locale.dart';
import '../../helpers/ux_harness.dart';

/// Owner 2026-10-22 (guest browsing, decision A1): without an account the
/// feed shows the public directory; every action opens the sign-in flow
/// and remembers where the guest was.
class _ReadyStartup extends AppStartupController {
  @override
  StartupStatus build() => StartupStatus.ready;
}

class _Directory implements PublicDirectoryRepository {
  int calls = 0;

  @override
  Future<PublicAttorneyPage> attorneys({
    String? state,
    String? practice,
    String? cursor,
    int limit = 50,
  }) async {
    calls++;
    return const PublicAttorneyPage(
      items: [
        PublicAttorney(
          username: 'anna_lee',
          displayName: 'Anna Lee',
          ratingAvg: 4.8,
          ratingCount: 12,
          trustBadge: true,
          practices: ['Immigration', 'Family'],
          states: ['NY'],
        ),
        PublicAttorney(
          username: 'tom_ray',
          displayName: 'Tom Ray',
          ratingAvg: 0,
          ratingCount: 0,
          trustBadge: false,
          practices: ['Tax'],
          states: ['CA'],
        ),
      ],
    );
  }
}

void main() {
  setUpAll(initializeDateFormatting);
  late GoRouter router;
  late ProviderContainer container;

  Future<void> pump(WidgetTester tester, Widget feed) async {
    useNarrowPhone(tester);
    router = GoRouter(
      initialLocation: '/feed',
      routes: [
        GoRoute(path: '/feed', builder: (_, __) => feed),
        GoRoute(path: '/search', builder: (_, __) => const GuestSearchScreen()),
        GoRoute(
          path: AuthRoutes.welcome,
          builder: (_, __) => const Scaffold(body: Text('WELCOME')),
        ),
        GoRoute(
          path: '/lawyer/:username',
          builder: (_, state) => Scaffold(
              body: Text('LAWYER ${state.pathParameters['username']}')),
        ),
      ],
    );
    addTearDown(router.dispose);
    await tester.pumpWidget(
      ProviderScope(
        overrides: uxOverrides(
          extra: [
            appStartupProvider.overrideWith(_ReadyStartup.new),
            publicDirectoryRepositoryProvider.overrideWithValue(_Directory()),
          ],
        ),
        child: Consumer(
          builder: (context, ref, _) {
            container = ProviderScope.containerOf(context);
            return MaterialApp.router(
              theme: AppTheme.light(),
              routerConfig: router,
            );
          },
        ),
      ),
    );
    await tester.pumpAndSettle();
  }

  testWidgets('a guest sees the verified attorneys and opens a profile',
      (tester) async {
    await pump(tester, const GuestFeedScreen());
    expect(container.read(isGuestProvider), isTrue);
    expect(find.byKey(const ValueKey('guest-feed-card')), findsOneWidget);
    expect(find.text('Anna Lee'), findsOneWidget);
    expect(find.text('Tom Ray'), findsOneWidget);
    await tester.tap(find.text('Anna Lee'));
    await tester.pumpAndSettle();
    expect(find.text('LAWYER anna_lee'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('«Sign in» remembers the screen and opens the welcome flow',
      (tester) async {
    await pump(tester, const GuestFeedScreen());
    await tester.tap(find.byKey(const ValueKey('guest-feed-sign-in')));
    await tester.pumpAndSettle();
    expect(find.text('WELCOME'), findsOneWidget);
    expect(container.read(guestReturnProvider), '/feed');
  });

  testWidgets('an action (follow) asks a guest to sign in first',
      (tester) async {
    await pump(
      tester,
      const Scaffold(
        body: FollowButton(attorneyId: 'a1', initial: false),
      ),
    );
    await tester.tap(find.byType(FollowButton));
    await tester.pumpAndSettle();
    expect(find.text('WELCOME'), findsOneWidget);
    expect(container.read(guestReturnProvider), '/feed');
  });

  testWidgets('the guest search filters the directory on the phone',
      (tester) async {
    await pump(tester, const GuestFeedScreen());
    router.go('/search');
    await tester.pumpAndSettle();
    expect(find.text('Anna Lee'), findsOneWidget);
    await tester.enterText(
      find.byKey(const ValueKey('guest-search-field')),
      'tax',
    );
    await tester.pumpAndSettle();
    expect(find.text('Anna Lee'), findsNothing);
    expect(find.text('Tom Ray'), findsOneWidget);
    await tester.enterText(
      find.byKey(const ValueKey('guest-search-field')),
      'zzz',
    );
    await tester.pumpAndSettle();
    expect(find.text(const StaticTranslatorEn().t('guest.search.empty')),
        findsOneWidget);
  });

  testWidgets('the sign-in bar is a plain strip with one button',
      (tester) async {
    await pump(
      tester,
      const Scaffold(bottomNavigationBar: GuestSignInBar()),
    );
    await tester.tap(find.byKey(const ValueKey('guest-sign-in')));
    await tester.pumpAndSettle();
    expect(find.text('WELCOME'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  test('guest routes: public screens only', () {
    for (final ok in ['/feed', '/search', '/lawyer/a', '/u/a', '/post/1']) {
      expect(isGuestRoute(ok), isTrue, reason: ok);
    }
    for (final no in ['/mine', '/profile', '/inbox', '/create', '/qr/my']) {
      expect(isGuestRoute(no), isFalse, reason: no);
    }
    // The translator in these tests is the compiled-in English one.
    expect(const StaticTranslatorEn().t('guest.signIn'), 'Sign in');
  });
}
