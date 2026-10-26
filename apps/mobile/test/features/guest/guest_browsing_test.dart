import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lawbid/core/connectivity/connectivity_providers.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/api_error_text.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/l10n/static_translator.dart';
import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid/core/network/auth_interceptor.dart';
import 'package:lawbid/core/network/dio_client.dart';
import 'package:lawbid/core/session/guest_mode.dart';
import 'package:lawbid/core/startup/app_startup.dart';
import 'package:lawbid/features/auth/auth_routes.dart';
import 'package:lawbid/features/channels/presentation/channel_screen.dart';
import 'package:lawbid/features/chat/application/link_preview_providers.dart';
import 'package:lawbid/features/feed/presentation/screens/feed_screen.dart';
import 'package:lawbid/features/profile/presentation/screens/attorney_profile_screen.dart';
import 'package:lawbid/features/search/presentation/screens/search_screen.dart';
import 'package:lawbid/features/social/presentation/screens/social_screens.dart';
import 'package:lawbid/features/social/presentation/widgets/attorney_tile.dart';
import 'package:lawbid/shared/presentation/guest_gate.dart';

import '../../helpers/fake_http_adapter.dart';
import '../../helpers/long_locale.dart';
import '../../helpers/ux_harness.dart';

class _ReadyStartup extends AppStartupController {
  @override
  StartupStatus build() => StartupStatus.ready;
}

