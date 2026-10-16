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
    return repo;
  }

  testWidgets('"Cases" are cards: Active and Completed chips, no row swipes',
      (tester) async {
    await pumpCases(tester, [
      _case('a', CaseStatus.open, bids: 3),
      _case('b', CaseStatus.inProgress),
    ]);
    // Owner 2026-10-15: one list of cards, the chips Active · Completed.
    expect(find.text('Active'), findsOneWidget);
    expect(find.text('Completed'), findsOneWidget);
    expect(find.byKey(const ValueKey('active-case-a')), findsOneWidget);
    expect(find.byKey(const ValueKey('active-case-b')), findsOneWidget);
    expect(find.text('Case a'), findsOneWidget);
    // The rows (and their swipe actions) are gone.
    expect(find.byKey(const ValueKey('my-case-a')), findsNothing);
    await tester.tap(find.text('Completed'));
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
  });

  testWidgets('chips and search share one row: magnifier opens, ✕ closes',
      (tester) async {
    await pumpCases(tester, [_case('a', CaseStatus.open)]);
    final open = find.byKey(const ValueKey('mine-search-open'));
    final close = find.byKey(const ValueKey('mine-search-close'));
    // Owner 2026-10-16: closed — the two chips and the magnifier, one row.
    expect(find.text('Active'), findsOneWidget);
    expect(find.text('Completed'), findsOneWidget);
    expect(open, findsOneWidget);
    expect(close, findsNothing);
    expect(
      (tester.getCenter(open).dy - tester.getCenter(find.text('Active')).dy)
          .abs(),
      lessThan(4),
    );
    await tester.tap(open);
    await tester.pumpAndSettle();
    // Open — the field replaces the chips, ✕ at its end.
    expect(find.byKey(const ValueKey('mine-search')), findsOneWidget);
    expect(find.byKey(const ValueKey('mine-filters')), findsOneWidget);
    expect(close, findsOneWidget);
    expect(find.text('Completed'), findsNothing);
    await tester.tap(close);
    await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('mine-search')), findsNothing);
    expect(find.text('Completed'), findsOneWidget);
    expect(open, findsOneWidget);
    // The Cases · Tasks tabs stay full width above.
    expect(find.text('Cases'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}
