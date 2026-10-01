import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid/features/cases/application/create_case_controller.dart';
import 'package:lawbid/features/cases/domain/case_draft.dart';
import 'package:lawbid/features/cases/domain/case_models.dart';
import 'package:lawbid/features/cases/presentation/screens/bid_detail_screen.dart';
import 'package:lawbid/features/cases/presentation/screens/mine_views.dart';

import '../../helpers/onboarding_harness.dart';
import '../profile/profile_fakes.dart';
import 'cases_fakes.dart';

CaseBid bidFixture({PartyRole turn = PartyRole.client, int rounds = 0, FeeType fee = FeeType.fixed}) => CaseBid(
      id: 'bid-1',
      caseId: 'case-1',
      attorneyId: 'att-1',
      status: BidStatus.active,
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
  Future<String> createCase(CaseDraft draft,
      {required bool contactSharingConsent, List<String> photoFileIds = const []}) async {
    consent = contactSharingConsent;
    if (error != null) throw error!;
    return 'new-case';
  }
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
      expect(d.copyWith(primaryStateCode: 'NJ', additionalStateCodes: ['NY', 'PA']).placeValid, isTrue);
      expect(d.copyWith(primaryStateCode: 'NJ', additionalStateCodes: ['NY', 'PA', 'CT']).placeValid, isFalse);
      expect(d.copyWith(primaryStateCode: 'NJ', additionalStateCodes: ['NJ']).placeValid, isFalse);
      expect(d.copyWith(budgetIsAmount: true).budgetValid, isFalse);
      expect(d.copyWith(budgetIsAmount: true, budgetDollars: 600).budgetValid, isTrue);
      expect(d.copyWith(budgetIsAmount: true, budgetDollars: 10000001).budgetValid, isFalse);
    });

    test('round-trips through its local JSON and survives corrupt data', () {
      final d = completeDraft().copyWith(additionalStateCodes: ['NY'], budgetIsAmount: true, budgetDollars: 900);
      final back = CaseDraft.decode(d.encode())!;
      expect(back.title, d.title);
      expect(back.additionalStateCodes, ['NY']);
      expect(back.budgetDollars, 900);
      expect(back.step, 4);
      expect(CaseDraft.decode('{broken'), isNull);
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
    testWidgets('publishes with the first-case consent and clears the draft', (tester) async {
      final repo = _PublishRepo();
      late ProviderContainer c;
      final wrap = await onboardingWrapper(AppTheme.light(), user: clientMe(), extra: casesOverrides(repo: repo));
      await tester.pumpWidget(wrap(Consumer(builder: (context, ref, _) {
        c = ProviderScope.containerOf(context);
        return const SizedBox();
      })));
      final ctrl = c.read(createCaseControllerProvider.notifier);
      c.listen(createCaseControllerProvider, (_, __) {});
      await tester.pump();
      ctrl.update((_) => completeDraft());
      expect(c.read(createCaseControllerProvider).stepValid, isFalse, reason: 'consent unchecked');
      ctrl.setConsent(value: true);
      expect(await ctrl.publish(), isTrue);
      expect(repo.consent, isTrue);
      expect(c.read(createCaseControllerProvider).publishedCaseId, 'new-case');
    });

    testWidgets('contact info in the text sends the client back to step 2', (tester) async {
      final repo = _PublishRepo(
        error: const ApiException(code: ApiErrorCodes.caseContainsContactInfo, message: 'x'),
      );
      late ProviderContainer c;
      final wrap = await onboardingWrapper(AppTheme.light(), user: clientMe(), extra: casesOverrides(repo: repo));
      await tester.pumpWidget(wrap(Consumer(builder: (context, ref, _) {
        c = ProviderScope.containerOf(context);
        return const SizedBox();
      })));
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

  group('Screens', () {
    testWidgets('client "Мои кейсы" empty state offers "Create a case"', (tester) async {
      final wrap = await onboardingWrapper(AppTheme.light(), user: clientMe(), extra: casesOverrides());
      await tester.pumpWidget(wrap(const Scaffold(body: ClientMineView())));
      await tester.pumpAndSettle();
      // Owner 2026-10-01: Mine opens on the client's planner first.
      expect(find.text('Planner'), findsOneWidget);
      await tester.tap(find.text('Open'));
      await tester.pumpAndSettle();
      expect(find.text('You have no cases yet'), findsOneWidget);
      expect(find.text('Create a case'), findsOneWidget);
    });

    testWidgets("client's turn: accept, decline and counter are offered", (tester) async {
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
