import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lawbid/features/stories/domain/story_models.dart';
import 'package:lawbid/features/stories/presentation/story_creator_screen.dart';

import 'stories_fakes.dart';
import 'stories_harness.dart';

void main() {
  setUpAll(initializeDateFormatting);

  Future<FakeStoriesRepository> open(WidgetTester tester) async {
    useSmallPhone(tester);
    final repo = FakeStoriesRepository();
    await tester.pumpWidget(
      storyApp(
        const StoryCreatorScreen(),
        overrides: await storyOverrides(repo: repo),
      ),
    );
    await tester.pump();
    return repo;
  }

  testWidgets('a text story: Share is off until there is text, then posts',
      (tester) async {
    final repo = await open(tester);
    expect(find.text('Text story'), findsOneWidget);
    await tester.tap(find.byKey(const ValueKey('story-pick-text')));
    await tester.pump(const Duration(milliseconds: 300));

    // Nothing typed: Share does nothing.
    await tester.tap(find.text('Share'));
    await tester.pump();
    expect(repo.created, isEmpty);

    await tester.enterText(
      find.byKey(const ValueKey('story-text-field')),
      'Hello court',
    );
    await tester.tap(find.byKey(const ValueKey('story-bg-ocean')));
    await tester.pump();
    // The default audience comes from the saved settings (followers).
    await tester.tap(find.text('Share'));
    await tester.pump(const Duration(milliseconds: 100));
    await tester.pump(const Duration(milliseconds: 100));

    expect(repo.created.single['kind'], StoryKind.text);
    expect(repo.created.single['text'], 'Hello court');
    expect(repo.created.single['background'], 'ocean');
    expect(repo.created.single['audience'], StoryAudience.followers);
  });

  testWidgets('the audience of this story can differ from the default',
      (tester) async {
    final repo = await open(tester);
    await tester.tap(find.byKey(const ValueKey('story-pick-text')));
    await tester.pump(const Duration(milliseconds: 300));
    await tester.enterText(
      find.byKey(const ValueKey('story-text-field')),
      'Only for contacts',
    );
    await tester.tap(find.byKey(const ValueKey('story-audience-chip')));
    await tester.pumpAndSettle();
    await tester.tap(find.text('My contacts'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Share'));
    await tester.pump(const Duration(milliseconds: 100));
    await tester.pump(const Duration(milliseconds: 100));
    expect(repo.created.single['audience'], StoryAudience.contacts);
  });

  testWidgets('a sticker is placed, dragged and dropped on the bin to remove',
      (tester) async {
    await open(tester);
    await tester.tap(find.byKey(const ValueKey('story-pick-text')));
    await tester.pump(const Duration(milliseconds: 300));
    await tester.tap(find.bySemanticsLabel('Add a sticker'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('🔥'));
    await tester.pumpAndSettle();

    final sticker = find.text('🔥');
    expect(sticker, findsOneWidget);
    final start = tester.getCenter(sticker);

    // Drag a little: it follows the finger.
    await tester.drag(sticker, const Offset(20, 30));
    await tester.pump();
    final moved = tester.getCenter(find.text('🔥'));
    expect(moved.dx, greaterThan(start.dx + 10));
    expect(moved.dy, greaterThan(start.dy + 15));

    // Drop it at the bottom of the frame: removed.
    await tester.drag(find.text('🔥'), const Offset(0, 400));
    await tester.pump();
    expect(find.text('🔥'), findsNothing);
  });
}
