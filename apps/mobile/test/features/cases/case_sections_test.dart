import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/features/cases/domain/case_models.dart';
import 'package:lawbid/features/cases/presentation/screens/attorney_case_screen.dart';
import 'package:lawbid/features/cases/presentation/screens/owner_case_screen.dart';
import 'package:lawbid/features/cases/presentation/screens/work_case_screen.dart';
import 'package:lawbid/features/cases/presentation/widgets/case_cards.dart';
import 'package:lawbid/features/cases/presentation/widgets/case_parts.dart';
import 'package:lawbid/features/cases/presentation/widgets/case_sections.dart';
import 'package:lawbid/features/cases/presentation/widgets/detail_widgets.dart';
import 'package:lawbid/features/cases/tools/billing_tab.dart';
import 'package:lawbid/features/cases/tools/signing_tab.dart';
import 'package:lawbid/features/cases/workspace/tasks_tab.dart';
import 'package:lawbid/features/cases/workspace/workspace_data.dart';
import 'package:lawbid/features/cases/workspace/workspace_view.dart';
import 'package:lawbid/features/team/presentation/case_tasks_section.dart';
import 'package:lawbid/shared/domain/cursor_page.dart';
import 'package:lawbid_api/lawbid_api.dart' as api;

import '../../helpers/onboarding_harness.dart';
import '../../helpers/ux_harness.dart';
import '../profile/profile_fakes.dart';
import 'cases_fakes.dart';

const _practice = PracticeRef(
  id: 'leaf-1',
  code: 'traffic',
  i18nKey: 'practice.traffic',
  nameEn: 'Traffic',
);
const _title = 'Speeding ticket in Trenton';
const _text = 'Short line.';

CaseBid _bid({String id = 'bid-1', BidStatus status = BidStatus.active}) =>
    CaseBid(
      id: id,
      caseId: 'case-1',
      attorneyId: 'att-1',
      status: status,
      feeType: FeeType.fixed,
      amountCents: 60000,
      message: 'Happy to help.',
      startAvailability: StartAvailability.immediately,
      startDate: null,
      estimatedDurationDays: null,
      roundCount: 0,
      turn: PartyRole.client,
      createdAt: DateTime(2026, 9, 20),
    );

class _Repo extends FakeCasesRepository {
  _Repo({
    this.status = CaseStatus.open,
    this.accepted,
    this.conversation,
    this.ownBid,
    this.bids = const [],
  });

  final CaseStatus status;
  final CaseBid? accepted;
  final String? conversation;
  final String? ownBid;
  final List<CaseBid> bids;

  @override
  Future<CursorPage<CaseBid>> caseBids(
    String caseId,
    BidsSort sort, {
    String? cursor,
  }) async =>
      CursorPage(items: bids);

  @override
  Future<OwnerCase> ownerCase(String caseId) async => OwnerCase(
        id: caseId,
        title: _title,
        description: _text,
        practice: _practice,
        primaryStateCode: 'NJ',
        additionalStateCodes: const [],
        city: null,
        budget: const CaseBudget(mode: BudgetMode.clarifyLater),
        status: status,
        viewCount: 1,
        bidsCount: 0,
        createdAt: DateTime(2026, 9, 2),
        lastActivityAt: DateTime(2026, 9, 2),
        acceptedBid: accepted,
        conversationId: conversation,
      );

  @override
  Future<FeedCase> attorneyCase(String caseId) async => FeedCase(
        id: caseId,
        title: _title,
        description: _text,
        practice: _practice,
        primaryStateCode: 'NJ',
        additionalStateCodes: const [],
        city: null,
        status: status,
        budget: const CaseBudget(mode: BudgetMode.clarifyLater),
        viewCount: 1,
        bidsCount: 1,
        createdAt: DateTime(2026, 9, 20),
        isNew: false,
        hasOwnBid: ownBid != null,
        ownBidId: ownBid,
      );

  @override
  Future<CaseBid> bid(String bidId) async => _bid(id: bidId);

  @override
  Future<void> recordViews(List<String> caseIds) async {}
}

api.CaseUpdateDto _update(String id, String at, {String body = 'Filed it'}) =>
    api.CaseUpdateDto(
      id: id,
      authorRole: api.CaseUpdateDtoAuthorRole.attorney,
      authorName: 'Ann Lee',
      authorStates: const [],
      body: body,
      files: const [],
      at: at,
      kind: api.CaseUpdateDtoKind.update,
    );

