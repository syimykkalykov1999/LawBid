import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:lawbid/core/navigation/root_messenger.dart';
import 'package:lawbid/core/navigation/system_back.dart';

/// Owner 2026-10-22: the Android SYSTEM back (hardware key, gesture, gesture
/// bar — all reach the app as `popRoute`) goes to the previous screen
/// wherever a screen was opened from, and closes the app only from the first
/// tab on a second press.
final _root = GlobalKey<NavigatorState>();

GoRouter _router() => GoRouter(
      navigatorKey: _root,
      initialLocation: '/feed',
      routes: [
        StatefulShellRoute.indexedStack(
          builder: (c, s, shell) => Scaffold(body: shell),
          branches: [
            StatefulShellBranch(
              routes: [
                GoRoute(
                  path: '/feed',
                  builder: (c, s) => const _FeedWithChats(),
                ),
              ],
            ),
            StatefulShellBranch(
              routes: [
                GoRoute(
                  path: '/search',
                  builder: (c, s) => const Text('search'),
                ),
              ],
            ),
            StatefulShellBranch(
              routes: [
                GoRoute(path: '/mine', builder: (c, s) => const Text('mine')),
              ],
            ),
            StatefulShellBranch(
              routes: [
                GoRoute(
                  path: '/profile',
                  builder: (c, s) => Builder(
                    builder: (c) => Column(
                      children: [
                        const Text('profile'),
                        // The profile grid → the post feed
                        // (PostsFeedScreen.open).
                        TextButton(
                          onPressed: () =>
                              Navigator.of(c, rootNavigator: true).push(
                            MaterialPageRoute<void>(
                              builder: (_) => const Text('postsFeed'),
                            ),
                          ),
                          child: const Text('imperative'),
                        ),
                        TextButton(
                          onPressed: () => c.push('/post/1'),
                          child: const Text('pushed'),
                        ),
                        TextButton(
                          onPressed: () => c.push('/profile/settings'),
                          child: const Text('settings'),
                        ),
                      ],
                    ),
                  ),
                ),
              ],
            ),
          ],
        ),
        GoRoute(
          path: '/post/:id',
          parentNavigatorKey: _root,
          builder: (c, s) => const Text('post'),
        ),
        GoRoute(
          path: '/profile/settings',
          parentNavigatorKey: _root,
          builder: (c, s) => Builder(
            builder: (c) => Column(
              children: [
                const Text('settingsPage'),
                TextButton(
                  onPressed: () => c.push('/profile/settings/devices'),
                  child: const Text('devices'),
                ),
              ],
            ),
          ),
        ),
        GoRoute(
          path: '/profile/settings/devices',
          parentNavigatorKey: _root,
          builder: (c, s) => const Text('devicesPage'),
        ),
        // A screen that stands alone after a `context.go` (the chat list).
        GoRoute(
          path: '/chats',
          parentNavigatorKey: _root,
          builder: (c, s) => const Text('chats'),
        ),
        GoRoute(path: '/welcome', builder: (c, s) => const Text('welcome')),
      ],
    );

/// The feed as the app builds it: Chats is a page of the feed itself, and
/// the feed's PopScope turns Android back into «slide back to the feed».
class _FeedWithChats extends StatefulWidget {
  const _FeedWithChats();

  @override
  State<_FeedWithChats> createState() => _FeedWithChatsState();
}

class _FeedWithChatsState extends State<_FeedWithChats> {
  bool _chats = false;

  @override
  Widget build(BuildContext context) => PopScope(
        canPop: !_chats,
        onPopInvokedWithResult: (didPop, _) {
          if (!didPop && _chats) setState(() => _chats = false);
        },
        child: _chats
            ? const Text('chatsPage')
            : TextButton(
                onPressed: () => setState(() => _chats = true),
                child: const Text('feed'),
              ),
      );
}

