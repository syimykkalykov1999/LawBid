import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/features/feed/application/feed_content.dart';
import 'package:lawbid/features/feed/application/feed_topics.dart';
import 'package:lawbid/features/feed/application/news_flag.dart';
import 'package:lawbid/features/feed/presentation/widgets/topic_filter_bar.dart';
import 'package:lawbid/features/profile/application/profile_providers.dart';

import '../../helpers/ux_harness.dart';

class _Topics extends FeedTopicsNotifier {
  @override
  List<String> build() => const [kNewsTopic, kGeneralPostsTopic];
}

class _Mode extends FeedContentModeNotifier {
  @override
  FeedContentMode build() => FeedContentMode.all;

  @override
  Future<void> set(FeedContentMode mode) async => state = mode;
}

/// Owner 2026-10-06: News off → no News pill; "Legal posts" right after
/// "All" toggles legal-only posts.
void main() {
  Set<String>? states;

  Future<void> pump(
    WidgetTester tester, {
    required bool news,
    Set<String> picked = const {},
  }) =>
      tester.pumpWidget(
        uxApp(
          Scaffold(
            body: TopicFilterBar(
              category: null,
              onCategory: (_) {},
              stateCodes: picked,
              onStates: (v) => states = v,
            ),
          ),
          theme: AppTheme.light(),
          disableAnimations: true,
          overrides: uxOverrides(
            extra: [
              newsEnabledProvider.overrideWithValue(news),
              feedTopicsProvider.overrideWith(_Topics.new),
              feedContentModeProvider.overrideWith(_Mode.new),
              practiceTreeProvider.overrideWith((ref) async => const []),
            ],
          ),
        ),
      );

  testWidgets('News off: no News pill, "Legal posts" toggles', (tester) async {
    await pump(tester, news: false);
    expect(find.text('News'), findsNothing);
    expect(find.text('All content'), findsNothing);
    expect(find.text('Legal posts'), findsOneWidget);
    // Owner 2026-10-07: no "Posts" pill, even from a saved list.
    expect(find.text('Posts'), findsNothing);

    final container = ProviderScope.containerOf(
      tester.element(find.byType(TopicFilterBar)),
    );
    await tester.tap(find.byKey(const ValueKey('feed-legal-posts')));
    await tester.pump();
    expect(container.read(feedContentModeProvider), FeedContentMode.legalOnly);

    await tester.tap(find.byKey(const ValueKey('feed-all')));
    await tester.pump();
    expect(container.read(feedContentModeProvider), FeedContentMode.all);
  });

  testWidgets('News on: the News pill is back', (tester) async {
    await pump(tester, news: true);
    expect(find.text('News'), findsOneWidget);
  });

  // Owner 2026-10-06: the pills already pick "All" / "Legal posts", so the
  // filter sheet has no separate "Content" row.
  testWidgets('filter sheet: topics and state only', (tester) async {
    await pump(tester, news: false);
    await tester.tap(find.bySemanticsLabel('Filters'));
    await tester.pumpAndSettle();
    expect(find.text('Choose topics'), findsOneWidget);
    expect(find.text('Choose state'), findsOneWidget);
    expect(find.text('Content'), findsNothing);
  });

  // Owner 2026-10-06: several states at once; a picked state is no chip.
  testWidgets('state picker: several states, no state chip', (tester) async {
    await pump(tester, news: false, picked: {'IL'});
    expect(find.text('Illinois'), findsNothing);
    await tester.tap(find.bySemanticsLabel('Filters'));
    await tester.pumpAndSettle();
    expect(find.text('IL'), findsOneWidget);
    await tester.tap(find.text('Choose state'));
    await tester.pumpAndSettle();
    for (final name in ['New York', 'California']) {
      await tester.enterText(find.byType(TextField), name);
      await tester.pumpAndSettle();
      await tester.tap(find.text(name).last);
      await tester.pumpAndSettle();
    }
    await tester.tap(find.byType(AppButton).last);
    await tester.pumpAndSettle();
    expect(states, {'IL', 'NY', 'CA'});
  });

  // Owner 2026-10-06: «Юр. посты» first in «Выберите темы», one of «Все
  // юр. посты» / «Только мои темы».
  testWidgets('topics picker: the Legal posts choice', (tester) async {
    await pump(tester, news: false);
    final container = ProviderScope.containerOf(
      tester.element(find.byType(TopicFilterBar)),
    );
    expect(container.read(feedLegalScopeProvider), FeedLegalScope.all);
    await tester.tap(find.bySemanticsLabel('Filters'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Choose topics'));
    await tester.pumpAndSettle();
    final group = find.byKey(const ValueKey('picker-group-@legal'));
    expect(group, findsOneWidget);
    expect(find.text('All legal posts'), findsOneWidget);
    expect(find.text('Posts'), findsNothing);
    await tester.tap(group);
    await tester.pumpAndSettle();
    // A one-of choice: no "Select all".
    expect(find.byKey(const ValueKey('picker-all-@legal')), findsNothing);
    await tester.tap(find.byKey(const ValueKey('picker-option-@legal:mine')));
    await tester.pumpAndSettle();
    expect(find.text('Only my topics'), findsNWidgets(2));
    await tester.tap(find.byType(AppButton).last);
    await tester.pumpAndSettle();
    expect(container.read(feedLegalScopeProvider), FeedLegalScope.mine);
    expect(
      container.read(feedTopicsProvider).where((c) => c.startsWith('@legal')),
      isEmpty,
    );
  });
}