api.CaseActivityDto _activity(
  String id,
  String at,
  api.CaseActivityDtoKind kind,
) =>
    api.CaseActivityDto(
      id: id,
      kind: kind,
      actorRole: api.CaseActivityDtoActorRole.attorney,
      actorName: 'Ann Lee',
      taskTitle: 'Sign the form',
      fileCount: 0,
      at: at,
    );

void main() {
  setUpAll(() async => initializeDateFormatting('en'));

  group('links', () {
    test('old tab names open the place that took them over', () {
      for (final (name, section) in [
        ('overview', CaseSection.overview),
        ('bids', CaseSection.bids),
        ('files', CaseSection.docs),
        ('docs', CaseSection.docs),
        ('photos', CaseSection.photos),
        ('tasks', CaseSection.tasks),
        ('time', CaseSection.time),
        ('updates', CaseSection.activity),
        ('activity', CaseSection.activity),
        ('history', CaseSection.activity),
        (null, CaseSection.overview),
        ('nonsense', CaseSection.overview),
      ]) {
        expect(caseSectionFromName(name), section);
      }
    });
  });

  group('history', () {
    test('an event in both lists comes once, newest first', () {
      final merged = mergeCaseHistory(
        [
          _update('u1', '2026-11-03T10:00:00.000Z'),
          _update('e-done', '2026-11-01T10:00:00.000Z'),
        ],
        [
          _activity(
            'u1',
            '2026-11-03T10:00:00.000Z',
            api.CaseActivityDtoKind.update,
          ),
          _activity(
            'e-done',
            '2026-11-01T10:00:00.000Z',
            api.CaseActivityDtoKind.taskDone,
          ),
          _activity(
            'e-new',
            '2026-11-02T10:00:00.000Z',
            api.CaseActivityDtoKind.taskCreated,
          ),
        ],
      );
      expect(merged, hasLength(3));
      expect((merged[0] as api.CaseUpdateDto).id, 'u1');
      expect((merged[1] as api.CaseActivityDto).id, 'e-new');
      expect((merged[2] as api.CaseUpdateDto).id, 'e-done');
    });

    testWidgets('shows updates and activity lines together', (tester) async {
      await tester.pumpWidget(
        uxApp(
          const Scaffold(
            body: SingleChildScrollView(
              child: CaseHistoryTab(caseId: 'k', isAttorney: true),
            ),
          ),
          theme: AppTheme.light(),
          overrides: uxOverrides(
            extra: [
              caseUpdatesProvider('k').overrideWith(
                (ref) async => [_update('u1', '2026-11-03T10:00:00.000Z')],
              ),
              caseActivityProvider('k').overrideWith(
                (ref) async => [
                  _activity(
                    'u1',
                    '2026-11-03T10:00:00.000Z',
                    api.CaseActivityDtoKind.update,
                  ),
                  _activity(
                    'e-new',
                    '2026-11-02T10:00:00.000Z',
                    api.CaseActivityDtoKind.taskCreated,
                  ),
                ],
              ),
            ],
          ),
        ),
      );
      await tester.pump();
      await tester.pump();
      expect(find.text('Filed it'), findsOneWidget);
      expect(find.byType(UpdateEntry), findsOneWidget);
      expect(find.textContaining('Sign the form'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });
  });

  group('screens', () {
    Future<void> pumpScreen(
      WidgetTester tester,
      Widget screen,
      _Repo repo,
    ) async {
      tester.view.physicalSize = const Size(320, 700);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.reset);
      final wrap = await onboardingWrapper(
        AppTheme.light(),
        user: clientMe(),
        extra: [
          ...casesOverrides(repo: repo),
          caseWorkspaceProvider('case-1').overrideWith(
            (ref) async => const api.CaseWorkspaceDto(
              role: api.CaseWorkspaceDtoRole.attorney,
              files: [],
              openTasks: 0,
              updatesCount: 0,
              publishedAt: '2026-09-20T00:00:00.000Z',
              bidsCount: 1,
              newUpdates: 0,
              canWrite: true,
            ),
          ),
        ],
      );
      await tester.pumpWidget(wrap(screen));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 100));
      await tester.pump(const Duration(milliseconds: 100));
    }

    Finder sections() => find.byKey(const ValueKey('case-sections'));
    Finder hero() => find.byType(CaseHero);

    void expectCentredBetween(WidgetTester tester) {
      final centre = tester.getCenter(sections());
      expect(centre.dx, moreOrLessEquals(160, epsilon: 1));
    }

    void expectSections(List<String> names) {
      for (final s in names) {
        expect(
          find.descendant(of: sections(), matching: find.text(s)),
          findsOneWidget,
        );
      }
      expect(
        find.descendant(of: sections(), matching: find.byType(GestureDetector)),
        findsNWidgets(names.length),
      );
    }

    Future<void> openSection(WidgetTester tester, String name) async {
      await tester.tap(
        find.descendant(of: sections(), matching: find.text(name)),
      );
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 400));
      await tester.pump(const Duration(milliseconds: 400));
    }

    Finder key(String k) => find.byKey(ValueKey(k));
    Finder subTab(String name) =>
        find.descendant(of: key('case-sub-tabs'), matching: find.text(name));

    Future<void> settle(WidgetTester tester) async {
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 400));
    }

    testWidgets('client, open case: Overview Bids, no tabs, its two buttons',
        (tester) async {
      await pumpScreen(
        tester,
        const OwnerCaseScreen(caseId: 'case-1'),
        _Repo(),
      );
      expectSections(['Overview', 'Bids']);
      expectCentredBetween(tester);
      expect(find.text('My case'), findsNothing);
      expect(find.byType(TopBarIcon), findsNothing);
      expect(key('case-sub-tabs'), findsNothing);
      expect(hero(), findsOneWidget);
      expect(find.byType(CaseHistoryTab, skipOffstage: false), findsNothing);
      // Tasks exist before a bid is accepted: at the end of the Overview.
      expect(
        find.byType(CaseTasksSection, skipOffstage: false),
        findsOneWidget,
      );
      expect(key('case-edit'), findsOneWidget);
      expect(key('case-delete'), findsOneWidget);

      await openSection(tester, 'Bids');
      expect(hero(), findsNothing);
      expect(key('case-delete'), findsNothing);
      expect(tester.takeException(), isNull);
    });

    testWidgets('client, bids: Terms and Accept on a bid awaiting the client',
        (tester) async {
      await pumpScreen(
        tester,
        const OwnerCaseScreen(
          caseId: 'case-1',
          initialSection: CaseSection.bids,
        ),
        _Repo(bids: [_bid()]),
      );
      expect(key('bid-card-view-bid-1'), findsOneWidget);
      expect(key('bid-card-accept-bid-1'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });

    testWidgets('client in work: three sections, each with its two tabs',
        (tester) async {
      await pumpScreen(
        tester,
        const OwnerCaseScreen(caseId: 'case-1'),
        _Repo(
          status: CaseStatus.inProgress,
          accepted: _bid(status: BidStatus.accepted),
          conversation: 'conv-1',
        ),
      );
      expectSections(['Overview', 'Files', 'Tasks']);
      expect(hero(), findsOneWidget);
      expect(find.byType(MoneyText), findsOneWidget);
      expect(find.text('Terms'), findsOneWidget);
      // The card has no chat of its own: only the bottom button.
      expect(find.text('Chat'), findsNothing);
      expect(find.text('Chat with lawyer'), findsOneWidget);
      expect(key('case-complete'), findsOneWidget);

      // Activity: no head, no card.
      await tester.tap(subTab('Activity'));
      await settle(tester);
      expect(hero(), findsNothing);
      expect(find.byType(MoneyText), findsNothing);
      expect(find.byType(CaseHistoryTab), findsOneWidget);

      await openSection(tester, 'Files');
      expect(subTab('Docs'), findsOneWidget);
      expect(subTab('Photos'), findsOneWidget);
      expect(key('case-complete'), findsNothing);
      expect(find.byType(SigningTab), findsOneWidget);
      await tester.tap(subTab('Photos'));
      await settle(tester);
      expect(find.byType(SigningTab), findsNothing);

      await openSection(tester, 'Tasks');
      expect(subTab('Tasks'), findsOneWidget);
      expect(subTab('Time'), findsOneWidget);
      expect(find.byType(TasksTab), findsOneWidget);
      expect(find.byType(BillingTab), findsNothing);
      await tester.tap(subTab('Time'));
      await settle(tester);
      expect(find.byType(BillingTab), findsOneWidget);
      expect(find.byType(TasksTab), findsNothing);
      expect(find.text('Chat with lawyer'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });

    testWidgets('a link opens its section and tab', (tester) async {
      await pumpScreen(
        tester,
        const OwnerCaseScreen(
          caseId: 'case-1',
          initialSection: CaseSection.time,
        ),
        _Repo(
          status: CaseStatus.inProgress,
          accepted: _bid(status: BidStatus.accepted),
        ),
      );
      expect(find.byType(BillingTab), findsOneWidget);
      expect(hero(), findsNothing);
    });

    testWidgets('the plus of Documents: a template only for the attorney',
        (tester) async {
      await pumpScreen(
        tester,
        const WorkCaseScreen(
          caseId: 'case-1',
          initialSection: CaseSection.docs,
        ),
        _Repo(status: CaseStatus.inProgress),
      );
      await tester.tap(key('case-plus'));
      await settle(tester);
      expect(find.text('Get signed'), findsOneWidget);
      expect(find.text('From template'), findsOneWidget);
    });

    testWidgets('the plus of Documents, client: no template', (tester) async {
      await pumpScreen(
        tester,
        const OwnerCaseScreen(
          caseId: 'case-1',
          initialSection: CaseSection.docs,
        ),
        _Repo(
          status: CaseStatus.inProgress,
          accepted: _bid(status: BidStatus.accepted),
        ),
      );
      await tester.tap(key('case-plus'));
      await settle(tester);
      expect(find.text('Get signed'), findsOneWidget);
      expect(find.text('From template'), findsNothing);
    });

    testWidgets('sub-tabs: equal parts, 44 pt to tap', (tester) async {
      await pumpScreen(
        tester,
        const WorkCaseScreen(caseId: 'case-1'),
        _Repo(status: CaseStatus.inProgress),
      );
      final a = tester.getRect(subTab('Case'));
      final b = tester.getRect(subTab('Activity'));
      final bar = tester.getRect(key('case-sub-tabs'));
      expect(bar.width, 320);
      expect(bar.height, greaterThanOrEqualTo(44));
      expect(a.center.dx, moreOrLessEquals(80, epsilon: 2));
      expect(b.center.dx, moreOrLessEquals(240, epsilon: 2));
    });

    testWidgets('hired attorney: three sections, actions, one chat',
        (tester) async {
      await pumpScreen(
        tester,
        const WorkCaseScreen(caseId: 'case-1'),
        _Repo(status: CaseStatus.inProgress),
      );
      expectSections(['Overview', 'Files', 'Tasks']);
      expectCentredBetween(tester);
      expect(hero(), findsOneWidget);
      expect(find.byType(TopBarIcon), findsNothing);
      expect(key('case-complete'), findsOneWidget);
      expect(key('case-issue'), findsOneWidget);
      expect(key('case-chat'), findsOneWidget);
      await openSection(tester, 'Files');
      expect(key('case-issue'), findsNothing);
      expect(key('case-chat'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });

    testWidgets('attorney, open case with a bid: Changes has bid and withdraw',
        (tester) async {
      await pumpScreen(
        tester,
        const AttorneyCaseScreen(caseId: 'case-1'),
        _Repo(ownBid: 'bid-1'),
      );
      expectSections(['Overview', 'Changes']);
      expect(key('case-message-client'), findsOneWidget);
      expect(key('case-bid-cta'), findsNothing);
      expect(key('case-attached-line'), findsOneWidget);
      await openSection(tester, 'Changes');
      expect(key('case-withdraw'), findsOneWidget);
      expect(key('case-message-client'), findsNothing);
      expect(tester.takeException(), isNull);
    });

    testWidgets('attorney, open case: the description starts at the edge',
        (tester) async {
      await pumpScreen(
        tester,
        const AttorneyCaseScreen(caseId: 'case-1'),
        _Repo(),
      );
      expect(key('case-bid-cta'), findsOneWidget);
      expect(
        tester.getTopLeft(find.text(_text)).dx,
        moreOrLessEquals(AppSpacing.lg, epsilon: 0.5),
      );
    });

    testWidgets('a short description in a centring column stays at the edge',
        (tester) async {
      for (final dir in TextDirection.values) {
        await tester.pumpWidget(
          uxApp(
            Directionality(
              textDirection: dir,
              child: const Scaffold(
                body: Column(
                  children: [CaseText(text: _text, moreLabel: 'more')],
                ),
              ),
            ),
            theme: AppTheme.light(),
            size: const Size(800, 600),
          ),
        );
        await tester.pump();
        final box = tester.getRect(find.text(_text));
        if (dir == TextDirection.ltr) {
          expect(box.left, moreOrLessEquals(AppSpacing.lg, epsilon: 0.5));
        } else {
          expect(
            box.right,
            moreOrLessEquals(800 - AppSpacing.lg, epsilon: 0.5),
          );
        }
      }
    });
  });
}
