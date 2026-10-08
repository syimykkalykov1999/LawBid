import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid/features/cases/application/cases_providers.dart';
import 'package:lawbid/features/cases/application/create_case_controller.dart';
import 'package:lawbid/features/cases/domain/case_draft.dart';
import 'package:lawbid/features/cases/domain/case_models.dart';
import 'package:lawbid/features/cases/presentation/screens/attorney_case_screen.dart';
import 'package:lawbid/features/cases/presentation/screens/bid_detail_screen.dart';
import 'package:lawbid/features/cases/presentation/screens/mine_views.dart';
import 'package:lawbid/features/cases/presentation/screens/owner_case_screen.dart';
import 'package:lawbid/shared/domain/cursor_page.dart';

import '../../helpers/onboarding_harness.dart';
import '../profile/profile_fakes.dart';
import 'cases_fakes.dart';

CaseBid bidFixture({
  PartyRole turn = PartyRole.client,
  int rounds = 0,
  FeeType fee = FeeType.fixed,
  String id = 'bid-1',
  BidStatus status = BidStatus.active,
}) =>
    CaseBid(
      id: id,
      caseId: 'case-1',
      attorneyId: 'att-1',
      status: status,
      feeType: fee,
      amountCents: 60000,
      message: 'I handle NJ speeding tickets every week, happy to help.',
      startAvailability: StartAvailability.immediately,
      startDate: null,
      estimatedDurationDays: null,
      roundCount: rounds,
      turn: turn,
      createdAt: DateTime(2026, 9, 20),
      offers: [
        BidOffer(
          id: 'o0',
          roundNo: 0,
          fromRole: PartyRole.attorney,
          feeType: fee,
          amountCents: 60000,
          message: null,
          status: OfferStatus.pending,
          createdAt: DateTime(2026, 9, 20),
        ),
      ],
    );

class _BidRepo extends FakeCasesRepository {
  _BidRepo(this.value);
  final CaseBid value;
  @override
  Future<CaseBid> bid(String bidId) async => value;
}

class _PublishRepo extends FakeCasesRepository {
  _PublishRepo({this.error});
  final ApiException? error;
  bool? consent;
  @override
  Future<String> createCase(
    CaseDraft draft, {
    required bool contactSharingConsent,
    List<String> photoFileIds = const [],
  }) async {
    consent = contactSharingConsent;
    if (error != null) throw error!;
    return 'new-case';
  }
}

MyBid _myBid(String id, BidStatus status) {
  final bid = bidFixture(id: id, status: status);
  return MyBid(
    bid: bid,
    caseId: 'case-$id',
    caseTitle: 'Case $id',
    caseStatus: CaseStatus.closed,
    casePracticeI18nKey: 'practice.traffic',
    casePracticeNameEn: 'Traffic',
    primaryStateCode: 'NJ',
    lastOffer: bid.offers.first,
  );
}

class _WonCaseRepo extends FakeCasesRepository {
  @override
  Future<FeedCase> attorneyCase(String caseId) async => FeedCase(
        id: caseId,
        title: 'Speeding ticket in Trenton',
        practice: const PracticeRef(
          id: 'leaf-1',
          code: 'traffic',
          i18nKey: 'practice.traffic',
          nameEn: 'Traffic',
        ),
        primaryStateCode: 'NJ',
        additionalStateCodes: const [],
        city: null,
        status: CaseStatus.inProgress,
        budget: const CaseBudget(mode: BudgetMode.clarifyLater),
        viewCount: 1,
        bidsCount: 1,
        createdAt: DateTime(2026, 9, 20),
        isNew: false,
        hasOwnBid: true,
        ownBidId: 'bid-1',
        acceptedBidIsMine: true,
      );

  @override
  Future<CaseBid> bid(String bidId) async =>
      bidFixture(status: BidStatus.accepted);

  @override
  Future<void> recordView(String caseId) async {}
}

class _StaleCaseRepo extends FakeCasesRepository {
  final kept = <String>[];

  @override
  Future<OwnerCase> ownerCase(String caseId) async => OwnerCase(
        id: caseId,
        title: 'Speeding ticket in Trenton',
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
        stalePromptSentAt: kept.isEmpty ? DateTime(2026, 9, 25) : null,
      );

