import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/navigation/shell/desktop_layouts.dart';
import 'package:lawbid/core/navigation/shell/shell_layout.dart';
import 'package:lawbid/features/cases/domain/case_models.dart';
import 'package:lawbid/features/cases/presentation/desktop_cases.dart';
import 'package:lawbid/features/cases/presentation/screens/owner_case_screen.dart';
import 'package:lawbid/features/feed/presentation/widgets/desktop_feed_pane.dart';
import 'package:lawbid/features/mine/presentation/screens/mine_screen.dart';
import 'package:lawbid/features/social/presentation/widgets/post_grid_tile.dart';
import 'package:lawbid/features/team/application/team_providers.dart';

import '../../helpers/onboarding_harness.dart';
import '../profile/profile_fakes.dart';
import '../team/team_fakes.dart';
import 'cases_fakes.dart';

CaseSummary _case(String id) => CaseSummary(
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
      status: CaseStatus.open,
      budget: const CaseBudget(mode: BudgetMode.clarifyLater),
      bidsCount: 1,
      createdAt: DateTime(2026, 10, 4),
      lastActivityAt: DateTime(2026, 10, 4),
    );

class _Repo extends FakeCasesRepository {
  _Repo() : super(myCasesItems: [_case('a'), _case('b')]);

  @override
  Future<OwnerCase> ownerCase(String caseId) async => OwnerCase(
        id: caseId,
        title: 'Detail of $caseId',
        description: 'Got a ticket on the turnpike last week.',
        practice: const PracticeRef(
          id: 'leaf-1',
          code: 'traffic',
          i18nKey: 'practice.traffic',
          nameEn: 'Traffic',
        ),
        primaryStateCode: 'NJ',
        additionalStateCodes: const [],
        city: null,
        budget: const CaseBudget(mode: BudgetMode.clarifyLater),
        status: CaseStatus.open,
        viewCount: 1,
        bidsCount: 0,
        createdAt: DateTime(2026, 9, 2),
        lastActivityAt: DateTime(2026, 9, 2),
      );
}

/// Desktop web plan 2026-10-28 §6.1 / §6.2 / §6.4 (PR 3): cases as
/// list | case, the feed's side pane, the Search grid.
void main() {
  setUpAll(initializeDateFormatting);
  tearDown(() => adaptiveShellOverride = null);

  Future<void> pump(WidgetTester t, Widget child, Size size) async {
    t.view.physicalSize = size;
    t.view.devicePixelRatio = 1;
    addTearDown(t.view.reset);
    adaptiveShellOverride = true;
    final wrap = await onboardingWrapper(
      AppTheme.light(),
      user: clientMe(),
      extra: [
        ...casesOverrides(repo: _Repo()),
        mergedTasksProvider.overrideWith(
          (ref, key) => AsyncData([
            makeTask('t1', dueAt: DateTime.now().add(const Duration(days: 2))),
          ]),
        ),
      ],
    );
    await t.pumpWidget(wrap(child));
    await t.pumpAndSettle();
  }

  testWidgets('desktop 1440: Mine is the cases list and an empty pane',
      (t) async {
    await pump(t, const Scaffold(body: MineScreen()), const Size(1440, 900));
    expect(find.byType(DesktopCasesPage), findsOneWidget);
    expect(find.byKey(const ValueKey('desktop-case-empty')), findsOneWidget);
    expect(find.text('Case a'), findsOneWidget);
    expect(t.getSize(find.byType(MineScreen).last).width, kCaseListPaneWidth);
    expect(t.takeException(), isNull);
  });

  testWidgets('a tap on a case opens it in the right pane, back empties it',
      (t) async {
    await pump(t, const Scaffold(body: MineScreen()), const Size(1280, 800));
    await t.tap(find.text('Case a'));
    await t.pumpAndSettle();
    expect(find.byType(OwnerCaseScreen), findsOneWidget);
    expect(find.text('Detail of a'), findsWidgets);
    expect(find.byKey(const ValueKey('desktop-case-empty')), findsNothing);
    // The case is at most 760 wide, in the pane after the 400 list.
    expect(
      t.getSize(find.byType(OwnerCaseScreen)).width,
      kCaseDetailMaxWidth,
    );
    // Another case replaces it in place.
    await t.tap(find.text('Case b'));
    await t.pumpAndSettle();
    expect(find.text('Detail of b'), findsWidgets);
    expect(find.text('Detail of a'), findsNothing);
    // Back closes the pane, not the page.
    await t.tap(find.byType(AppBackButton));
    await t.pumpAndSettle();
    expect(find.byKey(const ValueKey('desktop-case-empty')), findsOneWidget);
    expect(find.byType(OwnerCaseScreen), findsNothing);
    expect(t.takeException(), isNull);
  });

  testWidgets('phone 390 with the web flag on: Mine is the plain list',
      (t) async {
    await pump(t, const Scaffold(body: MineScreen()), const Size(390, 844));
    expect(find.byType(DesktopCasesPage), findsNothing);
    expect(find.byType(ListDetailLayout), findsNothing);
    expect(find.text('Case a'), findsOneWidget);
    expect(t.takeException(), isNull);
  });

  testWidgets('feed: the side pane from 1280 with deadlines and cases',
      (t) async {
    await pump(
      t,
      const Scaffold(body: FeedAdaptivePage(feed: SizedBox.expand())),
      const Size(1440, 900),
    );
    expect(find.byKey(const ValueKey('desktop-feed-pane')), findsOneWidget);
    expect(
      t.getSize(find.byKey(const ValueKey('desktop-feed-pane'))).width,
      320,
    );
    expect(find.text('Task t1'), findsOneWidget);
    expect(find.text('Case a'), findsOneWidget);
    expect(t.takeException(), isNull);
  });

  testWidgets('feed: 1100 has no pane, and a phone gets the feed alone',
      (t) async {
    const page = Scaffold(
      body: FeedAdaptivePage(feed: SizedBox.expand(key: Key('feed'))),
    );
    await pump(t, page, const Size(1100, 800));
    expect(find.byKey(const ValueKey('desktop-feed-pane')), findsNothing);
    expect(
      t.getSize(find.byKey(const Key('feed'))).width,
      kShellContentMaxWidth,
    );
    await pump(t, page, const Size(390, 844));
    expect(find.byKey(const ValueKey('desktop-feed-pane')), findsNothing);
    expect(t.getSize(find.byKey(const Key('feed'))).width, 390);
  });

  testWidgets('search grid: 3 columns on a phone, 280-wide tiles on desktop',
      (t) async {
    late SliverGridDelegate delegate;
    Widget probe() => Builder(
          builder: (context) {
            delegate = searchPostGridDelegate(context);
            return const SizedBox.shrink();
          },
        );
    await pump(t, probe(), const Size(390, 844));
    expect(delegate, kSearchPostGridDelegate);
    await pump(t, probe(), const Size(1440, 900));
    expect(delegate, isA<SliverGridDelegateWithMaxCrossAxisExtent>());
    expect(
      (delegate as SliverGridDelegateWithMaxCrossAxisExtent).maxCrossAxisExtent,
      280,
    );
  });

  test('case pages are list | case locations', () {
    expect(isCaseDetailLocation('/mine/case/abc'), isTrue);
    expect(isCaseDetailLocation('/mine/work/abc'), isTrue);
    expect(isCaseDetailLocation('/mine/case/abc/edit'), isFalse);
    expect(isCaseDetailLocation('/mine'), isFalse);
  });
}
