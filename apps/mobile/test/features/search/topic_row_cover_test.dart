import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/features/cases/presentation/widgets/practice_art.dart';
import 'package:lawbid/features/search/presentation/widgets/search_tiles.dart';

import '../../helpers/ux_harness.dart';

/// Owner 2026-11-04 (R-406): in Search → Topics our topics keep their
/// practice pictures; a topic people made with a hashtag wears the photo of
/// its most popular post, and its letter when it has no media posts.
void main() {
  setUpAll(initializeDateFormatting);

  Future<void> pump(WidgetTester tester, TopicRow row) async {
    await tester.pumpWidget(
      uxApp(
        Scaffold(body: row),
        theme: AppTheme.light(),
        overrides: uxOverrides(),
      ),
    );
    await tester.pump();
  }

  Future<void> close(WidgetTester tester) async {
    await tester.pumpWidget(const SizedBox());
    await tester.pump(const Duration(seconds: 30));
  }

  testWidgets('a hashtag topic with a cover shows the popular post picture',
      (tester) async {
    await pump(
      tester,
      const TopicRow(
        tag: 'alimony',
        title: '#alimony',
        subtitle: '#alimony · 3 posts',
        coverUrl: 'https://cdn.test/covers/alimony_320.jpg',
      ),
    );
    expect(find.byKey(const ValueKey('topic-cover')), findsOneWidget);
    expect(find.byType(PracticePhoto), findsNothing);
    expect(find.text('A'), findsNothing);
    await close(tester);
  });

  testWidgets('a hashtag topic with no media posts falls back to its letter',
      (tester) async {
    await pump(
      tester,
      const TopicRow(
        tag: 'alimony',
        title: '#alimony',
        subtitle: '#alimony · 3 posts',
      ),
    );
    expect(find.byKey(const ValueKey('topic-cover')), findsNothing);
    expect(find.byType(PracticePhoto), findsNothing);
    expect(find.text('A'), findsOneWidget);
    await close(tester);
  });

  testWidgets('our practice topic keeps its own picture, cover or not',
      (tester) async {
    await pump(
      tester,
      const TopicRow(
        tag: 'immigration',
        title: 'Immigration',
        subtitle: '#immigration',
        categoryCode: 'immigration',
        coverUrl: 'https://cdn.test/covers/x.jpg',
      ),
    );
    expect(find.byType(PracticePhoto), findsOneWidget);
    expect(find.byKey(const ValueKey('topic-cover')), findsNothing);
    await close(tester);
  });
}
