import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/features/feed/application/feed_content.dart';
import 'package:lawbid/features/feed/application/feed_topics.dart';
import 'package:lawbid/features/feed/application/news_flag.dart';
import 'package:lawbid/features/feed/presentation/widgets/topic_filter_bar.dart';

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
  Future<void> pump(WidgetTester tester, {required bool news}) =>
      tester.pumpWidget(
        uxApp(
          Scaffold(
            body: TopicFilterBar(
              category: null,
              onCategory: (_) {},
              stateCode: null,
              onState: (_) {},
            ),
          ),
          theme: AppTheme.light(),
          disableAnimations: true,
          overrides: uxOverrides(
            extra: [
              newsEnabledProvider.overrideWithValue(news),
              feedTopicsProvider.overrideWith(_Topics.new),
              feedContentModeProvider.overrideWith(_Mode.new),
            ],
          ),
        ),
      );

  testWidgets('News off: no News pill, "Legal posts" toggles', (tester) async {
    await pump(tester, news: false);
    expect(find.text('News'), findsNothing);
    expect(find.text('All content'), findsNothing);
    expect(find.text('Legal posts'), findsOneWidget);

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
}
