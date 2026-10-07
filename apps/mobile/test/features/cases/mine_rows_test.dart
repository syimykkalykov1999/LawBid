import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/features/cases/domain/case_models.dart';
import 'package:lawbid/features/cases/presentation/screens/mine_views.dart';
import 'package:lawbid/features/promotions/application/promotions_providers.dart';
import 'package:lawbid/features/promotions/domain/promotion_models.dart';
import 'package:lawbid/shared/domain/cursor_page.dart';

import '../../helpers/onboarding_harness.dart';
import '../profile/profile_fakes.dart';
import 'cases_fakes.dart';

CaseSummary _case(String id, CaseStatus status, {int bids = 0}) => CaseSummary(
      id: id,
      title: 'Case $id',
      practice: const PracticeRef(
        id: 'p-traffic',
        code: 'traffic_tickets',
        i18nKey: 'practice.traffic',
        nameEn: 'Traffic',
      ),
      primaryStateCode: 'NJ',
      additionalStateCount: 0,
      city: null,
      status: status,
      budget: const CaseBudget(mode: BudgetMode.clarifyLater),
      bidsCount: bids,
      createdAt: DateTime(2026, 10, 4),
      lastActivityAt: DateTime(2026, 10, 4),
    );

class _Repo extends FakeCasesRepository {
  _Repo(List<CaseSummary> items) : super(myCasesItems: items);

  final deleted = <String>[];
  final closed = <String>[];

  @override
  Future<CursorPage<CaseSummary>> myCases(
    MyCasesFilter filter, {
    String? cursor,
    MineSearch search = const MineSearch(),
  }) async {
    final page = await super.myCases(filter, cursor: cursor, search: search);
    return CursorPage(
      items: [
        for (final c in page.items)
          if (!deleted.contains(c.id) && !closed.contains(c.id)) c,
      ],
    );
  }

  @override
  Future<void> deleteCase(String caseId) async => deleted.add(caseId);

  @override
  Future<void> closeCase(String caseId) async => closed.add(caseId);
}

const _quote = PromotionQuote(
  days: 3,
  priceCentsPerDay: 500,
  grossCents: 1500,
  totalCents: 1500,
  creditDaysAvailable: 0,
  creditDaysUsed: 0,
  maxDays: 30,
  enabled: true,
);

void main() {
  setUpAll(initializeDateFormatting);

  Future<_Repo> pumpCases(
    WidgetTester tester,
    List<CaseSummary> items,
  ) async {
    final repo = _Repo(items);
    final wrap = await onboardingWrapper(
      AppTheme.light(),
      user: clientMe(),
      extra: [
        ...casesOverrides(repo: repo),
        casePromotionProvider.overrideWith(
          (ref, id) async =>
              const CasePromotionState(canPromote: true, quote: _quote),
        ),
      ],
    );
    await tester.pumpWidget(wrap(const Scaffold(body: ClientMineView())));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Cases'));
    await tester.pumpAndSettle();
    return repo;
  }

  testWidgets('"My cases" are compact rows with Boost on open ones',
      (tester) async {
    await pumpCases(tester, [
      _case('a', CaseStatus.open, bids: 3),
      _case('b', CaseStatus.inProgress),
    ]);
    expect(find.byKey(const ValueKey('my-case-a')), findsOneWidget);
    expect(find.byKey(const ValueKey('my-case-b')), findsOneWidget);
    expect(find.text('Case a'), findsOneWidget);
    // Boost on the open case's card only.
    expect(
      find.descendant(
        of: find.byKey(const ValueKey('my-case-a')),
        matching: find.text('Boost'),
      ),
      findsOneWidget,
    );
    expect(
      find.descendant(
        of: find.byKey(const ValueKey('my-case-b')),
        matching: find.text('Boost'),
      ),
      findsNothing,
    );
    // An in-progress case has nothing to swipe to.
    expect(find.byKey(const ValueKey('my-case-swipe-b')), findsNothing);
  });

  testWidgets('swipe left offers close and delete; delete asks first',
      (tester) async {
    final repo = await pumpCases(tester, [_case('a', CaseStatus.open)]);
    await tester.drag(
      find.byKey(const ValueKey('my-case-a')),
      const Offset(-200, 0),
    );
    await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('my-case-close-a')), findsOneWidget);
    await tester.tap(find.byKey(const ValueKey('my-case-delete-a')));
    await tester.pumpAndSettle();
    // The confirm sheet: nothing is deleted until confirmed.
    expect(find.text('Delete the case?'), findsOneWidget);
    expect(repo.deleted, isEmpty);
    await tester.tap(find.text('Delete').last);
    await tester.pumpAndSettle();
    expect(repo.deleted, ['a']);
    expect(find.byKey(const ValueKey('my-case-a')), findsNothing);
  });

  testWidgets('a swipe right on a closed row is left to the tabs',
      (tester) async {
    await pumpCases(tester, [_case('a', CaseStatus.open)]);
    await tester.drag(
      find.byKey(const ValueKey('my-case-a')),
      const Offset(200, 0),
    );
    await tester.pumpAndSettle();
    // TabSwipe went back to the planner.
    expect(find.byKey(const ValueKey('my-case-a')), findsNothing);
  });
}