void main() {
  late List<String> platformCalls;

  setUp(() {
    platformCalls = [];
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(SystemChannels.platform, (call) async {
      platformCalls.add(call.method);
      return null;
    });
  });

  Future<GoRouter> pump(WidgetTester tester, {String at = '/profile'}) async {
    final r = _router();
    await tester.pumpWidget(
      MaterialApp.router(
        scaffoldMessengerKey: rootMessengerKey,
        routerConfig: r,
        builder: (context, child) => SystemBackGuard(
          router: r,
          rootNavigatorKey: _root,
          exitHint: () => 'press again',
          child: child!,
        ),
      ),
    );
    r.go(at);
    await tester.pumpAndSettle();
    return r;
  }

  Future<void> back(WidgetTester tester) async {
    await tester.binding.handlePopRoute();
    await tester.pumpAndSettle();
  }

  testWidgets('profile grid → post feed: back returns to the profile',
      (tester) async {
    await pump(tester);
    await tester.tap(find.text('imperative'));
    await tester.pumpAndSettle();
    expect(find.text('postsFeed'), findsOneWidget);
    await back(tester);
    expect(find.text('profile'), findsOneWidget);
    expect(find.text('postsFeed'), findsNothing);
    expect(platformCalls, isNot(contains('SystemNavigator.pop')));
  });

  testWidgets('post pushed from the profile: back returns to the profile',
      (tester) async {
    await pump(tester);
    await tester.tap(find.text('pushed'));
    await tester.pumpAndSettle();
    await back(tester);
    expect(find.text('profile'), findsOneWidget);
    expect(platformCalls, isNot(contains('SystemNavigator.pop')));
  });

  testWidgets('settings subpage → settings → profile, one step per press',
      (tester) async {
    await pump(tester);
    await tester.tap(find.text('settings'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('devices'));
    await tester.pumpAndSettle();
    expect(find.text('devicesPage'), findsOneWidget);
    await back(tester);
    expect(find.text('settingsPage'), findsOneWidget);
    await back(tester);
    expect(find.text('profile'), findsOneWidget);
    expect(platformCalls, isNot(contains('SystemNavigator.pop')));
  });

  testWidgets('a tab other than the first: back goes to the first tab',
      (tester) async {
    await pump(tester);
    await back(tester);
    expect(find.text('feed'), findsOneWidget);
    expect(platformCalls, isNot(contains('SystemNavigator.pop')));
  });

  testWidgets('a signed-in screen opened with go (chat list): back → feed',
      (tester) async {
    await pump(tester, at: '/chats');
    expect(find.text('chats'), findsOneWidget);
    await back(tester);
    expect(find.text('feed'), findsOneWidget);
    expect(platformCalls, isNot(contains('SystemNavigator.pop')));
  });

  testWidgets('first tab: first press hints, second press leaves',
      (tester) async {
    await pump(tester, at: '/feed');
    await back(tester);
    expect(find.text('press again'), findsOneWidget);
    expect(platformCalls, isNot(contains('SystemNavigator.pop')));
    await back(tester);
    expect(platformCalls, contains('SystemNavigator.pop'));
  });

  testWidgets('sign-in screens keep the platform default (leave)',
      (tester) async {
    await pump(tester, at: '/welcome');
    await back(tester);
    expect(platformCalls, contains('SystemNavigator.pop'));
  });

  testWidgets(
      'Chats opened from the feed: one back returns to the feed, '
      'no exit hint; then the root asks to press again', (tester) async {
    await pump(tester, at: '/feed');
    await tester.tap(find.text('feed'));
    await tester.pumpAndSettle();
    expect(find.text('chatsPage'), findsOneWidget);
    await back(tester);
    expect(find.text('feed'), findsOneWidget);
    expect(find.text('press again'), findsNothing);
    expect(platformCalls, isNot(contains('SystemNavigator.pop')));
    await back(tester);
    expect(find.text('press again'), findsOneWidget);
    await back(tester);
    expect(platformCalls, contains('SystemNavigator.pop'));
  });
}
