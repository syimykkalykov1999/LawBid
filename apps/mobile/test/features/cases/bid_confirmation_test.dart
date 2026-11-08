import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/features/cases/deals/deal_record_data.dart';
import 'package:lawbid/features/cases/domain/case_models.dart';
import 'package:lawbid/features/cases/presentation/screens/attorney_case_screen.dart';
import 'package:lawbid/features/cases/presentation/screens/owner_case_screen.dart';
import 'package:lawbid/features/cases/presentation/widgets/case_sections.dart';
import 'package:lawbid/shared/domain/cursor_page.dart';
import 'package:lawbid_api/lawbid_api.dart' as api;

import '../../helpers/onboarding_harness.dart';
import '../profile/profile_fakes.dart';
import 'cases_fakes.dart';

const _practice = PracticeRef(
  id: 'leaf-1',
  code: 'traffic',
  i18nKey: 'practice.traffic',
  nameEn: 'Traffic',
);

CaseBid _bid({DateTime? waiting, PartyRole turn = PartyRole.client}) => CaseBid(
      id: 'bid-1',
      caseId: 'case-1',
      attorneyId: 'att-1',
      status: BidStatus.active,
      feeType: FeeType.fixed,
      amountCents: 60000,
      message: 'Happy to help.',
      startAvailability: StartAvailability.immediately,
      startDate: null,
      estimatedDurationDays: null,
      roundCount: 0,
      turn: turn,
      createdAt: DateTime(2026, 9, 20),
      confirmationRequiredAt: waiting,
    );

class _Repo extends FakeCasesRepository {
  _Repo({this.bidNow, this.changes = const []});

  CaseBid? bidNow;
  final List<api.BidCaseChangeDto> changes;
  int confirmed = 0;
  api.PaymentTermsDto? sentTerms;
  FeeType? sentFee;
  int? sentAmount;

  @override
  Future<CaseBid> changeBid(
    String bidId, {
    required FeeType feeType,
    int? amountCents,
    int? percentBps,
    String? message,
    api.PaymentTermsDto? paymentTerms,
  }) async {
    sentTerms = paymentTerms;
    sentFee = feeType;
    sentAmount = amountCents;
    return bidNow = _bid();
  }

  @override
  Future<FeedCase> attorneyCase(String caseId) async => FeedCase(
        id: caseId,
        title: 'A case',
        description: 'Text.',
        practice: _practice,
        primaryStateCode: 'NJ',
        additionalStateCodes: const [],
        city: null,
        status: CaseStatus.open,
        budget: const CaseBudget(mode: BudgetMode.clarifyLater),
        viewCount: 1,
        bidsCount: 1,
        createdAt: DateTime(2026, 9, 20),
        isNew: false,
        hasOwnBid: true,
        ownBidId: 'bid-1',
      );

  @override
  Future<OwnerCase> ownerCase(String caseId) async => OwnerCase(
        id: caseId,
        title: 'A case',
        description: 'Text.',
        practice: _practice,
        primaryStateCode: 'NJ',
        additionalStateCodes: const [],
        city: null,
        budget: const CaseBudget(mode: BudgetMode.clarifyLater),
        status: CaseStatus.open,
        viewCount: 1,
        bidsCount: 1,
        createdAt: DateTime(2026, 9, 2),
        lastActivityAt: DateTime(2026, 9, 2),
      );

  @override
  Future<CursorPage<CaseBid>> caseBids(
    String caseId,
    BidsSort sort, {
    String? cursor,
  }) async =>
      CursorPage(items: [bidNow!]);

  @override
  Future<CaseBid> bid(String bidId) async => bidNow!;

  @override
  Future<List<api.BidCaseChangeDto>> bidCaseChanges(String bidId) async =>
      changes;

  @override
  Future<CaseBid> confirmBid(String bidId) async {
    confirmed++;
    return bidNow = _bid();
  }

  @override
  Future<void> recordViews(List<String> caseIds) async {}
}

