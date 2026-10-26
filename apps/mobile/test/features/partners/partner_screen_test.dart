import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/features/partners/application/partners_providers.dart';
import 'package:lawbid/features/partners/data/partners_repository.dart';
import 'package:lawbid/features/partners/domain/partner_models.dart';
import 'package:lawbid/features/partners/presentation/partner_screen.dart';
import 'package:lawbid/shared/domain/user_role.dart';

import '../../helpers/fixtures.dart';
import '../../helpers/onboarding_harness.dart';

/// Owner 2026-10-05: attorneys and clients join the partner program from
/// their own account; the owner's switch hides the whole section.
class FakePartnersRepository extends PartnersRepository {
  FakePartnersRepository(this.state) : super(Dio());

  PartnerMe state;
  int joins = 0;
  int accepts = 0;
  bool? lastTermsAccepted;

  @override
  Future<PartnerMe> me() async => state;

  @override
  Future<PartnerMe> join({required bool termsAccepted}) async {
    joins += 1;
    lastTermsAccepted = termsAccepted;
    return state = state.joinMode == 'approval' ? _pending : _partner;
  }

  @override
  Future<PartnerMe> acceptTerms() async {
    accepts += 1;
    return state = _partner;
  }
}

const _rates = PartnerRates(
  attorneyRateCents: 5000,
  clientRateCents: 1000,
  monthlyBaseCents: 0,
  clientRule: 'bid_accepted',
  holdDays: 14,
);
const _totals = PartnerTotals(
  heldCents: 0,
  approvedCents: 0,
  paidCents: 0,
  thisMonthCents: 0,
  referredCount: 0,
  qualifiedCount: 0,
);

PartnerMe _me({
  required bool enabled,
  required bool isPartner,
  required bool canJoin,
  String joinMode = 'open',
  String? status,
  String? termsAcceptedVersion = '2026-10-05',
}) =>
    PartnerMe(
      enabled: enabled,
      isPartner: isPartner,
      canJoin: canJoin,
      joinMode: joinMode,
      status: status ?? (isPartner ? 'active' : null),
      code: isPartner ? 'ANN12345' : '',
      shareUrl: isPartner ? 'https://lawbid.dev/r/ANN12345' : '',
      rates: _rates,
      totals: _totals,
      referred: const [],
      commissions: const [],
      title: 'Partner program',
      summary: 'Share your link.',
      disclosure: 'Say it is a paid link in every post.',
      terms:
          '1. You are an independent contractor.\n2. Disclose the paid link.',
      termsVersion: '2026-10-05',
      termsAcceptedVersion: isPartner ? termsAcceptedVersion : null,
    );

final _partner = _me(enabled: true, isPartner: true, canJoin: false);
final _pending = _me(
  enabled: true,
  isPartner: true,
  canJoin: false,
  joinMode: 'approval',
  status: 'pending',
);

final _client = meFixture(
  role: UserRole.client,
  consents: true,
  firstName: 'Ann',
  lastName: 'Lee',
  email: 'ann@example.com',
  emailVerified: true,
  completed: true,
);

/// Taps the box itself — the label beside it opens the rules sheet.
Future<void> _tickTerms(WidgetTester tester) async {
  final tile = find.byKey(const ValueKey('partner-terms-checkbox'));
  await tester.tapAt(tester.getTopLeft(tile) + const Offset(12, 16));
  await tester.pumpAndSettle();
}

Future<void> _pump(WidgetTester tester, FakePartnersRepository repo) async {
  // A tall phone so the lazy ListView builds the checkbox and the button.
  tester.view
    ..devicePixelRatio = 1
    ..physicalSize = const Size(600, 2400);
  addTearDown(tester.view.reset);
  final wrap = await onboardingWrapper(
    AppTheme.light(),
    user: _client,
    repo: FakeOnboardingRepository(_client),
    extra: [partnersRepositoryProvider.overrideWithValue(repo)],
  );
  await tester.pumpWidget(wrap(const PartnerScreen()));
  await tester.pumpAndSettle();
}

