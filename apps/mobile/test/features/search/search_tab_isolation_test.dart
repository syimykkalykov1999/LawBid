import 'package:drift/native.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/features/search/presentation/screens/search_screen.dart';
import 'package:lawbid/features/social/application/social_providers.dart';
import 'package:lawbid/features/social/data/social_local_database.dart';

import '../../helpers/ux_harness.dart';

void main() {
  setUpAll(initializeDateFormatting);

  group('recent searches are stored per tab', () {
    late SocialLocalDatabase db;
    setUp(() => db = SocialLocalDatabase(NativeDatabase.memory()));
    tearDown(() => db.close());

    test('a search in one tab never shows in another', () async {
      await db.remember('u1', 'attorneys', 'saul goodman');
      await db.remember('u1', 'posts', 'divorce');
      await db.remember('u2', 'attorneys', 'other account');
      expect(await db.recent('u1', 'attorneys'), ['saul goodman']);
      expect(await db.recent('u1', 'posts'), ['divorce']);
      expect(await db.recent('u1', 'tags'), isEmpty);
      expect(await db.recent('u2', 'attorneys'), ['other account']);
    });

    test('forget and clear touch only their tab', () async {
      await db.remember('u1', 'attorneys', 'same');
      await db.remember('u1', 'posts', 'same');
      await db.forgetRecent('u1', 'posts', 'same');
      expect(await db.recent('u1', 'attorneys'), ['same']);
      expect(await db.recent('u1', 'posts'), isEmpty);
      await db.remember('u1', 'posts', 'again');
      await db.clearRecent('u1', 'attorneys');
      expect(await db.recent('u1', 'attorneys'), isEmpty);
      expect(await db.recent('u1', 'posts'), ['again']);
    });

    test('each tab keeps its own ten most recent', () async {
      for (var i = 0; i < 12; i++) {
        await db.remember('u1', 'posts', 'q$i');
      }
      await db.remember('u1', 'tags', 'keep');
      expect((await db.recent('u1', 'posts')).length, 10);
      expect(await db.recent('u1', 'tags'), ['keep']);
    });

    test('the old shared history is dropped, tab history is not', () async {
      await db.remember('u1', 'posts', 'new');
      await db.remember('u1', 'attorneys', 'x');
      // A row of the pre-tabs era: owner key without a tab.
      await db.into(db.recentSearches).insert(
            RecentSearchesCompanion.insert(
              ownerId: 'u1',
              query: 'legacy',
              usedAt: DateTime(2026),
            ),
          );
      await db.dropLegacyRecent('u1');
      final left = await db.select(db.recentSearches).get();
      expect(left.map((r) => r.query).toSet(), {'new', 'x'});
    });
  });

  group('Search screen', () {
    Future<void> pump(WidgetTester tester) async {
      await tester.pumpWidget(
        uxApp(
          const SearchScreen(),
          theme: AppTheme.light(),
          overrides: [
            ...uxOverrides(),
            currentUserIdProvider.overrideWithValue('u1'),
          ],
        ),
      );
      await tester.pumpAndSettle();
    }

    String fieldText(WidgetTester tester) =>
        tester.widget<TextField>(find.byType(TextField)).controller!.text;

    testWidgets('every tab restores its own text and shows its own history',
        (tester) async {
      await pump(tester);
      // People: search "saul" (enter submits and remembers it).
      await tester.enterText(find.byType(TextField), 'saul');
      await tester.testTextInput.receiveAction(TextInputAction.search);
      await tester.pump(const Duration(milliseconds: 400));
      await tester.pumpAndSettle();
      expect(fieldText(tester), 'saul');

      // Posts: the box is empty and the people history is not shown.
      await tester.tap(find.text('Posts'));
      await tester.pumpAndSettle();
      expect(fieldText(tester), isEmpty);
      await tester.tap(find.byType(TextField));
      await tester.pumpAndSettle();
      expect(find.text('saul'), findsNothing);

      // A posts search with its own text.
      await tester.enterText(find.byType(TextField), 'divorce');
      await tester.testTextInput.receiveAction(TextInputAction.search);
      await tester.pump(const Duration(milliseconds: 400));
      await tester.pumpAndSettle();

      // Topics: empty again, neither history shows.
      await tester.tap(find.text('Topics'));
      await tester.pumpAndSettle();
      expect(fieldText(tester), isEmpty);
      await tester.tap(find.byType(TextField));
      await tester.pumpAndSettle();
      expect(find.text('saul'), findsNothing);
      expect(find.text('divorce'), findsNothing);

      // Back to People: its own text again, and its history only.
      await tester.tap(find.text('People'));
      await tester.pumpAndSettle();
      expect(fieldText(tester), 'saul');
      await tester.tap(find.text('Posts'));
      await tester.pumpAndSettle();
      expect(fieldText(tester), 'divorce');
      await tester.pumpWidget(const SizedBox());
      await tester.pump(const Duration(seconds: 3));
    });

    testWidgets('owner 2026-10-23: the QR scanner shows on People only',
        (tester) async {
      await pump(tester);
      final qr = find.byKey(const ValueKey('search-scan-qr'));
      expect(qr, findsOneWidget);
      for (final tab in ['Posts', 'Topics']) {
        await tester.tap(find.text(tab));
        await tester.pumpAndSettle();
        expect(qr, findsNothing, reason: tab);
      }
      await tester.tap(find.text('People'));
      await tester.pumpAndSettle();
      expect(qr, findsOneWidget);
      await tester.pumpWidget(const SizedBox());
      await tester.pump(const Duration(seconds: 3));
    });
  });
}