void main() {
  setUpAll(() async => initializeDateFormatting('en'));

  Finder key(String k) => find.byKey(ValueKey(k));

  Future<void> pump(WidgetTester tester, Widget screen, _Repo repo) async {
    tester.view.physicalSize = const Size(390, 1400);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    final wrap = await onboardingWrapper(
      AppTheme.light(),
      user: clientMe(),
      extra: [
        ...casesOverrides(repo: repo),
        bidConfirmationProvider.overrideWithValue(true),
      ],
    );
    await tester.pumpWidget(wrap(screen));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));
    await tester.pump(const Duration(milliseconds: 100));
  }

  Future<void> openChanges(WidgetTester tester) async {
    await tester.tap(find.text('Changes'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));
    await tester.pump(const Duration(milliseconds: 400));
  }

  testWidgets('a waiting bid: the client sees the wait, no Accept', (t) async {
    await pump(
      t,
      const OwnerCaseScreen(
        caseId: 'case-1',
        initialSection: CaseSection.bids,
      ),
      _Repo(bidNow: _bid(waiting: DateTime(2026, 11))),
    );
    expect(key('bid-card-waiting-bid-1'), findsOneWidget);
    expect(key('bid-card-accept-bid-1'), findsNothing);
  });

  testWidgets('changes listed; «Бид в силе» confirms', (t) async {
    final repo = _Repo(
      bidNow: _bid(waiting: DateTime(2026, 11)),
      changes: [
        api.BidCaseChangeDto(
          field: 'description',
          oldValue: 'Old text',
          newValue: 'New text',
          at: DateTime(2026, 11, 5),
        ),
      ],
    );
    await pump(t, const AttorneyCaseScreen(caseId: 'case-1'), repo);
    await openChanges(t);
    expect(find.text('Old text'), findsOneWidget);
    expect(find.text('New text'), findsOneWidget);
    expect(key('case-bid-change'), findsOneWidget);
    expect(key('case-withdraw'), findsOneWidget);
    await t.tap(key('case-bid-keep'));
    await t.pump();
    await t.pump(const Duration(milliseconds: 100));
    expect(repo.confirmed, 1);
  });

  testWidgets("no changes, not the attorney's turn: no Change, no Keep",
      (t) async {
    await pump(
      t,
      const AttorneyCaseScreen(caseId: 'case-1'),
      _Repo(bidNow: _bid()),
    );
    await openChanges(t);
    expect(key('case-changes-none'), findsOneWidget);
    expect(key('case-bid-keep'), findsNothing);
    expect(key('case-bid-change'), findsNothing);
    expect(key('case-withdraw'), findsOneWidget);
  });

  testWidgets('«Поменять бид» opens on the tiles with «Сумма» chosen',
      (t) async {
    await pump(
      t,
      const AttorneyCaseScreen(caseId: 'case-1'),
      _Repo(bidNow: _bid(turn: PartyRole.attorney)),
    );
    await openChanges(t);
    await t.tap(key('case-bid-change'));
    await t.pump();
    await t.pump(const Duration(milliseconds: 400));
    expect(key('pay-tile-flat'), findsOneWidget);
    expect(key('pay-tile-hourly'), findsOneWidget);
    expect(find.text('One sum for the whole job'), findsOneWidget);
    // Nothing is typed yet, so the button is grey.
    final send = t.widget<AppButton>(key('change-bid-send'));
    expect(send.isEnabled, isFalse);
  });

  testWidgets('«Поменять бид» sends the detailed terms', (t) async {
    final repo = _Repo(bidNow: _bid(turn: PartyRole.attorney));
    t.view.physicalSize = const Size(390, 2400);
    t.view.devicePixelRatio = 1;
    addTearDown(t.view.reset);
    final wrap = await onboardingWrapper(
      AppTheme.light(),
      user: clientMe(),
      extra: [
        ...casesOverrides(repo: repo),
        bidConfirmationProvider.overrideWithValue(true),
        richTermsEnabledProvider.overrideWithValue(true),
      ],
    );
    await t.pumpWidget(wrap(const AttorneyCaseScreen(caseId: 'case-1')));
    await t.pump();
    await t.pump(const Duration(milliseconds: 200));
    await openChanges(t);
    await t.tap(key('case-bid-change'));
    await t.pump();
    await t.pump(const Duration(milliseconds: 400));
    await t.tap(key('pay-tile-installments'));
    await t.pump();
    await t.pump(const Duration(milliseconds: 400));
    await t.enterText(key('pay-field-retainer'), '2000');
    await t.enterText(key('pay-field-installment'), '1000');
    await t.enterText(key('pay-field-count'), '6');
    await t.pump();
    await t.ensureVisible(key('change-bid-send'));
    await t.pump();
    await t.tap(key('change-bid-send'));
    await t.pump(const Duration(milliseconds: 100));
    expect(repo.sentFee, FeeType.fixed);
    // Headline amount: $2000 + 6 x $1000.
    expect(repo.sentAmount, 800000);
    expect(
      repo.sentTerms?.type,
      api.PaymentTermsDtoType.retainerPlusInstallments,
    );
    expect(repo.sentTerms?.retainerCents, 200000);
    expect(repo.sentTerms?.installmentCents, 100000);
    expect(repo.sentTerms?.installmentCount, 6);
  });
}
