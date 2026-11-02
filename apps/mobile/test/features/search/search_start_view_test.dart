import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/static_translator.dart';
import 'package:lawbid/features/search/application/search_providers.dart';
import 'package:lawbid/features/search/data/search_repository.dart';
import 'package:lawbid/features/search/presentation/screens/search_screen.dart';
import 'package:lawbid/features/social/application/social_providers.dart';
import 'package:lawbid/features/social/domain/social_models.dart';
import 'package:lawbid/features/social/presentation/widgets/attorney_tile.dart';
import 'package:lawbid/shared/domain/cursor_page.dart';

import '../../helpers/ux_harness.dart';
import '../social/social_fakes.dart';

const _recommended = AttorneyRow(
  id: 'rec1',
  username: 'recommended.one',
  verified: true,
  ratingAvg: 0,
  ratingCount: 0,
  states: [],
  practiceKeys: [],
  isFollowing: false,
);

const _found = AttorneyRow(
  id: 'found1',
  username: 'jahongir.found',
  verified: false,
  ratingAvg: 0,
  ratingCount: 0,
  states: [],
  practiceKeys: [],
  isFollowing: false,
);

class _Social extends FakeSocialRepository {
  @override
  Future<CursorPage<AttorneyRow>> suggestions({String? cursor}) async =>
      const CursorPage(items: [_recommended]);
}

class _Search extends FakeSearchRepository {
  @override
  Future<CursorPage<PersonRow>> people(
    String q,
    SearchFilters f, {
    String? cursor,
  }) async {
    attorneyQueries.add(q);
    return const CursorPage(items: [PersonRow.attorney(_found)]);
  }
}

/// «Recommended» lives in the synced bundle only (not compiled in).
class _Tr extends StaticTranslatorEn {
  const _Tr();

  @override
  String t(String key, [Map<String, String>? params]) =>
      key == 'search.recommended' ? 'Recommended' : super.t(key, params);
}

/// Owner 2026-10-28 (phone test): with an EMPTY field, Search → People
/// showed «По вашему поиску «jah»» with the old result instead of the start
/// view. An empty field is the start view (recommendations); the last
/// search is only a «Recent» chip, never a results list.
void main() {
  setUpAll(initializeDateFormatting);

  Future<void> pump(WidgetTester tester) async {
    await tester.pumpWidget(
      uxApp(
        const SearchScreen(),
        theme: AppTheme.light(),
        overrides: [
          ...uxOverrides(
            social: _Social(),
            search: _Search(),
            translator: const _Tr(),
          ),
          currentUserIdProvider.overrideWithValue('u1'),
        ],
      ),
    );
    await tester.pumpAndSettle();
  }

  testWidgets(
      'empty field: the start view; after a search and clearing it, '
      'the start view again with the query only as a Recent chip',
      (tester) async {
    await pump(tester);
    expect(find.byType(RecommendedAttorneys), findsOneWidget);
    expect(find.byKey(const ValueKey('rec-rec1')), findsOneWidget);
    expect(find.byKey(const ValueKey('search-recent-chips')), findsNothing);

    // Search "jah" (enter submits and remembers it): its result shows.
    await tester.enterText(find.byType(TextField), 'jah');
    await tester.testTextInput.receiveAction(TextInputAction.search);
    await tester.pump(const Duration(milliseconds: 400));
    await tester.pumpAndSettle();
    expect(find.textContaining('jahongir.found'), findsWidgets);

    // Clear the field (the history list opens under the focused field, as
    // in Instagram); leave it — another tab and back — and the empty field
    // is the start view again.
    await tester.enterText(find.byType(TextField), '');
    await tester.pump(const Duration(milliseconds: 400));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Posts'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('People'));
    await tester.pumpAndSettle();
    expect(
      tester.widget<TextField>(find.byType(TextField)).controller!.text,
      isEmpty,
    );

    expect(find.byType(RecommendedAttorneys), findsOneWidget);
    expect(find.byKey(const ValueKey('rec-rec1')), findsOneWidget);
    // No stale results and no «Based on your search» block.
    expect(find.textContaining('jahongir.found'), findsNothing);
    expect(find.textContaining('Based on your search'), findsNothing);
    // The last query is a small Recent chip; a tap searches it again.
    final chips = find.byKey(const ValueKey('search-recent-chips'));
    expect(chips, findsOneWidget);
    final chip = find.descendant(of: chips, matching: find.text('jah'));
    expect(chip, findsOneWidget);
    await tester.tap(chip);
    await tester.pump(const Duration(milliseconds: 400));
    await tester.pumpAndSettle();
    expect(find.textContaining('jahongir.found'), findsWidgets);

    await tester.pumpWidget(const SizedBox());
    await tester.pump(const Duration(seconds: 3));
  });

  testWidgets(
      'reopened with «jah» in the history: the start view and a '
      'Recent chip, no results of the old query', (tester) async {
    await pump(tester);
    final container = ProviderScope.containerOf(
      tester.element(find.byType(SearchScreen)),
    );
    await tester.runAsync(
      () => container
          .read(recentSearchesProvider(SearchTab.attorneys.name).notifier)
          .remember('jah'),
    );
    await tester.pumpAndSettle();
    expect(find.byType(RecommendedAttorneys), findsOneWidget);
    expect(find.byKey(const ValueKey('search-recent-chips')), findsOneWidget);
    expect(find.textContaining('jahongir.found'), findsNothing);
    expect(find.textContaining('Based on your search'), findsNothing);

    await tester.pumpWidget(const SizedBox());
    await tester.pump(const Duration(seconds: 3));
  });
}
