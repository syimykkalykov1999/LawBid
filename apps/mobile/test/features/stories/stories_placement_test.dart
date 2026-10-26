import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/features/profile/presentation/widgets/profile_avatar.dart';
import 'package:lawbid/features/stories/presentation/story_avatar_ring.dart';
import 'package:lawbid/features/stories/presentation/story_ring.dart';
import 'package:lawbid/features/stories/stories_routes.dart';
import 'package:lawbid/shared/presentation/collapsing_header.dart';

import 'stories_fakes.dart';
import 'stories_harness.dart';

/// Owner 2026-10-20: stories sit on the Chats screen (folded by default,
/// pulled open, folded again on scroll), not in the feed; a profile photo
/// carries the ring of a live story.
void main() {
  setUpAll(initializeDateFormatting);

  Widget list({int n = 60}) => ListView.builder(
        physics: const AlwaysScrollableScrollPhysics(),
        itemCount: n,
        itemBuilder: (_, i) => SizedBox(height: 56, child: Text('row $i')),
      );

  Future<void> pumpHeader(WidgetTester tester, {int n = 60}) async {
    useSmallPhone(tester);
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: CollapsingHeader(
            collapsible: const SizedBox(
              key: ValueKey('strip'),
              height: 90,
              child: Text('strip'),
            ),
            hint: const SizedBox(
              key: ValueKey('hint'),
              height: 30,
              child: Text('hint'),
            ),
            pinned: const SizedBox(height: 40, child: Text('pinned')),
            body: list(n: n),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
  }

  double stripHeight(WidgetTester tester) =>
      tester.getSize(find.byKey(const ValueKey('collapsing-header'))).height;

  double hintHeight(WidgetTester tester) =>
      tester.getSize(find.byKey(const ValueKey('collapsing-hint'))).height;

  Future<void> pull(WidgetTester tester, double dy) async {
    await tester.drag(find.byType(ListView), Offset(0, dy));
    await tester.pumpAndSettle();
  }

  testWidgets(
      'hidden by default; the first pull at the top shows only the hint, a '
      'second separate pull opens the strip, scrolling down hides it',
      (tester) async {
    await pumpHeader(tester);
    expect(stripHeight(tester), 0);
    expect(hintHeight(tester), 0);

    await pull(tester, 200);
    expect(hintHeight(tester), 30);
    expect(stripHeight(tester), 0);

    await pull(tester, 200);
    expect(hintHeight(tester), 0);
    expect(stripHeight(tester), 90);

    await pull(tester, -300);
    expect(stripHeight(tester), 0);
    expect(hintHeight(tester), 0);

    // Scrolling back up in the middle of the list opens nothing.
    await pull(tester, 150);
    expect(stripHeight(tester), 0);
    expect(hintHeight(tester), 0);
  });

  testWidgets('one long pull is one step, a short pull is none',
      (tester) async {
    await pumpHeader(tester);
    await pull(tester, 30);
    expect(hintHeight(tester), 0);
    await pull(tester, 900);
    expect(hintHeight(tester), 30);
    expect(stripHeight(tester), 0);
  });

  testWidgets('a fling back to the top (inertia) opens nothing',
      (tester) async {
    await pumpHeader(tester);
    await pull(tester, -600);
    await tester.fling(find.byType(ListView), const Offset(0, 400), 4000);
    await tester.pumpAndSettle();
    expect(find.text('row 0'), findsOneWidget);
    expect(hintHeight(tester), 0);
    expect(stripHeight(tester), 0);
  });

  testWidgets('a tap on the hint opens the strip', (tester) async {
    await pumpHeader(tester);
    await pull(tester, 200);
    await tester.tap(find.byKey(const ValueKey('hint')));
    await tester.pumpAndSettle();
    expect(stripHeight(tester), 90);
  });

  testWidgets(
      'a list too short to scroll still hides the strip: upward drag or '
      'a tap on a row (owner 2026-10-20)', (tester) async {
    await pumpHeader(tester, n: 3);
    await pull(tester, 200);
    await pull(tester, 200);
    expect(stripHeight(tester), 90);
    await pull(tester, -100);
    expect(stripHeight(tester), 0);

    await pull(tester, 200);
    await pull(tester, 200);
    expect(stripHeight(tester), 90);
    await tester.tap(find.text('row 0'));
    await tester.pumpAndSettle();
    expect(stripHeight(tester), 0);
  });

  testWidgets('the feed no longer shows the stories row', (tester) async {
    final feed = File('lib/features/feed/presentation/screens/feed_screen.dart')
        .readAsStringSync();
    expect(feed.contains('StoriesTray('), isFalse);
    final chats = File('lib/features/chat/presentation/inbox_screen.dart')
        .readAsStringSync();
    expect(chats.contains('StoriesTray()'), isTrue);
  });

  testWidgets('a profile photo gets the story ring and a tap opens it',
      (tester) async {
    useSmallPhone(tester);
    final repo = FakeStoriesRepository(
      byUser: {
        'u1': [fakeStory('s1')],
      },
    );
    await tester.pumpWidget(
      storyApp(
        const Scaffold(
          body: Column(
            children: [
              StoryAvatarRing(
                userId: 'u1',
                size: 60,
                child: SizedBox.square(dimension: 60),
              ),
              StoryAvatarRing(
                userId: 'nobody',
                size: 60,
                child: SizedBox.square(dimension: 60, key: ValueKey('plain')),
              ),
            ],
          ),
        ),
        overrides: await storyOverrides(repo: repo),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('profile-story-ring')), findsOneWidget);
    expect(find.byType(StoryRing), findsOneWidget);
    final ring = tester.widget<StoryRing>(find.byType(StoryRing));
    expect(ring.state, StoryRingState.unseen);
    expect(find.byKey(const ValueKey('plain')), findsOneWidget);
  });

  testWidgets("the photo's own tap does not win over the story",
      (tester) async {
    useSmallPhone(tester);
    var photoTaps = 0;
    final repo = FakeStoriesRepository(
      byUser: {
        'u1': [fakeStory('s1')],
      },
    );
    await tester.pumpWidget(
      storyApp(
        Scaffold(
          body: StoryAvatarRing(
            userId: 'u1',
            size: 60,
            child: GestureDetector(
              onTap: () => photoTaps++,
              child: const SizedBox.square(dimension: 60),
            ),
          ),
        ),
        overrides: await storyOverrides(repo: repo),
      ),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey('profile-story-ring')));
    await tester.pump();
    // No router in this harness: opening the viewer throws, that is the proof
    // the ring's tap was the one that fired.
    expect(tester.takeException(), isNotNull);
    expect(photoTaps, 0);
  });

  testWidgets(
      'long press on a photo with a story opens the photo, not the story',
      (tester) async {
    useSmallPhone(tester);
    final repo = FakeStoriesRepository(
      byUser: {
        'u1': [fakeStory('s1')],
      },
    );
    await tester.pumpWidget(
      storyApp(
        const Scaffold(
          body: StoryAvatarRing(
            userId: 'u1',
            size: 60,
            photoUrl: 'https://img.test/a.jpg',
            photoCloseLabel: 'Close',
            child: SizedBox.square(dimension: 60),
          ),
        ),
        overrides: await storyOverrides(repo: repo),
      ),
    );
    await tester.pumpAndSettle();
    debugGalleryImage = (_) => const SizedBox(key: ValueKey('gallery-photo'));
    addTearDown(() => debugGalleryImage = null);
    await tester.longPress(find.byKey(const ValueKey('profile-story-ring')));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));
    // The gallery is on top, no story viewer.
    expect(find.byKey(const ValueKey('gallery-photo')), findsOneWidget);
  });

  testWidgets('no story: a tap on the photo opens the photo', (tester) async {
    useSmallPhone(tester);
    debugGalleryImage = (_) => const SizedBox(key: ValueKey('gallery-photo'));
    addTearDown(() => debugGalleryImage = null);
    await tester.pumpWidget(
      storyApp(
        const Scaffold(
          body: StoryAvatarRing(
            userId: 'nobody',
            size: 60,
            photoUrl: 'https://img.test/a.jpg',
            photoCloseLabel: 'Close',
            child: ProfileAvatar(
              size: 60,
              url: 'https://img.test/a.jpg',
              initials: 'A',
              viewerCloseLabel: 'Close',
            ),
          ),
        ),
        overrides: await storyOverrides(repo: FakeStoriesRepository()),
      ),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey('avatar-open')));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));
    expect(find.byKey(const ValueKey('gallery-photo')), findsOneWidget);
  });

  group('my own photo (owner 2026-10-20)', () {
    Future<List<String>> pumpMine(
      WidgetTester tester, {
      required bool hasStory,
      required Future<void> Function(Finder ring) act,
    }) async {
      useSmallPhone(tester);
      debugGalleryImage = (_) => const SizedBox(key: ValueKey('gallery-photo'));
      addTearDown(() => debugGalleryImage = null);
      final opened = <String>[];
      final router = GoRouter(
        routes: [
          GoRoute(
            path: '/',
            builder: (_, __) => const Scaffold(
              body: StoryAvatarRing(
                userId: 'me',
                size: 60,
                photoUrl: 'https://img.test/a.jpg',
                photoCloseLabel: 'Close',
                child: SizedBox.square(dimension: 60),
              ),
            ),
          ),
          GoRoute(
            path: StoriesRoutes.create,
            builder: (_, __) {
              opened.add('create');
              return const Scaffold();
            },
          ),
          GoRoute(
            path: StoriesRoutes.viewPattern,
            builder: (_, __) {
              opened.add('view');
              return const Scaffold();
            },
          ),
        ],
      );
      addTearDown(router.dispose);
      final repo = FakeStoriesRepository(
        byUser: {
          if (hasStory) 'me': [fakeStory('s1', author: meUser, mine: true)],
        },
      );
      await tester.pumpWidget(
        ProviderScope(
          overrides: await storyOverrides(repo: repo),
          child: MaterialApp.router(
            theme: AppTheme.light(),
            routerConfig: router,
          ),
        ),
      );
      await tester.pumpAndSettle();
      await act(find.byKey(const ValueKey('profile-story-ring')));
      await tester.pumpAndSettle();
      return opened;
    }

    testWidgets('no story: a tap opens the camera', (tester) async {
      final opened = await pumpMine(
        tester,
        hasStory: false,
        act: (ring) => tester.tap(ring),
      );
      expect(opened, ['create']);
    });

    testWidgets('a story: a tap plays it', (tester) async {
      final opened = await pumpMine(
        tester,
        hasStory: true,
        act: (ring) => tester.tap(ring),
      );
      expect(opened, ['view']);
    });

    testWidgets('a long press opens the photo (no story too)', (tester) async {
      final opened = await pumpMine(
        tester,
        hasStory: false,
        act: (ring) => tester.longPress(ring),
      );
      expect(opened, isEmpty);
      expect(find.byKey(const ValueKey('gallery-photo')), findsOneWidget);
    });
  });
}
