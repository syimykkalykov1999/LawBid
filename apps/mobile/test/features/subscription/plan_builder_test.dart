import 'package:flutter/material.dart';
import 'package:flutter_riverpod/misc.dart' show Override;
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/features/plans/domain/plan_models.dart';
import 'package:lawbid/features/subscription/application/subscription_providers.dart';
import 'package:lawbid/features/subscription/domain/subscription_models.dart';
import 'package:lawbid/features/subscription/presentation/subscription_screen.dart';
import 'package:lawbid/features/team/application/team_providers.dart';

import '../../helpers/ux_harness.dart';
import '../team/team_fakes.dart';
import 'subscription_fakes.dart';

/// Owner 2026-10-05 (plan builder): the picker renders the server's
/// plans, the checkout carries the plan code and the EXTRA seats, and the
/// subscription screen shows the current plan with its seat summary.
void main() {
  late FakeSubscriptionRepository repo;
  late FakeCardCollector collector;
  late List<Uri> launched;
  setUpAll(initializeDateFormatting);

  List<Override> overrides() => uxOverrides(
        extra: [
          subscriptionRepositoryProvider.overrideWithValue(repo),
          teamRepositoryProvider.overrideWithValue(FakeTeamRepository()),
          seatLimitRepositoryProvider
              .overrideWithValue(FakeSeatLimitRepository()),
          cardCollectorProvider.overrideWithValue(collector),
          subscriptionPollIntervalProvider.overrideWithValue(Duration.zero),
          checkoutPollIntervalProvider.overrideWithValue(Duration.zero),
          checkoutLauncherProvider.overrideWithValue((url) async {
            launched.add(url);
            return true;
          }),
        ],
      );

  Future<void> pump(WidgetTester tester, Widget child) async {
    tester.view.physicalSize = const Size(1000, 3600);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    await tester.pumpWidget(
      uxApp(
        child,
        size: const Size(1000, 3600),
        theme: AppTheme.light(),
        disableAnimations: true,
        overrides: overrides(),
      ),
    );
    await tester.pump();
    await tester.pump();
  }

  setUp(() {
    repo = FakeSubscriptionRepository(
      makeOverview(plans: const [soloPlan, teamPlan]),
    );
    collector = FakeCardCollector();
    launched = [];
  });

  group('LocalizedText', () {
    test('picks the app language and falls back to English', () {
      const t = LocalizedText(en: 'Team', ru: 'Команда');
      expect(t.resolve('ru'), 'Команда');
      expect(t.resolve('en'), 'Team');
      expect(t.resolve('es'), 'Team');
      expect(const LocalizedText(ru: 'Соло').resolve('en'), 'Соло');
    });
  });

  group('PlanPicker with server plans', () {
    // Owner 2026-10-07 (phone test): back from Stripe without paying — no
    // «Без подписки» baseline card, and the plans keep their pay button.
    testWidgets('unpaid checkout: no baseline card, picker stays',
        (tester) async {
      repo = FakeSubscriptionRepository(
        makeOverview(
          subscription:
              makeInfo(status: SubscriptionStatus.incomplete, isActive: false),
          plans: const [soloPlan, teamPlan],
          plan: baselinePlan,
        ),
      );
      await pump(tester, const SubscriptionScreen());
      expect(find.byKey(const ValueKey('plan-attorney_free')), findsNothing);
      expect(find.byKey(const ValueKey('plan-solo')), findsOneWidget);
      expect(find.byKey(const ValueKey('subscribe-cta')), findsOneWidget);
    });

    testWidgets('cards from the server, default plan selected, features',
        (tester) async {
      await pump(tester, const SubscriptionScreen());
      expect(find.byKey(const ValueKey('plan-solo')), findsOneWidget);
      expect(find.byKey(const ValueKey('plan-team')), findsOneWidget);
      expect(find.byKey(const ValueKey('plan-monthly')), findsNothing);
      expect(find.text('Solo'), findsOneWidget);
      expect(find.text('Team'), findsOneWidget);
      expect(find.text('Selected'), findsOneWidget);
      expect(find.text('Best for firms'), findsOneWidget);
      expect(find.text('Assistants included: 2'), findsOneWidget);
      expect(find.text(r'Extra assistant: $100/mo'), findsOneWidget);
      expect(find.text('Active offers: up to 10'), findsOneWidget);
      expect(find.text('Unlimited active offers'), findsOneWidget);
      expect(find.text('Higher in search'), findsOneWidget);
      expect(find.text('Chat translation'), findsOneWidget);
      expect(find.text('In-app calls'), findsNWidgets(2));
      expect(find.text('7-day free trial'), findsOneWidget);
      expect(find.text('14-day free trial'), findsOneWidget);
      // Solo (default) is chosen: no seat stepper, 7 days in the CTA.
      expect(find.byKey(const ValueKey('seats-add-first')), findsNothing);
      final cta =
          tester.widget<AppButton>(find.byKey(const ValueKey('subscribe-cta')));
      expect(cta.label, r'Start 7 days free · $299 per month');
    });

    testWidgets('Team + 1 extra seat → checkout with planCode and extra seats',
        (tester) async {
      repo.onComplete = () => makeOverview(
            subscription: makeInfo(assistantSeats: 1),
            plans: const [soloPlan, teamPlan],
            plan: teamPlan,
            seats: const SeatSummary(included: 2, extra: 1, total: 3, max: 5),
            trialEligible: false,
          );
      await pump(tester, const SubscriptionScreen());
      await tester.tap(find.byKey(const ValueKey('plan-team')));
      await tester.pump();
      await tester.tap(find.byKey(const ValueKey('seats-add-first')));
      await tester.pump();
      expect(find.text(r'$699 per month'), findsOneWidget);
      final cta =
          tester.widget<AppButton>(find.byKey(const ValueKey('subscribe-cta')));
      expect(cta.label, r'Start 14 days free · $699 per month');
      await tester.ensureVisible(find.byKey(const ValueKey('subscribe-cta')));
      await tester.pump();
      await tester.tap(find.byKey(const ValueKey('subscribe-cta')));
      await tester.pump();
      await tester.pump();
      await tester.pump();
      expect(repo.calls, contains('checkout:monthly:1::team'));
      expect(launched.single.host, 'checkout.stripe.com');
      // Back: "Your plan" on the Team card, the seat summary in the card.
      expect(find.text('Your plan'), findsWidgets);
      expect(find.byKey(const ValueKey('current-plan')), findsOneWidget);
      expect(
        find.text('Assistants: 3 · 2 included, 1 extra'),
        findsOneWidget,
      );
    });

    testWidgets('no plans from the server: the legacy tiers', (tester) async {
      repo.current = makeOverview();
      await pump(tester, const SubscriptionScreen());
      expect(find.byKey(const ValueKey('plan-monthly')), findsOneWidget);
      expect(find.byKey(const ValueKey('plan-yearly')), findsOneWidget);
    });

    testWidgets('active on a plan: Your plan, extra seats saved',
        (tester) async {
      repo.current = makeOverview(
        subscription: makeInfo(
          status: SubscriptionStatus.active,
          assistantSeats: 1,
        ),
        plans: const [soloPlan, teamPlan],
        plan: teamPlan,
        seats: const SeatSummary(included: 2, extra: 1, total: 3, max: 5),
        trialEligible: false,
      );
      await pump(tester, const SubscriptionScreen());
      expect(
        find.byKey(const ValueKey('plan-status-Your plan')),
        findsOneWidget,
      );
      expect(find.byKey(const ValueKey('team-row')), findsOneWidget);
      await tester.tap(find.byKey(const ValueKey('seats-plus')));
      await tester.pump();
      final save = find.byKey(const ValueKey('seats-save'));
      expect(find.text(r'Save · $799 per month'), findsOneWidget);
      await tester.ensureVisible(save);
      await tester.pump();
      await tester.tap(save);
      await tester.pump();
      expect(repo.calls, contains('seats:2'));
    });
  });
}
