import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/features/social/application/social_providers.dart';
import 'package:lawbid/features/social/domain/social_models.dart';
import 'package:lawbid/features/social/presentation/screens/social_screens.dart';
import 'package:lawbid/shared/domain/cursor_page.dart';

import '../../helpers/ux_harness.dart';
import 'social_fakes.dart';

PersonRow _person(String id, String first) => PersonRow.client(
      ClientRow(
        id: id,
        username: first.toLowerCase(),
        firstName: first,
        lastName: 'Test',
        stateCode: 'NY',
      ),
    );

class _Social extends FakeSocialRepository {
  final queries = <String?>[];

  @override
  Future<CursorPage<PersonRow>> followers(
    String attorneyId, {
    String? cursor,
    String? q,
  }) async {
    queries.add(q);
    if (q == null || q.isEmpty) {
      return CursorPage(items: [_person('1', 'Emily'), _person('2', 'Maria')]);
    }
    if (q == 'emi') return CursorPage(items: [_person('1', 'Emily')]);
    return const CursorPage(items: []);
  }
}

void main() {
  setUpAll(initializeDateFormatting);

  testWidgets('followers: typing sends q, the empty state shows, clear resets',
      (tester) async {
    final repo = _Social();
    tester.view.physicalSize = const Size(1000, 2000);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    await tester.pumpWidget(
      uxApp(
        const FollowListScreen(
          kind: FollowListKind.followers,
          attorneyId: 'att-1',
        ),
        size: const Size(1000, 2000),
        theme: AppTheme.light(),
        disableAnimations: true,
        overrides: uxOverrides(social: repo),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('Search by name or @username'), findsOneWidget);
    expect(find.textContaining('Emily'), findsOneWidget);
    expect(find.textContaining('Maria'), findsOneWidget);

    await tester.enterText(find.byKey(const ValueKey('follow-search')), 'emi');
    await tester.pump(const Duration(milliseconds: 400));
    await tester.pumpAndSettle();
    expect(repo.queries.last, 'emi');
    expect(find.textContaining('Emily'), findsOneWidget);
    expect(find.textContaining('Maria'), findsNothing);

    await tester.enterText(find.byKey(const ValueKey('follow-search')), 'zzz');
    await tester.pump(const Duration(milliseconds: 400));
    await tester.pumpAndSettle();
    expect(find.text('No one found'), findsOneWidget);

    await tester.enterText(find.byKey(const ValueKey('follow-search')), '');
    await tester.pumpAndSettle();
    expect(find.text('No one found'), findsNothing);
    expect(find.textContaining('Maria'), findsOneWidget);
  });
}
