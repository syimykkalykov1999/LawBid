import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/l10n/static_translator.dart';
import 'package:lawbid/features/search/data/search_repository.dart';
import 'package:lawbid/features/search/presentation/widgets/search_filters_sheet.dart';

import '../../helpers/overflow_harness.dart';

/// Owner 2026-10-28 (R-084): the People filter sheet has «по подписке» —
/// three chips (all / following / not following) that come back in the
/// applied filters.
void main() {
  testWidgets('people sheet: pick «not following» and apply', (tester) async {
    SearchFilters? result;
    await pumpOverflowApp(
      tester,
      Builder(
        builder: (context) => Scaffold(
          body: Center(
            child: TextButton(
              key: const Key('open'),
              onPressed: () async => result = await showSearchFilters(
                context,
                initial: const SearchFilters(),
                kind: SearchFilterKind.people,
              ),
              child: const Text('open'),
            ),
          ),
        ),
      ),
      t: const StaticTranslatorEn(),
      dir: TextDirection.ltr,
      scale: 1,
      act: (tester) async {
        await tester.tap(find.byKey(const Key('open')));
        await tester.pumpAndSettle();
        expect(find.text('Following'), findsWidgets);
        expect(find.text('Not following'), findsOneWidget);
        await tester.ensureVisible(find.text('Not following'));
        await tester.pump();
        await tester.tap(find.text('Not following'));
        await tester.pump();
        await tester.ensureVisible(find.text('Show results'));
        await tester.pump();
        await tester.tap(find.text('Show results'));
        await tester.pump(const Duration(milliseconds: 600));
      },
    );
    expect(result?.follow, FollowFilter.notFollowing);
  });
}