void main() {
  setUpAll(initializeDateFormatting);

  testWidgets('a non-partner who may join sees the rates and joins in one tap',
      (tester) async {
    final repo = FakePartnersRepository(
      _me(enabled: true, isPartner: false, canJoin: true),
    );
    await _pump(tester, repo);

    expect(find.byKey(const ValueKey('partner-join')), findsOneWidget);
    expect(find.text('Program rates'), findsOneWidget);
    expect(find.text(r'$50.00'), findsOneWidget);
    // Owner 2026-10-05 (legal): the FTC disclosure is shown before joining.
    expect(find.byKey(const ValueKey('partner-disclosure')), findsOneWidget);

    await _tickTerms(tester);
    await tester.tap(find.byKey(const ValueKey('partner-join')));
    await tester.pumpAndSettle();

    expect(repo.joins, 1);
    expect(repo.lastTermsAccepted, isTrue);
    expect(find.byKey(const ValueKey('partner-join')), findsNothing);
    expect(find.text('ANN12345'), findsOneWidget);
    await tester.pumpWidget(const SizedBox.shrink());
  });

  testWidgets('approval mode: the tap sends a request; no link until approved',
      (tester) async {
    final repo = FakePartnersRepository(
      _me(enabled: true, isPartner: false, canJoin: true, joinMode: 'approval'),
    );
    await _pump(tester, repo);
    expect(find.textContaining('sends a request'), findsOneWidget);
    await _tickTerms(tester);
    await tester.tap(find.byKey(const ValueKey('partner-join')));
    await tester.pumpAndSettle();
    expect(repo.joins, 1);
    expect(
      find.byKey(const ValueKey('partner-status-pending')),
      findsOneWidget,
    );
    expect(find.text('ANN12345'), findsNothing);
    await tester.pumpWidget(const SizedBox.shrink());
  });

  testWidgets("the owner's switch off hides everything, even for a partner",
      (tester) async {
    final repo = FakePartnersRepository(
      _me(enabled: false, isPartner: true, canJoin: false),
    );
    await _pump(tester, repo);
    expect(find.text('The program is closed for now'), findsOneWidget);
    expect(find.text('ANN12345'), findsNothing);
    await tester.pumpWidget(const SizedBox.shrink());
  });

  // Owner 2026-10-05 (legal): no join without accepting the partner rules.
  testWidgets('the join button is gated by the terms checkbox', (tester) async {
    final repo = FakePartnersRepository(
      _me(enabled: true, isPartner: false, canJoin: true),
    );
    await _pump(tester, repo);

    // Unchecked: the tap does nothing.
    await tester.tap(find.byKey(const ValueKey('partner-join')));
    await tester.pumpAndSettle();
    expect(repo.joins, 0);
    expect(find.byKey(const ValueKey('partner-join')), findsOneWidget);

    // The label opens the rules in a scrollable sheet.
    await tester.tap(find.byKey(const ValueKey('partner-terms-open')));
    await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('partner-terms-text')), findsOneWidget);
    expect(find.textContaining('independent contractor'), findsOneWidget);
    await tester.tap(find.text('Close'));
    await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('partner-terms-text')), findsNothing);

    // Checked: the join goes through with termsAccepted: true.
    await _tickTerms(tester);
    await tester.tap(find.byKey(const ValueKey('partner-join')));
    await tester.pumpAndSettle();
    expect(repo.joins, 1);
    expect(repo.lastTermsAccepted, isTrue);
    await tester.pumpWidget(const SizedBox.shrink());
  });

  testWidgets(
      'an existing partner without acceptance sees the rules, not the link',
      (tester) async {
    final repo = FakePartnersRepository(
      _me(
        enabled: true,
        isPartner: true,
        canJoin: false,
        termsAcceptedVersion: null,
      ),
    );
    await _pump(tester, repo);
    expect(find.byKey(const ValueKey('partner-terms-pending')), findsOneWidget);
    expect(find.byKey(const ValueKey('partner-disclosure')), findsOneWidget);
    expect(find.text('ANN12345'), findsNothing);

    await tester.tap(find.byKey(const ValueKey('partner-terms-open')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey('partner-terms-accept')));
    await tester.pumpAndSettle();

    expect(repo.accepts, 1);
    expect(find.byKey(const ValueKey('partner-terms-pending')), findsNothing);
    expect(find.text('ANN12345'), findsOneWidget);
    await tester.pumpWidget(const SizedBox.shrink());
  });

  testWidgets('self-enrolment off: a non-partner is told the team enrolls',
      (tester) async {
    final repo = FakePartnersRepository(
      _me(enabled: true, isPartner: false, canJoin: false),
    );
    await _pump(tester, repo);
    expect(find.text('You are not in the program'), findsOneWidget);
    expect(find.byKey(const ValueKey('partner-join')), findsNothing);
    await tester.pumpWidget(const SizedBox.shrink());
  });
}
