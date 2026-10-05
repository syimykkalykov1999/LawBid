import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/navigation/app_routes.dart';
import 'package:lawbid/features/cases/domain/case_models.dart';
import 'package:lawbid/features/cases/presentation/screens/attorney_case_screen.dart';
import 'package:lawbid/features/subscription/application/subscription_providers.dart';
import 'package:lawbid/features/subscription/domain/subscription_models.dart';
import 'package:lawbid/shared/domain/user_role.dart';

import '../../helpers/fixtures.dart';
import '../../helpers/onboarding_harness.dart';
import '../subscription/subscription_fakes.dart';
import 'cases_fakes.dart';

FeedCase _case({bool inStates = true, bool inPractice = true}) => FeedCase(
      id: 'case-1',
      title: 'Speeding ticket',
      practice: const PracticeRef(
        id: 'p1',
        code: 'general_practice.not_sure_or_other',
        i18nKey: 'practice.general_practice.not_sure_or_other',
        nameEn: 'Not sure',
      ),
      primaryStateCode: 'CA',
      additionalStateCodes: const [],
      city: null,
      status: CaseStatus.open,
      budget: const CaseBudget(mode: BudgetMode.clarifyLater),
      viewCount: 1,
      bidsCount: 0,
      createdAt: DateTime(2026, 10, 4),
      isNew: true,
      hasOwnBid: false,
      description: 'A ticket on I-5, need help.',
      inMyPractice: inPractice,
      inMyLicensedStates: inStates,
    );

class _Repo extends FakeCasesRepository {
  _Repo(this.value);
  final FeedCase value;
  @override
  Future<FeedCase> attorneyCase(String caseId) async => value;
  @override
  Future<void> recordView(String caseId) async {}
}

void main() {
  setUpAll(initializeDateFormatting);

  Future<GoRouter> pump(
    WidgetTester tester, {
    required FeedCase kase,
    required SubscriptionOverview overview,
  }) async {
    tester.view.physicalSize = const Size(390, 1200);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    final router = GoRouter(
      initialLocation: '/case/case-1',
      routes: [
        GoRoute(
          path: '/case/:id',
          builder: (_, s) =>
              AttorneyCaseScreen(caseId: s.pathParameters['id']!),
        ),
        GoRoute(
          path: AppRoutes.placeBidPattern,
          builder: (_, __) => const Scaffold(body: Text('BID FORM')),
        ),
        GoRoute(
          path: '/subscription-required',
          builder: (_, s) => Scaffold(
            body: Text('OFFER ${s.uri.queryParameters['reason']}'),
          ),
        ),
      ],
    );
    addTearDown(router.dispose);
    final wrap = await onboardingWrapper(
      AppTheme.light(),
      user: meFixture(role: UserRole.attorney, completed: true),
      extra: [
        ...casesOverrides(repo: _Repo(kase)),
        subscriptionRepositoryProvider
            .overrideWithValue(FakeSubscriptionRepository(overview)),
      ],
    );
    await tester.pumpWidget(wrap(Router.withConfig(config: router)));
    await tester.pumpAndSettle();
    return router;
  }

  Future<void> tapBid(WidgetTester tester) async {
    final bid = find.byIcon(AppIcons.gavelRounded);
    expect(bid, findsOneWidget);
    await tester.tap(bid);
    await tester.pumpAndSettle();
  }

  Future<void> tearDownTree(WidgetTester tester) async {
    await tester.pumpWidget(const SizedBox.shrink());
    await tester.pump(Duration.zero);
  }

  testWidgets('no subscription: the bid button opens the subscription offer',
      (tester) async {
    await pump(tester, kase: _case(), overview: makeOverview());
    await tapBid(tester);
    expect(find.text('OFFER bid'), findsOneWidget);
    expect(find.text('BID FORM'), findsNothing);
    await tearDownTree(tester);
  });

  testWidgets(
      'out-of-state "Not sure" case with a subscription: bid form opens, '
      'only an info note', (tester) async {
    await pump(
      tester,
      kase: _case(inStates: false, inPractice: false),
      overview: makeOverview(subscription: makeInfo()),
    );
    expect(find.byKey(const ValueKey('outside-states-note')), findsOneWidget);
    await tapBid(tester);
    expect(find.text('BID FORM'), findsOneWidget);
    await tearDownTree(tester);
  });
}
