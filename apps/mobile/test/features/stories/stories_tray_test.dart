import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/features/stories/application/story_publish_job.dart';
import 'package:lawbid/features/stories/domain/story_models.dart';
import 'package:lawbid/features/stories/presentation/stories_tray.dart';
import 'package:lawbid/features/stories/presentation/story_ring.dart';

import 'stories_fakes.dart';
import 'stories_harness.dart';

StoryRingState _ringOf(WidgetTester tester, String userId) => tester
    .widget<StoryRingAvatar>(
      find.descendant(
        of: find.byKey(ValueKey('story-bubble-$userId')),
        matching: find.byType(StoryRingAvatar),
      ),
    )
    .state;

void main() {
  setUpAll(initializeDateFormatting);

  testWidgets('own circle first with "+", unseen = gold ring, seen = grey',
      (tester) async {
    useSmallPhone(tester);
    final repo = FakeStoriesRepository(
      trayItems: [
        trayItem(meUser, isMe: true, count: 0, unseen: 0),
        trayItem(anna),
        trayItem(bob, unseen: 0),
      ],
    );
    await tester.pumpWidget(
      storyApp(
        const Scaffold(body: StoriesTray()),
        overrides: await storyOverrides(repo: repo),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('You'), findsOneWidget);
    expect(find.byIcon(AppIcons.addRounded), findsOneWidget);
    expect(_ringOf(tester, 'me'), StoryRingState.none);
    expect(_ringOf(tester, 'u1'), StoryRingState.unseen);
    expect(_ringOf(tester, 'u2'), StoryRingState.seen);
    expect(find.bySemanticsLabel('Anna Lee: new stories'), findsOneWidget);
    expect(find.bySemanticsLabel('Bob: stories seen'), findsOneWidget);

    // Own circle is first, then the unseen one.
    final order = tester
        .widgetList<StoryRingAvatar>(find.byType(StoryRingAvatar))
        .map((w) => w.user.id)
        .toList();
    expect(order, ['me', 'u1', 'u2']);
  });

  testWidgets('own live stories show a ring', (tester) async {
    useSmallPhone(tester);
    final repo = FakeStoriesRepository(
      trayItems: [trayItem(meUser, isMe: true, count: 2, unseen: 0)],
    );
    await tester.pumpWidget(
      storyApp(
        const Scaffold(body: StoriesTray()),
        overrides: await storyOverrides(repo: repo),
      ),
    );
    await tester.pumpAndSettle();
    expect(_ringOf(tester, 'me'), StoryRingState.unseen);
  });

  testWidgets('nothing at all while the flag is off (no request either)',
      (tester) async {
    final repo = FakeStoriesRepository(trayItems: [trayItem(anna)]);
    await tester.pumpWidget(
      storyApp(
        const Scaffold(body: StoriesTray()),
        overrides: await storyOverrides(repo: repo, enabled: false),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.byType(StoryRingAvatar), findsNothing);
    expect(find.byType(ListView), findsNothing);
    expect(repo.trayCalls, 0);
  });

  testWidgets('nothing while the tray is empty or fails', (tester) async {
    await tester.pumpWidget(
      storyApp(
        const Scaffold(body: StoriesTray()),
        overrides: await storyOverrides(),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.byType(ListView), findsNothing);
  });

  testWidgets('while my story is posting the own circle shows progress',
      (tester) async {
    useSmallPhone(tester);
    final repo = FakeStoriesRepository(
      trayItems: [trayItem(meUser, isMe: true, count: 0, unseen: 0)],
    );
    final container = ProviderContainer(
      overrides: await storyOverrides(repo: repo),
    );
    addTearDown(container.dispose);
    await tester.pumpWidget(
      UncontrolledProviderScope(
        container: container,
        child: MaterialApp(
          theme: AppTheme.light(),
          home: const Scaffold(body: StoriesTray()),
        ),
      ),
    );
    await tester.pumpAndSettle();
    final avatar = find.byType(StoryRingAvatar);
    expect(tester.widget<StoryRingAvatar>(avatar).progress, isNull);

    // A text story is posted by the job; the failure keeps a red ring.
    repo.failCreate = Exception('boom');
    final job = container.read(storyPublishJobProvider.notifier);
    await job.start(
      const StoryDraft(
        kind: StoryKind.text,
        audience: StoryAudience.all,
        text: 'Hi',
      ),
    );
    await tester.pumpAndSettle();
    expect(
      container.read(storyPublishJobProvider).phase,
      StoryPublishPhase.failed,
    );
    expect(_ringOf(tester, 'me'), StoryRingState.failed);
  });
}