  @override
  Future<void> keepAlive(String caseId) async => kept.add(caseId);
}

class _FinishedBidsRepo extends FakeCasesRepository {
  @override
  Future<CursorPage<MyBid>> myBids(
    MyBidsFilter filter, {
    String? cursor,
    MineSearch search = const MineSearch(),
  }) async =>
      cursor == null
          // A first page of only accepted bids reads on to the next one.
          ? CursorPage(
              items: [_myBid('a1', BidStatus.accepted)],
              nextCursor: 'p2',
            )
          : CursorPage(
              items: [
                _myBid('a2', BidStatus.accepted),
                _myBid('w1', BidStatus.withdrawn),
              ],
            );
}

void main() {
  setUpAll(initializeDateFormatting);

  group('CaseDraft (docs/04 §3.2)', () {
    test('validates each step', () {
      const d = CaseDraft();
      expect(d.practiceValid, isFalse);
      expect(d.copyWith(title: 'short').titleValid, isFalse);
      expect(d.copyWith(title: 'Speeding ticket NJ').titleValid, isTrue);
      expect(d.copyWith(description: 'x' * 29).descriptionValid, isFalse);
      expect(d.copyWith(description: 'x' * 30).descriptionValid, isTrue);
      expect(
        d.copyWith(
          primaryStateCode: 'NJ',
          additionalStateCodes: ['NY', 'PA'],
        ).placeValid,
        isTrue,
      );
      expect(
        d.copyWith(
          primaryStateCode: 'NJ',
          additionalStateCodes: ['NY', 'PA', 'CT'],
        ).placeValid,
        isFalse,
      );
      expect(
        d.copyWith(
          primaryStateCode: 'NJ',
          additionalStateCodes: ['NJ'],
        ).placeValid,
        isFalse,
      );
      expect(d.copyWith(budgetIsAmount: true).budgetValid, isFalse);
      expect(
        d.copyWith(budgetIsAmount: true, budgetDollars: 600).budgetValid,
        isTrue,
      );
      expect(
        d.copyWith(budgetIsAmount: true, budgetDollars: 10000001).budgetValid,
        isFalse,
      );
    });

    test('round-trips through its local JSON and survives corrupt data', () {
      final d = completeDraft().copyWith(
        additionalStateCodes: ['NY'],
        budgetIsAmount: true,
        budgetDollars: 900,
      );
      final back = CaseDraft.decode(d.encode())!;
      expect(back.title, d.title);
      expect(back.additionalStateCodes, ['NY']);
      expect(back.budgetDollars, 900);
      expect(back.step, 4);
      expect(CaseDraft.decode('{broken'), isNull);
    });

    test('keeps uploaded files and counts them as content', () {
      const d = CaseDraft(
        files: [
          CaseDraftFile(fileId: 'f1'),
          CaseDraftFile(fileId: 'f2', name: 'lease.pdf'),
        ],
      );
      expect(d.isEmpty, isFalse);
      expect(const CaseDraft().isEmpty, isTrue);
      final back = CaseDraft.decode(d.encode())!;
      expect(back.files, d.files);
    });
  });

  group('CaseBid rules (docs/04 §6.1)', () {
    test('counter is unavailable at 5 rounds and for free consultations', () {
      expect(bidFixture().canCounter, isTrue);
      expect(bidFixture(rounds: 5).canCounter, isFalse);
      expect(bidFixture(fee: FeeType.freeConsultation).canCounter, isFalse);
      expect(bidFixture().isTurnOf(PartyRole.client), isTrue);
      expect(bidFixture().isTurnOf(PartyRole.attorney), isFalse);
    });
  });

  group('CreateCaseController (docs/04 §3.1, §3.4)', () {
    test('a failed upload blocks Next and Publish', () {
      final failed = CasePhotoUpload(
        key: 0,
        bytes: Uint8List(1),
        failed: true,
      );
      final essence = CreateCaseState(
        draft: completeDraft().copyWith(step: 1),
        photos: [failed],
      );
      expect(essence.stepValid, isFalse);
      expect(essence.copyWith(photos: const []).stepValid, isTrue);
      final review = CreateCaseState(
        draft: completeDraft(),
        needsConsent: false,
        photos: [failed],
      );
      expect(review.stepValid, isFalse);
    });

    testWidgets('a restored draft brings back its uploaded files',
        (tester) async {
      late ProviderContainer c;
      final wrap = await onboardingWrapper(
        AppTheme.light(),
        user: clientMe(),
        extra: casesOverrides(),
      );
      await tester.pumpWidget(
        wrap(
          Consumer(
            builder: (context, ref, _) {
              c = ProviderScope.containerOf(context);
              return const SizedBox();
            },
          ),
        ),
      );
      final draft = completeDraft().copyWith(
        step: 2,
        files: const [
          CaseDraftFile(fileId: 'f1'),
          CaseDraftFile(fileId: 'f2', name: 'lease.pdf'),
        ],
      );
      await tester.runAsync(
        () => c
            .read(casesLocalDatabaseProvider)
            .saveDraft(clientMe().id, draft.encode()),
      );
      c.listen(createCaseControllerProvider, (_, __) {});
      await tester.runAsync(
        () => Future<void>.delayed(const Duration(milliseconds: 50)),
      );
      await tester.pump();
      final s = c.read(createCaseControllerProvider);
      expect(s.restoredDraft, isTrue);
      expect(s.draft.step, 2);
      expect(s.photos.map((p) => p.fileId), ['f1', 'f2']);
      expect(s.photos.last.isDocument, isTrue);
      expect(s.photosUploading, isFalse);
    });

    testWidgets('publishes with the first-case consent and clears the draft',
        (tester) async {
      final repo = _PublishRepo();
      late ProviderContainer c;
      final wrap = await onboardingWrapper(
        AppTheme.light(),
        user: clientMe(),
        extra: casesOverrides(repo: repo),
      );
      await tester.pumpWidget(
        wrap(
          Consumer(
            builder: (context, ref, _) {
              c = ProviderScope.containerOf(context);
              return const SizedBox();
            },
          ),
        ),
      );
      final ctrl = c.read(createCaseControllerProvider.notifier);
      c.listen(createCaseControllerProvider, (_, __) {});
      await tester.pump();
      ctrl.update((_) => completeDraft());
      expect(
        c.read(createCaseControllerProvider).stepValid,
        isFalse,
        reason: 'consent unchecked',
      );
      ctrl.setConsent(value: true);
      expect(await ctrl.publish(), isTrue);
      expect(repo.consent, isTrue);
      expect(c.read(createCaseControllerProvider).publishedCaseId, 'new-case');
    });

    testWidgets('contact info in the text sends the client back to step 2',
        (tester) async {
      final repo = _PublishRepo(
        error: const ApiException(
          code: ApiErrorCodes.caseContainsContactInfo,
          message: 'x',
        ),
      );
      late ProviderContainer c;
      final wrap = await onboardingWrapper(
        AppTheme.light(),
        user: clientMe(),
        extra: casesOverrides(repo: repo),
      );
      await tester.pumpWidget(
        wrap(
          Consumer(
            builder: (context, ref, _) {
              c = ProviderScope.containerOf(context);
              return const SizedBox();
            },
          ),
        ),
      );
      final ctrl = c.read(createCaseControllerProvider.notifier);
      c.listen(createCaseControllerProvider, (_, __) {});
      await tester.pump();
      ctrl
        ..update((_) => completeDraft())
        ..setConsent(value: true);
      expect(await ctrl.publish(), isFalse);
      final s = c.read(createCaseControllerProvider);
      expect(s.draft.step, 1);
      expect(s.error?.code, ApiErrorCodes.caseContainsContactInfo);
    });
  });

  group('Mine bids', () {
    testWidgets('"Finished" leaves out accepted bids', (tester) async {
      late ProviderContainer c;
      final wrap = await onboardingWrapper(
        AppTheme.light(),
        user: attorneyMe(),
        extra: casesOverrides(repo: _FinishedBidsRepo()),
      );
      await tester.pumpWidget(
        wrap(
          Consumer(
            builder: (context, ref, _) {
              c = ProviderScope.containerOf(context);
              return const SizedBox();
            },
          ),
        ),
      );
      const key = (filter: MyBidsFilter.finished, search: MineSearch());
      c.listen(mineBidsProvider(key), (_, __) {});
      final page = await c.read(mineBidsProvider(key).future);
      expect(page.items.map((b) => b.bid.id), ['w1']);
    });
  });

  group('Screens', () {
    testWidgets('a stale open case asks "still relevant?" and keeps it alive',
        (tester) async {
      final repo = _StaleCaseRepo();
      final wrap = await onboardingWrapper(
        AppTheme.light(),
        user: clientMe(),
        extra: casesOverrides(repo: repo),
      );
      await tester.pumpWidget(wrap(const OwnerCaseScreen(caseId: 'case-1')));
      await tester.pumpAndSettle();
      expect(find.byKey(const ValueKey('stale-prompt')), findsOneWidget);
      // Owner 2026-10-07: one thin line with a short «Да».
      await tester.tap(
        find.descendant(
          of: find.byKey(const ValueKey('stale-prompt')),
          matching: find.text('Yes'),
        ),
      );
      await tester.pumpAndSettle();
      expect(repo.kept, ['case-1']);
      expect(find.byKey(const ValueKey('stale-prompt')), findsNothing);
    });

    testWidgets('a won case opens the work screen for its attorney',
        (tester) async {
      final router = GoRouter(
        initialLocation: '/case/case-1',
        routes: [
          GoRoute(
            path: '/case/:id',
            builder: (_, s) =>
                AttorneyCaseScreen(caseId: s.pathParameters['id']!),
          ),
          GoRoute(
            path: '/mine/work/:id',
            builder: (_, s) => Scaffold(
              body: Text('WORK ${s.pathParameters['id']}'),
            ),
          ),
        ],
      );
      addTearDown(router.dispose);
      final wrap = await onboardingWrapper(
        AppTheme.light(),
        user: attorneyMe(),
        extra: casesOverrides(repo: _WonCaseRepo()),
      );
      final scoped = wrap(const SizedBox.shrink()) as ProviderScope;
      await tester.pumpWidget(
        ProviderScope(
          overrides: scoped.overrides,
          child:
              MaterialApp.router(theme: AppTheme.light(), routerConfig: router),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text('WORK case-1'), findsOneWidget);
    });

    testWidgets('client "Мои кейсы" empty state offers "Create a case"',
        (tester) async {
      final wrap = await onboardingWrapper(
        AppTheme.light(),
        user: clientMe(),
        extra: casesOverrides(),
      );
      await tester.pumpWidget(wrap(const Scaffold(body: ClientMineView())));
      await tester.pumpAndSettle();
      // Owner 2026-10-01: Mine opens on the client's planner first.
      expect(find.text('Planner'), findsOneWidget);
      // Owner 2026-10-02: three tabs — Planner · Cases · Saved.
      expect(find.text('Cases'), findsOneWidget);
      await tester.tap(find.text('Cases'));
      await tester.pumpAndSettle();
      expect(find.text('You have no cases yet'), findsOneWidget);
      expect(find.text('Create a case'), findsOneWidget);
    });

    testWidgets("client's turn: accept, decline and counter are offered",
        (tester) async {
      final wrap = await onboardingWrapper(
        AppTheme.light(),
        user: clientMe(),
        extra: casesOverrides(repo: _BidRepo(bidFixture())),
      );
      await tester.pumpWidget(wrap(const BidDetailScreen(bidId: 'bid-1')));
      await tester.pumpAndSettle();
      expect(find.text('Accept offer'), findsOneWidget);
      expect(find.text('Decline'), findsOneWidget);
      expect(find.text('Counter-offer'), findsWidgets);
      expect(find.text('Round 0 of 5'), findsWidgets);
    });

    testWidgets("attorney's turn is not now: no accept button", (tester) async {
      final wrap = await onboardingWrapper(
        AppTheme.light(),
        user: attorneyMe(),
        extra: casesOverrides(repo: _BidRepo(bidFixture())),
      );
      await tester.pumpWidget(wrap(const BidDetailScreen(bidId: 'bid-1')));
      await tester.pumpAndSettle();
      expect(find.text('Accept offer'), findsNothing);
      expect(find.text('Withdraw'), findsOneWidget);
      expect(find.text('Waiting for the client'), findsWidgets);
    });
  });
}
