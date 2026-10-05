// ignore_for_file: lines_longer_than_80_chars
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/core/navigation/app_router.dart';
import 'package:lawbid/core/navigation/app_routes.dart';
import 'package:lawbid/features/onboarding/domain/attorney_setup.dart';
import 'package:lawbid/features/onboarding/domain/current_user.dart';
import 'package:lawbid/features/onboarding/domain/onboarding_step_id.dart';
import 'package:lawbid/features/onboarding/onboarding_routes.dart';
import 'package:lawbid/features/onboarding/presentation/screens/attorney_verification_step_screen.dart';
import 'package:lawbid/features/onboarding/presentation/screens/tour_step_screen.dart';
import 'package:lawbid/features/profile/application/profile_providers.dart';
import 'package:lawbid/features/profile/data/profile_repositories.dart';
import 'package:lawbid/features/profile/domain/profile_models.dart';
import 'package:lawbid/features/profile/presentation/screens/practices_screen.dart';
import 'package:lawbid/features/subscription/application/subscription_providers.dart';
import 'package:lawbid/features/verification/application/verification_overview_controller.dart';
import 'package:lawbid/features/verification/domain/verification_models.dart';
import 'package:lawbid/shared/domain/user_role.dart';

import '../../helpers/fixtures.dart';
import '../../helpers/long_locale.dart';
import '../../helpers/onboarding_harness.dart';
import '../subscription/subscription_fakes.dart';

/// Owner 2026-10-04 (docs/onboarding-lawyer.md): a new attorney goes
/// licence → practices → subscription offer → tour → feed, each stage
/// shown once, and Back never sends them round in a circle.

/// The server state the fakes answer with; the tests change it the way
/// the API would after each save.
class _Server {
  VerificationStatus verification = VerificationStatus.unverified;
  List<String> practiceIds = [];
}

class _Overview extends VerificationOverviewController {
  _Overview(this.server);

  final _Server server;

  @override
  Future<VerificationOverview> build() async => VerificationOverview(
        status: server.verification,
        identityRequired: false,
        barDocumentRequired: false,
        submissionsLast30Days: 0,
        maxSubmissions30Days: 3,
      );
}

const _leaf = PracticeLeaf(
  id: 'leaf-1',
  i18nKey: 'practice.test.leaf',
  nameEn: 'Speeding tickets',
);

const _tree = [
  PracticeCategory(
    id: 'cat-1',
    i18nKey: 'practice.test',
    nameEn: 'Traffic',
    children: [_leaf],
  ),
];

SelectedPractice _selected(String id) => SelectedPractice(
      id: id,
      i18nKey: _leaf.i18nKey,
      nameEn: _leaf.nameEn,
      categoryId: 'cat-1',
      categoryI18nKey: 'practice.test',
    );

class _Practices implements PracticesRepository {
  _Practices(this.server);

  final _Server server;
  final List<String> calls = [];

  @override
  Future<List<PracticeCategory>> fetchTree() async => _tree;

  @override
  Future<List<SelectedPractice>> fetchSelected() async =>
      server.practiceIds.map(_selected).toList();

  @override
  Future<List<SelectedPractice>> replace(List<String> leafIds) async {
    calls.add('replace:${leafIds.join(',')}');
    server.practiceIds = [...leafIds];
    return fetchSelected();
  }
}

/// Saves move the user's step like the API does.
class _Onboarding extends FakeOnboardingRepository {
  _Onboarding(super.me);

  @override
  Future<CurrentUser> saveStep(
    OnboardingStepId step, [
    Map<String, dynamic>? data,
  ]) async {
    await super.saveStep(step, data);
    return me = _attorney(step: step);
  }

  @override
  Future<CurrentUser> completeOnboarding() async {
    await super.completeOnboarding();
    return me = _attorney(step: OnboardingStepId.tour, completed: true);
  }
}

CurrentUser _attorney({
  OnboardingStepId step = OnboardingStepId.verification,
  bool completed = false,
}) =>
    meFixture(
      role: UserRole.attorney,
      consents: true,
      phone: '+15551234567',
      phoneVerified: true,
      firstName: 'Ann',
      lastName: 'Lee',
      step: step,
      completed: completed,
    );

/// Stand-in for the licence form: "Submit" = state + bar number + ✓ →
/// approved at once (self-attestation), then back.
class _LicenseForm extends StatelessWidget {
  const _LicenseForm(this.server);

  final _Server server;

  @override
  Widget build(BuildContext context) => Scaffold(
        body: Center(
          child: TextButton(
            onPressed: () {
              server.verification = VerificationStatus.verified;
              context.pop();
            },
            child: const Text('Submit licence'),
          ),
        ),
      );
}

