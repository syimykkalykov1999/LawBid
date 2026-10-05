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

  @override
  Future<PartnerMe> me() async => state;

  @override
  Future<PartnerMe> join() async {
    joins += 1;
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
}) =>
    PartnerMe(
      enabled: enabled,
      isPartner: isPartner,
      canJoin: canJoin,
      status: isPartner ? 'active' : null,
      code: isPartner ? 'ANN12345' : '',
      shareUrl: isPartner ? 'https://lawbid.dev/r/ANN12345' : '',
      rates: _rates,
      totals: _totals,
      referred: const [],
      commissions: const [],
      title: 'Partner program',
      summary: 'Share your link.',
    );

final _partner = _me(enabled: true, isPartner: true, canJoin: false);

final _client = meFixture(
  role: UserRole.client,
  consents: true,
  firstName: 'Ann',
  lastName: 'Lee',
  email: 'ann@example.com',
  emailVerified: true,
  completed: true,
);

Future<void> _pump(WidgetTester tester, FakePartnersRepository repo) async {
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

    await tester.tap(find.byKey(const ValueKey('partner-join')));
    await tester.pumpAndSettle();

    expect(repo.joins, 1);
    expect(find.byKey(const ValueKey('partner-join')), findsNothing);
    expect(find.text('ANN12345'), findsOneWidget);
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