void main() {
  setUpAll(initializeDateFormatting);

  Future<FakeHttpAdapter> pump(
    WidgetTester tester,
    String location,
    FakeHandler handler,
  ) async {
    useNarrowPhone(tester);
    final adapter = FakeHttpAdapter(handler);
    final router = GoRouter(
      initialLocation: location,
      routes: [
        GoRoute(path: '/feed', builder: (_, __) => const FeedScreen()),
        GoRoute(path: '/search', builder: (_, __) => const SearchScreen()),
        GoRoute(
          path: AuthRoutes.welcome,
          builder: (_, __) => const Scaffold(body: Text('WELCOME')),
        ),
        GoRoute(
          path: '/follow',
          builder: (_, __) => const Scaffold(
            body: FollowButton(attorneyId: 'a1', initial: false),
          ),
        ),
        GoRoute(
          path: '/bar',
          builder: (_, __) =>
              const Scaffold(bottomNavigationBar: GuestSignInBar()),
        ),
        GoRoute(
          path: '/lawyer/:u',
          builder: (_, s) =>
              AttorneyProfileScreen(username: s.pathParameters['u']!),
        ),
        GoRoute(
          path: '/post/:id',
          builder: (_, s) => PostScreen(postId: s.pathParameters['id']!),
        ),
        GoRoute(
          path: '/tag/:tag',
          builder: (_, s) => TagScreen(tag: s.pathParameters['tag']!),
        ),
        GoRoute(
          path: '/c/:u',
          builder: (_, s) => ChannelScreen(channelRef: s.pathParameters['u']!),
        ),
      ],
    );
    addTearDown(router.dispose);
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          translatorProvider.overrideWithValue(const StaticTranslatorEn()),
          networkInterfaceMonitorProvider.overrideWithValue(
            FakeNetworkMonitor(),
          ),
          reachabilityProbeProvider.overrideWithValue(FakeProbe().call),
          appStartupProvider.overrideWith(_ReadyStartup.new),
          // Owner 2026-10-23: the apps ship with guest browsing off; these
          // tests are about the screens a guest sees when it is on.
          guestBrowsingEnabledProvider.overrideWithValue(true),
          dioProvider.overrideWith((ref) {
            final dio = Dio(BaseOptions(baseUrl: 'http://test'))
              ..httpClientAdapter = adapter;
            dio.interceptors.add(AuthInterceptor(ref, dio));
            return dio;
          }),
        ],
        child: MaterialApp.router(
          theme: AppTheme.light(),
          routerConfig: router,
        ),
      ),
    );
    await tester.pump(const Duration(seconds: 1));
    await tester.pump(const Duration(seconds: 1));
    return adapter;
  }

  Future<void> close(WidgetTester tester) async {
    await tester.pumpWidget(const SizedBox());
    await tester.pump(const Duration(seconds: 6));
  }

  /// The routes the API opens to a guest (`@OptionalAuth()`), plus the
  /// public ones these screens use.
  bool guestReadable(RequestOptions r) {
    if (r.method != 'GET') return false;
    final p = r.path;
    return RegExp(
          '^/(feed|reels|practice-areas|posts/[^/]+|attorneys/[^/]+/posts|'
          'search/(attorneys|suggest|practices|posts|tags|trending-tags|latest-posts)|'
          r'tags/[^/]+/posts|channels/[^/]+|channels/[^/]+/posts(/[^/]+)?)$',
        ).hasMatch(p) ||
        (RegExp(r'^/attorneys/[^/]+$').hasMatch(p) &&
            !p.startsWith('/attorneys/me') &&
            p != '/attorneys/username-available' &&
            p != '/attorneys/username-suggestions');
  }

  void expectOnlyGuestCalls(FakeHttpAdapter a) {
    for (final r in a.requests) {
      expect(guestReadable(r), isTrue, reason: '${r.method} ${r.path}');
      expect(r.headers.containsKey('Authorization'), isFalse);
    }
  }

  testWidgets('feed: real posts, no token, no chats, only guest calls', (
    tester,
  ) async {
    final a = await pump(tester, '/feed', _server);
    expect(find.text('Hello world'), findsWidgets);
    expect(a.requests.map((r) => r.path), contains('/feed'));
    expectOnlyGuestCalls(a);
    // Chats (and its icon) are for accounts.
    expect(find.bySemanticsLabel(RegExp('Chats|Open chats')), findsNothing);
    expect(find.text('Reels'), findsOneWidget);
    await close(tester);
  });

  testWidgets('feed: the Reels tab reads GET /reels with no token', (
    tester,
  ) async {
    final a = await pump(tester, '/feed', _server);
    await tester.tap(find.text('Reels'));
    for (var i = 0; i < 6; i++) {
      await tester.pump(const Duration(milliseconds: 300));
    }
    expect(a.requests.map((r) => r.path), contains('/reels'));
    expectOnlyGuestCalls(a);
    await close(tester);
  });

  testWidgets('feed: a 401 says «sign in», a 429 says «try later»', (
    tester,
  ) async {
    final a = await pump(
      tester,
      '/feed',
      (o) async =>
          o.path == '/feed' ? apiError(401, 'UNAUTHORIZED') : ok(<Object>[]),
    );
    expect(find.text('Sign in to see this.'), findsWidgets);
    expectOnlyGuestCalls(a);
    await close(tester);

    final b = await pump(
      tester,
      '/feed',
      (o) async => o.path == '/feed'
          ? apiError(429, 'RATE_LIMITED', {'retryAfterSeconds': 30})
          : ok(<Object>[]),
    );
    expect(
      find.text(const StaticTranslatorEn().t('guest.error.later')),
      findsWidgets,
    );
    expectOnlyGuestCalls(b);
    await close(tester);
  });

  testWidgets('search: the People tab uses the attorney search, no clicks', (
    tester,
  ) async {
    final a = await pump(tester, '/search', _server);
    await tester.enterText(find.byType(TextField).first, 'divorce');
    await tester.pump(const Duration(seconds: 1));
    await tester.pump(const Duration(seconds: 1));
    final paths = a.requests.map((r) => r.path).toList();
    expect(paths, contains('/search/attorneys'));
    expect(paths, isNot(contains('/search/people')));
    expectOnlyGuestCalls(a);
    await close(tester);
  });

  testWidgets('profile: posts load, reviews and Follow ask to sign in', (
    tester,
  ) async {
    final a = await pump(tester, '/lawyer/anna', _server);
    expect(find.text('Anna Lee'), findsWidgets);
    final paths = a.requests.map((r) => r.path).toList();
    expect(paths, contains('/attorneys/anna'));
    expect(paths, contains('/attorneys/a1/posts'));
    expect(paths.where((p) => p.contains('reviews')), isEmpty);
    expectOnlyGuestCalls(a);
    await close(tester);
  });

  testWidgets('profile: 401 shows the sign-in gate, 429 the try-later note', (
    tester,
  ) async {
    await pump(
      tester,
      '/lawyer/anna',
      (o) async => apiError(401, 'UNAUTHORIZED'),
    );
    expect(find.byKey(const ValueKey('guest-gate')), findsOneWidget);
    await close(tester);
    await pump(
      tester,
      '/lawyer/anna',
      (o) async => apiError(429, 'RATE_LIMITED'),
    );
    expect(find.byKey(const ValueKey('guest-later')), findsOneWidget);
    await close(tester);
  });

  testWidgets('post: the post loads, the comments ask to sign in', (
    tester,
  ) async {
    final a = await pump(tester, '/post/p1', _server);
    expect(find.text('Hello world'), findsWidgets);
    expect(
      a.requests.map((r) => r.path),
      isNot(contains('/posts/p1/comments')),
    );
    expect(find.text('Sign in to see this.'), findsWidgets);
    expectOnlyGuestCalls(a);
    await close(tester);
  });

  testWidgets('tag page reads GET /tags/:tag/posts with no token', (
    tester,
  ) async {
    final a = await pump(tester, '/tag/divorce', _server);
    expect(a.requests.map((r) => r.path), contains('/tags/divorce/posts'));
    expectOnlyGuestCalls(a);
    await close(tester);
  });

  testWidgets('an action (follow) asks a guest to sign in, nothing is sent', (
    tester,
  ) async {
    final a = await pump(tester, '/follow', _server);
    await tester.tap(find.byType(FollowButton));
    await tester.pumpAndSettle();
    expect(find.text('WELCOME'), findsOneWidget);
    expect(a.requests, isEmpty);
    await close(tester);
  });

  testWidgets('the sign-in bar is a plain strip with one button', (
    tester,
  ) async {
    await pump(tester, '/bar', _server);
    await tester.tap(find.byKey(const ValueKey('guest-sign-in')));
    await tester.pumpAndSettle();
    expect(find.text('WELCOME'), findsOneWidget);
    await close(tester);
  });

  testWidgets('a link preview is never asked for by a guest', (tester) async {
    final a = await pump(tester, '/bar', _server);
    final c = ProviderScope.containerOf(tester.element(find.byType(Scaffold)));
    expect(
      await c.read(linkPreviewProvider('https://example.com').future),
      isNull,
    );
    expect(a.requests, isEmpty);
    await close(tester);
  });

  test(
    'a guest request is stamped, a signed-in one carries the bearer',
    () async {
      final adapter = FakeHttpAdapter(
        (o) async => apiError(401, 'UNAUTHORIZED'),
      );
      late Dio dio;
      final container = ProviderContainer(
        overrides: [
          dioProvider.overrideWith((ref) {
            dio = Dio(BaseOptions(baseUrl: 'http://test'))
              ..httpClientAdapter = adapter;
            dio.interceptors.add(AuthInterceptor(ref, dio));
            return dio;
          }),
        ],
      );
      addTearDown(container.dispose);
      Object? error;
      try {
        await container.read(dioProvider).get<dynamic>('/feed');
      } on DioException catch (e) {
        error = ApiException.fromDioException(e);
      }
      expect(error, isA<ApiException>());
      final e = error! as ApiException;
      expect(e.guest, isTrue);
      expect(e.code, 'UNAUTHORIZED');
      // No refresh attempt, no second request.
      expect(adapter.requests, hasLength(1));
      expect(
        adapter.requests.single.headers.containsKey('Authorization'),
        isFalse,
      );
      const t = StaticTranslatorEn();
      expect(apiErrorText(t, e), t.t('guest.error.signIn'));
      expect(
        apiErrorText(
          t,
          const ApiException(
            code: ApiErrorCodes.rateLimited,
            message: 'x',
            guest: true,
          ),
        ),
        t.t('guest.error.later'),
      );
      // The same 401 for an account is not a guest note.
      expect(
        apiErrorText(
          t,
          const ApiException(code: ApiErrorCodes.unauthorized, message: 'x'),
        ),
        isNot(t.t('guest.error.signIn')),
      );
    },
  );

  test('guest browsing: off in the app unless the server key says true', () {
    // An older server sends no key: off in the app, on for the website.
    expect(guestBrowseSwitchOn(const {}, web: false), isFalse);
    expect(guestBrowseSwitchOn(const {}, web: true), isTrue);
    expect(
      guestBrowseSwitchOn(
        const {'client.guest_browse_app_enabled': 'false'},
        web: false,
      ),
      isFalse,
    );
    expect(
      guestBrowseSwitchOn(
        const {'client.guest_browse_app_enabled': 'true'},
        web: false,
      ),
      isTrue,
    );
    // The two keys are independent.
    expect(
      guestBrowseSwitchOn(
        const {'client.guest_browse_app_enabled': 'true'},
        web: true,
      ),
      isTrue,
    );
    expect(
      guestBrowseSwitchOn(
        const {'client.guest_browse_web_enabled': 'false'},
        web: true,
      ),
      isFalse,
    );
    expect(
      guestBrowseSwitchOn(
        const {'client.guest_browse_web_enabled': 'false'},
        web: false,
      ),
      isFalse,
    );
  });

  test('guest routes: public screens only', () {
    for (final ok in [
      '/feed',
      '/search',
      '/lawyer/a',
      '/u/a',
      '/post/1',
      '/c/x',
      '/tag/x',
    ]) {
      expect(isGuestRoute(ok), isTrue, reason: ok);
    }
    for (final no in [
      '/mine',
      '/profile',
      '/inbox',
      '/create',
      '/qr/my',
      '/client/x',
    ]) {
      expect(isGuestRoute(no), isFalse, reason: no);
    }
  });

  testWidgets('channel page reads GET /channels/:ref with no token', (
    tester,
  ) async {
    final a = await pump(tester, '/c/news', _server);
    expect(a.requests.map((r) => r.path), contains('/channels/news'));
    expectOnlyGuestCalls(a);
    await close(tester);
  });
}

