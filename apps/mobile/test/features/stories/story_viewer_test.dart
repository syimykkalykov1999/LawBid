import 'package:flutter/material.dart';
import 'package:flutter_riverpod/misc.dart' show Override;
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/features/stories/domain/story_models.dart';
import 'package:lawbid/features/stories/presentation/story_viewer_screen.dart';
import 'package:lawbid/shared/domain/cursor_page.dart';

import 'stories_fakes.dart';
import 'stories_harness.dart';

Widget _view(
  List<Story> stories, {
  required List<Override> overrides,
  VoidCallback? onClose,
  VoidCallback? onFinished,
  bool readOnly = false,
}) =>
    storyApp(
      Scaffold(
        backgroundColor: Colors.black,
        body: StoryPlaybackView(
          stories: stories,
          readOnly: readOnly,
          onClose: onClose ?? () {},
          onFinished: onFinished,
        ),
      ),
      overrides: overrides,
    );

void main() {
  setUpAll(initializeDateFormatting);

  testWidgets('plays in order, bars fill, ends on the last story',
      (tester) async {
    useSmallPhone(tester);
    var finished = 0;
    final repo = FakeStoriesRepository();
    await tester.pumpWidget(
      _view(
        [
          fakeStory('a', text: 'First story'),
          fakeStory('b', text: 'Second story'),
        ],
        overrides: await storyOverrides(repo: repo),
        onFinished: () => finished++,
      ),
    );
    await tester.pump();
    expect(find.text('First story'), findsOneWidget);
    expect(find.text('Anna Lee'), findsOneWidget);
    expect(find.byType(LinearProgressIndicator), findsNWidgets(2));
    double bar(int i) => tester
        .widget<LinearProgressIndicator>(
          find.byType(LinearProgressIndicator).at(i),
        )
        .value!;
    expect(bar(0), 0);

    await tester.pump(const Duration(milliseconds: 100));
    for (var i = 0; i < 24; i++) {
      await tester.pump(const Duration(milliseconds: 100));
    }
    expect(bar(0), inInclusiveRange(0.4, 0.6));
    expect(bar(1), 0);

    for (var i = 0; i < 52; i++) {
      await tester.pump(const Duration(milliseconds: 100));
    }
    expect(find.text('Second story'), findsOneWidget);
    expect(bar(0), 1);

    for (var i = 0; i < 52; i++) {
      await tester.pump(const Duration(milliseconds: 100));
    }
    expect(finished, 1);
    // Each story seen by someone else was marked viewed, once.
    expect(repo.viewed, ['a', 'b']);
  });

  testWidgets('tap right = next, tap left = previous; long press pauses',
      (tester) async {
    useSmallPhone(tester);
    await tester.pumpWidget(
      _view(
        [fakeStory('a', text: 'One'), fakeStory('b', text: 'Two')],
        overrides: await storyOverrides(),
      ),
    );
    await tester.pump();
    final area = find.byKey(const ValueKey('story-gestures'));
    final box = tester.getRect(area);

    await tester.tapAt(Offset(box.right - 20, box.center.dy));
    await tester.pump();
    expect(find.text('Two'), findsOneWidget);

    await tester.tapAt(Offset(box.left + 20, box.center.dy));
    await tester.pump();
    expect(find.text('One'), findsOneWidget);

    final hold = await tester.startGesture(box.center);
    await tester.pump(const Duration(milliseconds: 700));
    final before = tester
        .widget<LinearProgressIndicator>(
          find.byType(LinearProgressIndicator).first,
        )
        .value;
    await tester.pump(const Duration(seconds: 3));
    final during = tester
        .widget<LinearProgressIndicator>(
          find.byType(LinearProgressIndicator).first,
        )
        .value;
    expect(during, before, reason: 'paused while the finger is down');
    await hold.up();
    await tester.pump(const Duration(milliseconds: 100));
    await tester.pump(const Duration(seconds: 1));
    final after = tester
        .widget<LinearProgressIndicator>(
          find.byType(LinearProgressIndicator).first,
        )
        .value!;
    expect(after, greaterThan(before!));
  });

  testWidgets('swipe down closes', (tester) async {
    useSmallPhone(tester);
    var closed = 0;
    await tester.pumpWidget(
      _view(
        [fakeStory('a')],
        overrides: await storyOverrides(),
        onClose: () => closed++,
      ),
    );
    await tester.pump();
    await tester.fling(
      find.byKey(const ValueKey('story-gestures')),
      const Offset(0, 300),
      1200,
    );
    await tester.pump();
    expect(closed, 1);
  });

  testWidgets('a reply is a direct message to the author, then "Sent"',
      (tester) async {
    useSmallPhone(tester);
    final chat = FakeReplyChat();
    await tester.pumpWidget(
      _view(
        [fakeStory('a')],
        overrides: await storyOverrides(chat: chat),
      ),
    );
    await tester.pump();
    expect(find.text('Reply…'), findsOneWidget);
    await tester.enterText(
      find.byKey(const ValueKey('story-reply-field')),
      '  Nice one!  ',
    );
    await tester.pump();
    await tester.tap(find.bySemanticsLabel('Send'));
    await tester.pump();
    await tester.pump();

    expect(chat.started, ['u1']);
    expect(chat.sent.single.conversationId, 'conv-u1');
    expect(chat.sent.single.body, 'Nice one!');
    expect(chat.sent.single.clientId, hasLength(36));
    expect(find.text('Sent'), findsOneWidget);
    await tester.pump(const Duration(seconds: 2));
    expect(find.text('Sent'), findsNothing);
  });

  testWidgets('no reply field when the author turned replies off',
      (tester) async {
    useSmallPhone(tester);
    await tester.pumpWidget(
      _view(
        [fakeStory('a', canReply: false)],
        overrides: await storyOverrides(),
      ),
    );
    await tester.pump();
    expect(find.byKey(const ValueKey('story-reply-field')), findsNothing);
  });

  testWidgets('my own story: viewers button with the count, nothing marked',
      (tester) async {
    useSmallPhone(tester);
    final repo = FakeStoriesRepository(
      viewerPages: [
        CursorPage(
          items: [StoryViewer(user: bob, viewedAt: DateTime.now())],
        ),
      ],
    );
    await tester.pumpWidget(
      _view(
        [fakeStory('mine', author: meUser, mine: true, views: 3)],
        overrides: await storyOverrides(repo: repo),
      ),
    );
    await tester.pump();
    expect(find.byKey(const ValueKey('story-reply-field')), findsNothing);
    expect(find.text('3 views'), findsOneWidget);
    expect(find.byIcon(AppIcons.visibilityOutlined), findsOneWidget);
    expect(repo.viewed, isEmpty);

    await tester.tap(find.byKey(const ValueKey('story-viewers-button')));
    await tester.pumpAndSettle();
    expect(find.text('Bob'), findsOneWidget);
    expect(find.text('@bob'), findsOneWidget);
    expect(find.bySemanticsLabel('Delete'), findsOneWidget);
  });

  testWidgets('read-only (archive): no marking, no reply, no menu',
      (tester) async {
    useSmallPhone(tester);
    final repo = FakeStoriesRepository();
    await tester.pumpWidget(
      _view(
        [fakeStory('a')],
        readOnly: true,
        overrides: await storyOverrides(repo: repo),
      ),
    );
    await tester.pump();
    expect(repo.viewed, isEmpty);
    expect(find.byKey(const ValueKey('story-reply-field')), findsNothing);
    expect(find.bySemanticsLabel('More'), findsNothing);
  });

  testWidgets('stickers are drawn at their place', (tester) async {
    useSmallPhone(tester);
    await tester.pumpWidget(
      _view(
        [
          fakeStory(
            'a',
            overlays: const [
              StoryOverlay(emoji: '🔥', x: 0.25, y: 0.75, scale: 2),
            ],
          ),
        ],
        overrides: await storyOverrides(),
      ),
    );
    await tester.pump();
    final sticker = find.text('🔥');
    expect(sticker, findsOneWidget);
    final frame = tester.getRect(find.byKey(const ValueKey('story-gestures')));
    final c = tester.getCenter(sticker);
    expect(c.dx, closeTo(frame.left + frame.width * 0.25, 2));
    expect(c.dy, closeTo(frame.top + frame.height * 0.75, 2));
  });
}