GoRouter _router(_Server server) => GoRouter(
      initialLocation: OnboardingRoutes.forStep(OnboardingStepId.verification),
      routes: [
        GoRoute(
          path: OnboardingRoutes.forStep(OnboardingStepId.push),
          builder: (_, __) => const Scaffold(body: Text('push step')),
        ),
        GoRoute(
          path: OnboardingRoutes.forStep(OnboardingStepId.verification),
          builder: (_, __) => const AttorneyVerificationStepScreen(),
        ),
        GoRoute(
          path: OnboardingRoutes.forStep(OnboardingStepId.tour),
          builder: (_, __) => const TourStepScreen(),
        ),
        GoRoute(
          path: AppRoutes.verificationWizard,
          builder: (_, __) => _LicenseForm(server),
        ),
        GoRoute(
          path: AppRoutes.feed,
          builder: (_, __) => const Scaffold(body: Text('FEED')),
        ),
      ],
    );

String _location(GoRouter r) =>
    r.routerDelegate.currentConfiguration.last.matchedLocation;

void main() {
  setUpAll(initializeDateFormatting);
  late _Server server;
  late _Practices practices;
  late FakeSubscriptionRepository billing;
  late _Onboarding onboarding;
  late List<Uri> launched;

  setUp(() {
    server = _Server();
    practices = _Practices(server);
    billing = FakeSubscriptionRepository(makeOverview());
    onboarding = _Onboarding(_attorney());
    launched = [];
  });

  Future<GoRouter> pumpFlow(
    WidgetTester tester, {
    Translator? translator,
    TextDirection direction = TextDirection.ltr,
  }) async {
    if (translator == null) {
      tester.view.physicalSize = const Size(390, 1200);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.reset);
    } else {
      useNarrowPhone(tester);
    }
    final router = _router(server);
    addTearDown(router.dispose);
    final wrap = await onboardingWrapper(
      AppTheme.light(),
      user: onboarding.me,
      repo: onboarding,
      extra: [
        appRouterProvider.overrideWithValue(router),
        verificationOverviewProvider.overrideWith(() => _Overview(server)),
        practicesRepositoryProvider.overrideWithValue(practices),
        practiceTreeProvider.overrideWith((ref) async => _tree),
        subscriptionRepositoryProvider.overrideWithValue(billing),
        checkoutPollIntervalProvider.overrideWithValue(Duration.zero),
        subscriptionPollIntervalProvider.overrideWithValue(Duration.zero),
        checkoutLauncherProvider.overrideWithValue((url) async {
          launched.add(url);
          return true;
        }),
        if (translator != null)
          translatorProvider.overrideWithValue(translator),
      ],
    );
    await tester.pumpWidget(
      wrap(
        Directionality(
          textDirection: direction,
          child: Router.withConfig(config: router),
        ),
      ),
    );
    await tester.pumpAndSettle();
    return router;
  }

  Future<void> tearDownTree(WidgetTester tester) async {
    await tester.pumpWidget(const SizedBox.shrink());
    await tester.pump(Duration.zero);
  }

  Finder stage(String name) => find.byKey(ValueKey('attorney-setup-$name'));

  testWidgets(
      'fresh attorney: licence → practices → 7 days free → tour → feed, each stage once',
      (tester) async {
    final router = await pumpFlow(tester);

    // 1. Licence.
    expect(stage('license'), findsOneWidget);
    await tester.tap(find.text('Confirm license'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Submit licence'));
    await tester.pumpAndSettle();

    // 2. Practices — in place, no pushed screen; Save moves on by itself.
    expect(stage('license'), findsNothing);
    expect(stage('practices'), findsOneWidget);
    expect(find.byType(PracticesEditor), findsOneWidget);
    await tester.tap(find.byKey(const ValueKey('category-cat-1')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey('leaf-leaf-1')));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Save and continue'));
    await tester.pumpAndSettle();
    expect(practices.calls, ['replace:leaf-1']);

    // 3. Subscription offer: 7 days free, card at the start, or Later.
    expect(stage('practices'), findsNothing);
    expect(stage('subscription'), findsOneWidget);
    expect(find.text('7 days free'), findsOneWidget);
    expect(find.byKey(const ValueKey('offer-later')), findsOneWidget);
    billing.onComplete = () => makeOverview(subscription: makeInfo());
    await tester.tap(find.text('Start 7 days free'));
    await tester.pumpAndSettle();
    expect(billing.calls, contains('checkout:monthly:0:'));
    expect(launched, hasLength(1));

    // 4. Trial active → tour (the step saved on the server).
    expect(onboarding.calls, contains('saveStep:tour'));
    expect(_location(router), OnboardingRoutes.forStep(OnboardingStepId.tour));
    expect(find.byType(TourStepScreen), findsOneWidget);

    // 5. Tour → feed.
    await tester.tap(find.text('Skip'));
    await tester.pumpAndSettle();
    expect(onboarding.calls, contains('complete'));
    expect(_location(router), AppRoutes.feed);
    await tearDownTree(tester);
  });

  testWidgets('"Later" skips the subscription and goes on to the tour',
      (tester) async {
    server
      ..verification = VerificationStatus.verified
      ..practiceIds = ['leaf-1'];
    final router = await pumpFlow(tester);
    expect(stage('subscription'), findsOneWidget);
    await tester.tap(find.byKey(const ValueKey('offer-later')));
    await tester.pumpAndSettle();
    expect(billing.calls.where((c) => c.startsWith('checkout')), isEmpty);
    expect(_location(router), OnboardingRoutes.forStep(OnboardingStepId.tour));
    await tearDownTree(tester);
  });

  testWidgets(
      'Back never loops: from the tour the attorney sees the stage the server requires, never practices again',
      (tester) async {
    server
      ..verification = VerificationStatus.verified
      ..practiceIds = ['leaf-1'];
    final router = await pumpFlow(tester);
    await tester.tap(find.byKey(const ValueKey('offer-later')));
    await tester.pumpAndSettle();
    expect(find.byType(TourStepScreen), findsOneWidget);

    final back = find.byType(AppBackButton);
    expect(back, findsOneWidget);
    await tester.tap(back);
    await tester.pumpAndSettle();
    expect(
      _location(router),
      OnboardingRoutes.forStep(OnboardingStepId.verification),
    );
    // Owner 2026-10-05 (audit): "Later" is remembered — no offer again.
    expect(stage('done'), findsOneWidget);
    expect(stage('subscription'), findsNothing);
    expect(stage('practices'), findsNothing);
    expect(stage('license'), findsNothing);

    // Back again: the previous onboarding step, not this one.
    await tester.tap(find.byType(AppBackButton));
    await tester.pumpAndSettle();
    expect(_location(router), OnboardingRoutes.forStep(OnboardingStepId.push));
    await tearDownTree(tester);
  });

  testWidgets('already subscribed: a summary with Continue, no offer',
      (tester) async {
    server
      ..verification = VerificationStatus.verified
      ..practiceIds = ['leaf-1'];
    billing.current = makeOverview(subscription: makeInfo());
    await pumpFlow(tester);
    expect(stage('done'), findsOneWidget);
    expect(find.text('7 days free'), findsNothing);
    await tester.tap(find.text('Continue'));
    await tester.pumpAndSettle();
    expect(find.byType(TourStepScreen), findsOneWidget);
    await tearDownTree(tester);
  });

  test('attorneySetupStage: licence, then practices, then subscription', () {
    expect(
      attorneySetupStage(verification: VerificationView.start),
      AttorneySetupStage.license,
    );
    expect(
      attorneySetupStage(verification: VerificationView.draft),
      AttorneySetupStage.license,
    );
    expect(
      attorneySetupStage(verification: VerificationView.pending),
      AttorneySetupStage.licensePending,
    );
    expect(
      attorneySetupStage(
        verification: VerificationView.verified,
        hasPractices: false,
      ),
      AttorneySetupStage.practices,
    );
    expect(
      attorneySetupStage(
        verification: VerificationView.verified,
        hasPractices: true,
        subscriptionActive: false,
      ),
      AttorneySetupStage.subscription,
    );
    expect(
      attorneySetupStage(
        verification: VerificationView.verified,
        hasPractices: true,
        subscriptionActive: true,
      ),
      AttorneySetupStage.done,
    );
  });

  // PR #37 follow-up: every stage on a 360 dp phone with the longest
  // translation of each key (all shipped languages), also right-to-left.
  for (final (name, direction) in [
    ('longest', TextDirection.ltr),
    ('longest, right-to-left', TextDirection.rtl),
  ]) {
    testWidgets('no overflow at 360 dp on every stage ($name)', (tester) async {
      final t = LongestTranslator();
      await pumpFlow(tester, translator: t, direction: direction);
      expect(stage('license'), findsOneWidget);
      expect(tester.takeException(), isNull);
      server.verification = VerificationStatus.suspended;
      await tearDownTree(tester);
      await pumpFlow(tester, translator: t, direction: direction);
      expect(stage('pending'), findsOneWidget);
      expect(tester.takeException(), isNull);
      server.verification = VerificationStatus.verified;
      await tearDownTree(tester);
      await pumpFlow(tester, translator: t, direction: direction);
      expect(stage('practices'), findsOneWidget);
      expect(tester.takeException(), isNull);
      server.practiceIds = ['leaf-1'];
      await tearDownTree(tester);
      await pumpFlow(tester, translator: t, direction: direction);
      expect(stage('subscription'), findsOneWidget);
      expect(tester.takeException(), isNull);
      await tester.tap(find.byKey(const ValueKey('offer-later')));
      await tester.pumpAndSettle();
      expect(find.byType(TourStepScreen), findsOneWidget);
      expect(tester.takeException(), isNull);
      await tearDownTree(tester);
    });
  }
}
