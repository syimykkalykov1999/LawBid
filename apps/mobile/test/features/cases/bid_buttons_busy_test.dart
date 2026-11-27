import 'dart:async';

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
import 'package:material_ui/material_ui.dart';

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

/// Owner 26.11: a bid change is server-confirmed — the pressed button spins
/// and takes no second tap until the server answered.
class _HeldRepo extends _Repo {
  _HeldRepo({super.bidNow, super.changes});

  final gate = Completer<void>();
  int withdrawn = 0;
  int accepted = 0;

  @override
  Future<CaseBid> confirmBid(String bidId) async {
    confirmed++;
    await gate.future;
    return bidNow = _bid();
  }

  @override
  Future<CaseBid> withdraw(String bidId) async {
    withdrawn++;
    await gate.future;
    return bidNow = _bid();
  }

  @override
  Future<CaseBid> accept(String bidId, {int? version}) async {
    accepted++;
    await gate.future;
    return bidNow = _bid();
  }
}

void main() {
  setUpAll(() async => initializeDateFormatting('en'));

  Finder key(String k) => find.byKey(ValueKey(k));
  Finder spinnerIn(String k) => find.descendant(
        of: key(k),
        matching: find.byType(CircularProgressIndicator),
      );

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
        dealRecordEnabledProvider.overrideWithValue(false),
      ],
    );
    await tester.pumpWidget(wrap(screen));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));
    await tester.pump(const Duration(milliseconds: 100));
  }

  Future<void> settle(WidgetTester tester) async {
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));
    await tester.pump(const Duration(milliseconds: 400));
  }

  final waitingBid = _bid(waiting: DateTime(2026, 11));
  final changed = [
    api.BidCaseChangeDto(
      field: 'description',
      oldValue: 'Old text',
      newValue: 'New text',
      at: DateTime(2026, 11, 5),
    ),
  ];

  testWidgets('«Бид в силе» spins and sends once on fast taps', (t) async {
    final repo = _HeldRepo(bidNow: waitingBid, changes: changed);
    await pump(t, const AttorneyCaseScreen(caseId: 'case-1'), repo);
    await t.tap(find.text('Changes'));
    await settle(t);
    await t.tap(key('case-bid-keep'));
    await t.pump();
    expect(spinnerIn('case-bid-keep'), findsOneWidget);
    expect(spinnerIn('case-withdraw'), findsNothing);
    await t.tap(key('case-bid-keep'), warnIfMissed: false);
    await t.tap(key('case-withdraw'), warnIfMissed: false);
    await t.pump();
    expect(repo.confirmed, 1);
    expect(repo.withdrawn, 0);
    repo.gate.complete();
    await settle(t);
    expect(spinnerIn('case-bid-keep'), findsNothing);
  });

  testWidgets('«Отозвать» spins after the confirm and sends once', (t) async {
    final repo = _HeldRepo(bidNow: _bid());
    await pump(t, const AttorneyCaseScreen(caseId: 'case-1'), repo);
    await t.tap(find.text('Changes'));
    await settle(t);
    await t.tap(key('case-withdraw'));
    await settle(t);
    await t.tap(find.text('Withdraw').last);
    await t.pump();
    expect(spinnerIn('case-withdraw'), findsOneWidget);
    await t.tap(key('case-withdraw'), warnIfMissed: false);
    await settle(t);
    expect(find.text('Withdraw'), findsNothing, reason: 'no second sheet');
    expect(repo.withdrawn, 1);
    repo.gate.complete();
    await settle(t);
    expect(spinnerIn('case-withdraw'), findsNothing);
  });

  testWidgets('«Принять» on a bid card spins and sends once', (t) async {
    final repo = _HeldRepo(bidNow: _bid());
    await pump(
      t,
      const OwnerCaseScreen(caseId: 'case-1', initialSection: CaseSection.bids),
      repo,
    );
    await t.tap(key('bid-card-accept-bid-1'));
    await settle(t);
    await t.tap(find.text('Accept').last);
    await t.pump();
    expect(spinnerIn('bid-card-accept-bid-1'), findsOneWidget);
    await t.tap(key('bid-card-accept-bid-1'), warnIfMissed: false);
    await settle(t);
    expect(repo.accepted, 1);
    repo.gate.complete();
    await settle(t);
    expect(spinnerIn('bid-card-accept-bid-1'), findsNothing);
  });
}
