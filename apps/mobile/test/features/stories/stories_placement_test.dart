import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lawbid/features/stories/presentation/story_avatar_ring.dart';
import 'package:lawbid/features/stories/presentation/story_ring.dart';
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

  testWidgets(
      'folded by default, a pull at the top opens it, scrolling '
      'down folds it again', (tester) async {
    await pumpHeader(tester);
    expect(stripHeight(tester), 0);

    await tester.drag(find.byType(ListView), const Offset(0, 200));
    await tester.pumpAndSettle();
    expect(stripHeight(tester), 90);

    await tester.drag(find.byType(ListView), const Offset(0, -300));
    await tester.pumpAndSettle();
    expect(stripHeight(tester), 0);

    // Scrolling back up in the middle of the list does not open it.
    await tester.drag(find.byType(ListView), const Offset(0, 150));
    await tester.pumpAndSettle();
    expect(stripHeight(tester), 0);
  });

  testWidgets('a list too short to scroll never folds the strip',
      (tester) async {
    await pumpHeader(tester, n: 3);
    await tester.drag(find.byType(ListView), const Offset(0, 200));
    await tester.pumpAndSettle();
    expect(stripHeight(tester), 90);
    await tester.drag(find.byType(ListView), const Offset(0, -100));
    await tester.pumpAndSettle();
    expect(stripHeight(tester), 90);
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
}
