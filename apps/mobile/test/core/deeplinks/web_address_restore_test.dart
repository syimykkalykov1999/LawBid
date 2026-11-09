import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:lawbid/core/deeplinks/deep_link.dart';
import 'package:lawbid/core/deeplinks/deep_link_controller.dart';
import 'package:lawbid/core/navigation/app_routes.dart';

// Owner 2026-11-08 (web, like Instagram / Telegram Web): a reloaded, typed
// or bookmarked address opens that same screen, not the feed.
void main() {
  bool known(String path) =>
      path.startsWith('/profile/settings') ||
      path.startsWith('/chat/') ||
      path == '/auth/login' ||
      path == '/onboarding/role';

  DeepLink? parse(String url, {bool web = true}) => parseDeepLink(
    Uri.parse(url),
    host: 'lawbid.dev',
    webTabs: web,
    appLocation: known,
  );

  group('parseDeepLink keeps any app address on the web', () {
    test('a settings page and a chat', () {
      expect(
        parse('https://lawbid.dev/profile/settings/privacy'),
        const TabDeepLink('/profile/settings/privacy'),
      );
      expect(
        parse('https://lawbid.dev/chat/abc-1'),
        const TabDeepLink('/chat/abc-1'),
      );
    });

    test('the query stays', () {
      expect(
        parse('https://lawbid.dev/profile/settings/referral?code=AB12'),
        const TabDeepLink('/profile/settings/referral?code=AB12'),
      );
    });

    test('local dev host works', () {
      expect(
        parseDeepLink(
          Uri.parse('http://localhost:3312/profile/settings'),
          host: 'localhost',
          webTabs: true,
          appLocation: known,
        ),
        const TabDeepLink('/profile/settings'),
      );
    });

    test('sign-in, onboarding and splash are never restored', () {
      expect(parse('https://lawbid.dev/auth/login'), isNull);
      expect(parse('https://lawbid.dev/onboarding/role'), isNull);
      expect(parse('https://lawbid.dev/splash'), isNull);
    });

    test('an address the router does not know is ignored', () {
      expect(parse('https://lawbid.dev/nothing/here'), isNull);
    });

    test('another host is ignored', () {
      expect(parse('https://evil.example/profile/settings'), isNull);
    });

    test('the phones never use it', () {
      expect(parse('https://lawbid.dev/profile/settings', web: false), isNull);
    });

    test('known links keep their own meaning', () {
      expect(
        parse('https://lawbid.dev/profile'),
        const TabDeepLink('/profile'),
      );
      expect(
        parse('https://lawbid.dev/post/p-1'),
        const ContentDeepLink(ContentKind.post, 'p-1'),
      );
    });
  });

  group('routerKnows', () {
    final router = GoRouter(
      initialLocation: AppRoutes.splash,
      routes: [
        GoRoute(path: AppRoutes.splash, builder: (_, __) => const Text('s')),
        GoRoute(
          path: AppRoutes.profileSettings,
          builder: (_, __) => const Text('settings'),
        ),
        GoRoute(path: '/chat/:id', builder: (_, __) => const Text('chat')),
      ],
    );

    test('matches real routes and their parameters', () {
      expect(routerKnows(router, '/profile/settings'), isTrue);
      expect(routerKnows(router, '/chat/42'), isTrue);
    });

    test('refuses unknown paths', () {
      expect(routerKnows(router, '/nope'), isFalse);
    });
  });

  group('goAfterSplash', () {
    GoRouter build() => GoRouter(
      initialLocation: AppRoutes.splash,
      routes: [
        for (final p in [
          AppRoutes.splash,
          AppRoutes.feed,
          AppRoutes.profileSettings,
        ])
          GoRoute(path: p, builder: (_, __) => Text(p)),
      ],
    );
    String where(GoRouter r) => r.routerDelegate.currentConfiguration.uri.path;

    testWidgets('waits for the guard to leave the splash', (tester) async {
      final r = build();
      await tester.pumpWidget(MaterialApp.router(routerConfig: r));
      goAfterSplash(r, AppRoutes.profileSettings);
      await tester.pumpAndSettle();
      expect(where(r), AppRoutes.splash);
      r.go(AppRoutes.feed); // the guard: splash → feed
      await tester.pumpAndSettle();
      expect(where(r), AppRoutes.profileSettings);
    });

    testWidgets('off the splash it goes at once', (tester) async {
      final r = build();
      await tester.pumpWidget(MaterialApp.router(routerConfig: r));
      r.go(AppRoutes.feed);
      await tester.pumpAndSettle();
      goAfterSplash(r, AppRoutes.profileSettings);
      await tester.pumpAndSettle();
      expect(where(r), AppRoutes.profileSettings);
    });
  });
}