Map<String, Object?> _post(String id) => {
  'id': id,
  'commentsEnabled': true,
  'likesHidden': false,
  'viewsHidden': false,
  'kind': 'post',
  'contentClass': 'legal',
  'author': {
    'id': 'a1',
    'role': 'attorney',
    'username': 'anna',
    'verifiedBadge': true,
    'isFollowing': false,
    'trustLevel': 1,
    'practiceI18nKeys': <Object?>[],
    'advertisingLabel': false,
  },
  'body': 'Hello world',
  'media': <Object?>[],
  'attachments': <Object?>[],
  'tags': <Object?>[],
  'mentions': <Object?>[],
  'status': 'published',
  'likeCount': 0,
  'commentCount': 0,
  'saveCount': 0,
  'shareCount': 0,
  'viewCount': 0,
  'repostCount': 0,
  'createdAt': '2026-10-01T10:00:00.000Z',
  'savedByMe': false,
  'repostedByMe': false,
  'likedByMe': false,
  'isMine': false,
};

const _profile = {
  'id': 'a1',
  'username': 'anna',
  'firstName': 'Anna',
  'lastName': 'Lee',
  'bio': null,
  'firmName': null,
  'firm': null,
  'firms': <Object?>[],
  'avatarUrl': null,
  'avatarUrl256': null,
  'languages': ['en'],
  'verifiedBadge': true,
  'trustLevel': 1,
  'licensedStates': <Object?>[],
  'practiceAreas': <Object?>[],
  'rating': {'avg': 0, 'count': 0},
  'qa': {'answers': 0, 'best': 0},
  'counters': {'posts': 1, 'followers': 0, 'following': 0},
  'isSelf': false,
  'isFollowing': false,
  'consultationEnabled': false,
  'isBlocked': false,
  'hasBlockedMe': false,
  'advertisingLabel': false,
  'publicUrl': 'https://lawbid.dev/attorneys/anna/',
};

const _channel = {
  'id': 'ch1',
  'title': 'News',
  'username': 'news',
  'commentsEnabled': false,
  'status': 'active',
  'subscriberCount': 3,
  'postCount': 1,
  'owner': {
    'id': 'a1',
    'role': 'attorney',
    'username': 'anna',
    'verifiedBadge': true,
  },
  'isSubscribed': false,
  'isMuted': false,
  'createdAt': '2026-10-01T10:00:00.000Z',
};

Future<ResponseBody> _server(RequestOptions o) async {
  final p = o.path;
  if (p == '/practice-areas') return ok(<Object>[]);
  if (p == '/feed' || p == '/reels' || p.endsWith('/posts')) {
    return jsonBody({
      'data': [_post('p1')],
      'meta': <String, Object?>{},
    });
  }
  if (p == '/posts/p1') return ok(_post('p1'));
  if (p == '/attorneys/anna') return ok(_profile);
  if (p == '/channels/news') return ok(_channel);
  if (p.startsWith('/search/')) return ok(<Object>[]);
  return apiError(401, 'UNAUTHORIZED');
}
