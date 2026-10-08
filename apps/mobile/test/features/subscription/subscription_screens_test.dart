import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/misc.dart' show Override;
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/app_language.dart';
import 'package:lawbid/core/l10n/l10n_formats.dart';
import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid/features/cases/presentation/widgets/async_views.dart';
import 'package:lawbid/features/cases/presentation/widgets/case_status.dart';
import 'package:lawbid/features/subscription/application/subscription_providers.dart';
import 'package:lawbid/features/subscription/domain/subscription_models.dart';
import 'package:lawbid/features/subscription/presentation/payments_screen.dart';
import 'package:lawbid/features/subscription/presentation/paywall_screen.dart';
import 'package:lawbid/features/subscription/presentation/plan_picker.dart';
import 'package:lawbid/features/subscription/presentation/subscription_screen.dart';
import 'package:lawbid/features/team/application/team_providers.dart';
import 'package:lawbid/shared/domain/cursor_page.dart';

import '../../helpers/ux_harness.dart';
import '../team/team_fakes.dart';
import 'subscription_fakes.dart';

/// docs/06 §1.7 screens: "Подписка" in its states, the paywall per gate,
/// the payment history.
void main() {
  late FakeSubscriptionRepository repo;
  late FakeTeamRepository team;
  late FakeCardCollector collector;
  late List<Uri> launched;
  var launchResult = true;
  setUpAll(initializeDateFormatting);

  List<Override> overrides() => uxOverrides(
        extra: [
          subscriptionRepositoryProvider.overrideWithValue(repo),
          teamRepositoryProvider.overrideWithValue(team),
          seatLimitRepositoryProvider
              .overrideWithValue(FakeSeatLimitRepository()),
          cardCollectorProvider.overrideWithValue(collector),
          subscriptionPollIntervalProvider.overrideWithValue(Duration.zero),
          checkoutPollIntervalProvider.overrideWithValue(Duration.zero),
          checkoutLauncherProvider.overrideWithValue((url) async {
            launched.add(url);
            return launchResult;
          }),
        ],
      );

  Future<void> pump(
    WidgetTester tester,
    Widget child, {
    ThemeData? theme,
    double textScale = 1,
  }) async {
    // A tall screen: plan cards and the billing card are built at once.
    tester.view.physicalSize = const Size(1000, 3200);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    await tester.pumpWidget(
      uxApp(
        child,
        size: const Size(1000, 3200),
        theme: theme ?? AppTheme.light(),
        disableAnimations: true,
        overrides: overrides(),
        textScale: textScale,
      ),
    );
    await tester.pump();
    await tester.pump();
  }

  setUp(() {
    repo = FakeSubscriptionRepository(makeOverview());
    team = FakeTeamRepository();
    collector = FakeCardCollector();
    launched = [];
    launchResult = true;
  });

  group('SubscriptionScreen states', () {
    testWidgets('loading: skeleton, then the two plans (monthly first)',
        (tester) async {
      repo.hold = Completer<void>();
      await pump(tester, const SubscriptionScreen());
      expect(find.byType(DetailSkeleton), findsOneWidget);
      repo.hold!.complete();
      await tester.pump();
      await tester.pump();
      expect(find.byType(PlanPicker), findsOneWidget);
      final monthly =
          tester.getTopLeft(find.byKey(const ValueKey('plan-monthly')));
      final yearly =
          tester.getTopLeft(find.byKey(const ValueKey('plan-yearly')));
      expect(monthly.dy, lessThan(yearly.dy), reason: 'yearly below monthly');
      expect(find.textContaining(r'$399'), findsWidgets);
      expect(find.textContaining(r'$9,590'), findsWidgets);
      // The chosen plan is marked at the top right.
      expect(find.text('Selected'), findsOneWidget);
    });

    testWidgets('offline: offline state with Retry that reloads',
        (tester) async {
      repo.overviewError = const ApiException(
        code: ApiException.networkErrorCode,
        message: 'offline',
      );
      await pump(tester, const SubscriptionScreen());
      expect(find.byType(AppOfflineState), findsOneWidget);
      repo.overviewError = null;
      await tester.tap(find.text('Retry'));
      await tester.pump();
      await tester.pump();
      expect(find.byType(PlanPicker), findsOneWidget);
    });

    testWidgets('not verified yet: CTA disabled with the explanation',
        (tester) async {
      repo.current = makeOverview(canStart: false);
      await pump(tester, const SubscriptionScreen());
      final cta =
          tester.widget<AppButton>(find.byKey(const ValueKey('subscribe-cta')));
      expect(cta.isEnabled, isFalse);
      expect(cta.label, r'Start 7 days free · $399 per month');
      expect(find.byKey(const ValueKey('verify-first')), findsOneWidget);
      expect(find.text('Go to verification'), findsOneWidget);
      expect(find.byType(SubscriptionStatusCard), findsNothing);
    });

    testWidgets(
        'monthly + 2 assistants → Stripe page → trial → a code per assistant',
        (tester) async {
      repo.onComplete = () => makeOverview(
            subscription: makeInfo(assistantSeats: 2),
            trialEligible: false,
          );
      await pump(tester, const SubscriptionScreen());
      // "Add an assistant · +$100", then + for the second one.
      await tester.tap(find.byKey(const ValueKey('seats-add-first')));
      await tester.pump();
      await tester.tap(find.byKey(const ValueKey('seats-plus')));
      await tester.pump();
      expect(find.text('Assistants: 2'), findsOneWidget);
      expect(find.text(r'$599 per month'), findsOneWidget);
      // Owner 2026-10-04: no phones at checkout — codes come after it.
      expect(find.byKey(const ValueKey('plan-seat-codes')), findsOneWidget);
      await tester.ensureVisible(find.byKey(const ValueKey('subscribe-cta')));
      await tester.pump();
      await tester.tap(find.byKey(const ValueKey('subscribe-cta')));
      await tester.pump();
      await tester.pump();
      await tester.pump();
      expect(repo.calls, contains('checkout:monthly:2:'));
      expect(launched.single.host, 'checkout.stripe.com');
      expect(repo.calls, contains('complete:cs_1'));
      expect(find.text('Your trial has started'), findsOneWidget);
      expect(find.byKey(const ValueKey('subscription-status')), findsOneWidget);
      expect(find.byKey(const ValueKey('subscribe-cta')), findsNothing);
      expect(find.text('Assistants: 2'), findsOneWidget);

      // "Your assistants": add one → its one-time code shows at once.
      await tester.pump();
      expect(find.byKey(const ValueKey('assistant-seats')), findsOneWidget);
      await tester.ensureVisible(
        find.byKey(const ValueKey('seats-add-assistant')),
      );
      await tester.tap(find.byKey(const ValueKey('seats-add-assistant')));
      await tester.pumpAndSettle();
      await tester.enterText(
        find.byKey(const ValueKey('team-add-name')),
        'Sam',
      );
      await tester.tap(find.byKey(const ValueKey('team-add-save')));
      await tester.pumpAndSettle();
      expect(team.calls, contains('add:Sam'));
      expect(find.text('K7QM-4XRT-92H1'), findsWidgets);
      expect(find.byKey(const ValueKey('code-send-m1')), findsWidgets);
    });

    testWidgets('yearly: every seat, the year total', (tester) async {
      repo.onComplete = () => makeOverview(
            subscription: makeInfo(
              status: SubscriptionStatus.active,
              plan: SubscriptionPlan.yearly,
            ),
            trialEligible: false,
          );
      await pump(tester, const SubscriptionScreen());
      await tester.ensureVisible(find.byKey(const ValueKey('plan-yearly')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const ValueKey('plan-yearly')));
      await tester.pump();
      expect(find.text('All seats included'), findsOneWidget);
      expect(find.textContaining(r'$9,590'), findsWidgets);
      await tester.ensureVisible(find.byKey(const ValueKey('subscribe-cta')));
      await tester.pump();
      await tester.tap(find.byKey(const ValueKey('subscribe-cta')));
      await tester.pump();
      await tester.pump();
      await tester.pump();
      expect(repo.calls, contains('checkout:yearly:10:'));
      expect(find.text('Subscription active'), findsOneWidget);
      // "Active" sits on the Prime card, with the team inside it.
      expect(find.text('Active'), findsWidgets);
      expect(find.byKey(const ValueKey('team-row')), findsOneWidget);
    });

    testWidgets("the page can't open: a clear message", (tester) async {
      launchResult = false;
      await pump(tester, const SubscriptionScreen());
      await tester.ensureVisible(find.byKey(const ValueKey('subscribe-cta')));
      await tester.pump();
      await tester.tap(find.byKey(const ValueKey('subscribe-cta')));
      await tester.pump();
      await tester.pump();
      expect(find.text("Couldn't open the payment page"), findsOneWidget);
    });

    testWidgets('active monthly: add a seat inside the card and save',
        (tester) async {
      repo.current = makeOverview(
        subscription: makeInfo(
          status: SubscriptionStatus.active,
          assistantSeats: 2,
        ),
        trialEligible: false,
      );
      await pump(tester, const SubscriptionScreen());
      // On the monthly card (top right) and in the billing status.
      expect(find.byKey(const ValueKey('plan-status-Active')), findsOneWidget);
      await tester.tap(find.byKey(const ValueKey('seats-plus')).first);
      await tester.pump();
      final save = find.byKey(const ValueKey('seats-save'));
      expect(find.text(r'Save · $699 per month'), findsOneWidget);
      await tester.ensureVisible(save);
      await tester.pumpAndSettle();
      await tester.tap(save);
      await tester.pumpAndSettle();
      expect(repo.calls, contains('seats:3'));
      expect(find.text('Assistant seats: 3'), findsOneWidget);
      expect(find.byKey(const ValueKey('seats-save')), findsNothing);
    });

    testWidgets('active monthly: Prime card switches to yearly',
        (tester) async {
      repo.current = makeOverview(
        subscription: makeInfo(status: SubscriptionStatus.active),
        trialEligible: false,
      );
      await pump(tester, const SubscriptionScreen());
      final cta = find.byKey(const ValueKey('prime-switch'));
      await tester.scrollUntilVisible(
        cta,
        300,
        scrollable: find.byType(Scrollable).first,
      );
      await tester.ensureVisible(cta);
      await tester.pumpAndSettle();
      await tester.tap(cta);
      await tester.pumpAndSettle();
      await tester.tap(find.text('Switch to Prime').last);
      await tester.pumpAndSettle();
      expect(repo.calls, contains('yearly'));
      expect(find.byKey(const ValueKey('prime-switch')), findsNothing);
    });

    testWidgets('payment failed: notice with "Update card", no CTA',
        (tester) async {
      repo.current = makeOverview(
        subscription: makeInfo(
          status: SubscriptionStatus.pastDue,
          isActive: true,
          graceEndsAt: DateTime.now().add(const Duration(days: 2)),
        ),
        canStart: false,
      );
      await pump(tester, const SubscriptionScreen());
      expect(find.byKey(const ValueKey('payment-failed')), findsOneWidget);
      expect(
        find.text('Payment failed'),
        findsNWidgets(2),
        reason: 'notice title + status pill',
      );
      expect(
        find.byKey(const ValueKey('payment-failed-update-card')),
        findsOneWidget,
      );
      expect(
        find.textContaining('Update your card to keep it'),
        findsOneWidget,
      );
      expect(find.byKey(const ValueKey('subscribe-cta')), findsNothing);
    });

    testWidgets('active: cancel asks, then shows the scheduled cancellation',
        (tester) async {
      repo.current = makeOverview(
        subscription: makeInfo(status: SubscriptionStatus.active),
        trialEligible: false,
      );
      await pump(tester, const SubscriptionScreen());
      expect(find.textContaining(r'Next charge $399'), findsOneWidget);
      await tester.tap(find.byKey(const ValueKey('subscription-cancel')));
      await tester.pump();
      expect(find.text('Cancel subscription?'), findsOneWidget);
      await tester.tap(find.text('Cancel subscription'));
      await tester.pump();
      await tester.pump();
      expect(repo.calls, contains('cancel'));
      expect(find.textContaining('Cancellation scheduled'), findsOneWidget);
      expect(find.byKey(const ValueKey('subscription-cancel')), findsNothing);
      expect(find.byKey(const ValueKey('subscription-manage')), findsOneWidget);
    });

    testWidgets('a scheduled cancel can be taken back in the app',
        (tester) async {
      repo.current = makeOverview(
        subscription: makeInfo(
          status: SubscriptionStatus.active,
          cancelAtPeriodEnd: true,
        ),
        trialEligible: false,
      );
      await pump(tester, const SubscriptionScreen());
      await tester.ensureVisible(
        find.byKey(const ValueKey('subscription-resume')),
      );
      await tester.tap(find.byKey(const ValueKey('subscription-resume')));
      await tester.pump();
      await tester.pump();
      expect(repo.calls, contains('resume'));
      expect(find.byKey(const ValueKey('subscription-resume')), findsNothing);
      expect(find.byKey(const ValueKey('subscription-cancel')), findsOneWidget);
    });

    testWidgets('ended subscription: "Subscribe again" without the trial line',
        (tester) async {
      repo.current = makeOverview(
        subscription: makeInfo(
          status: SubscriptionStatus.expired,
          isActive: false,
          trialEndsAt: day,
        ),
        trialEligible: false,
      );
      await pump(tester, const SubscriptionScreen());
      expect(find.byType(PlanPicker), findsOneWidget);
      expect(find.text('Expired'), findsOneWidget);
      expect(
        find.textContaining('Pay on the secure Stripe page'),
        findsOneWidget,
      );
      expect(find.textContaining('7 days free'), findsNothing);
    });

    // Owner 2026-10-07: a checkout left without paying must never hide
    // the plans — the hint stays, the subscribe button too.
    testWidgets('incomplete: hint + Refresh, CTA still there', (tester) async {
      repo.current = makeOverview(
        subscription:
            makeInfo(status: SubscriptionStatus.incomplete, isActive: false),
      );
      await pump(tester, const SubscriptionScreen());
      expect(
        find.byKey(const ValueKey('subscription-refresh')),
        findsOneWidget,
      );
      expect(find.textContaining('under a minute'), findsOneWidget);
      expect(find.byType(PlanPicker), findsOneWidget);
    });

    testWidgets('dark theme and 200% text: no overflow', (tester) async {
      repo.current = makeOverview(
        subscription: makeInfo(status: SubscriptionStatus.active),
        trialEligible: false,
      );
      await pump(
        tester,
        const SubscriptionScreen(),
        theme: AppTheme.dark(),
        textScale: 2,
      );
      expect(tester.takeException(), isNull);
      expect(find.byType(ActivePlans), findsOneWidget);
    });

    testWidgets('plan picker: dark theme and 200% text, no overflow',
        (tester) async {
      await pump(
        tester,
        const SubscriptionScreen(),
        theme: AppTheme.dark(),
        textScale: 2,
      );
      expect(tester.takeException(), isNull);
      expect(find.byType(PlanPicker), findsOneWidget);
    });
  });

  group('subscriptionPrice', () {
    test('whole dollars without cents, exact amount otherwise', () {
      final formats = L10nFormats(AppLanguage.en);
      expect(subscriptionPrice(formats, 39900), r'$399');
      expect(subscriptionPrice(formats, 39950), r'$399.50');
      expect(subscriptionPrice(formats, 5), r'$0.05');
    });
  });

  group('PaywallScreen', () {
    testWidgets('names the gate and offers the 7-day trial, or Later',
        (tester) async {
      await pump(tester, const PaywallScreen(reason: PaywallReason.contacts));
      expect(
        find.text('Client contacts come with a subscription'),
        findsOneWidget,
      );
      expect(find.text('7 days free'), findsOneWidget);
      final cta =
          tester.widget<AppButton>(find.byKey(const ValueKey('paywall-cta')));
      expect(cta.label, 'Start 7 days free');
      expect(find.byKey(const ValueKey('paywall-later')), findsOneWidget);
      expect(find.textContaining(r'$399'), findsWidgets);
    });

    testWidgets(
        '"Start 7 days free" opens the Stripe page for the monthly '
        'plan', (tester) async {
      repo.onComplete = () => makeOverview(subscription: makeInfo());
      await pump(tester, const PaywallScreen(reason: PaywallReason.bid));
      await tester.tap(find.byKey(const ValueKey('paywall-cta')));
      await tester.pump();
      await tester.pump();
      await tester.pump();
      expect(repo.calls, contains('checkout:monthly:0:'));
      expect(launched.single.host, 'checkout.stripe.com');
    });

    testWidgets('trial used: "Subscribe" instead of the trial', (tester) async {
      repo.current = makeOverview(trialEligible: false);
      await pump(tester, const PaywallScreen(reason: PaywallReason.bid));
      expect(find.text('Subscribe to continue'), findsOneWidget);
      final cta =
          tester.widget<AppButton>(find.byKey(const ValueKey('paywall-cta')));
      expect(cta.label, 'Subscribe');
    });

    test('reason parsing is lenient', () {
      expect(PaywallReason.parse('bid'), PaywallReason.bid);
      expect(PaywallReason.parse('chat'), PaywallReason.chat);
      expect(PaywallReason.parse(null), PaywallReason.generic);
      expect(PaywallReason.parse('???'), PaywallReason.generic);
    });
  });

  group('PaymentsScreen', () {
    testWidgets('empty state', (tester) async {
      await pump(tester, const PaymentsScreen());
      expect(find.text('No payments yet'), findsOneWidget);
    });

    testWidgets('rows: amount, status, failure code', (tester) async {
      repo.paymentPages.add(
        CursorPage(
          items: [
            makePayment('p1'),
            makePayment(
              'p2',
              status: PaymentStatus.failed,
              failureCode: 'card_declined',
            ),
          ],
        ),
      );
      await pump(tester, const PaymentsScreen());
      expect(find.byType(PaymentCard), findsNWidgets(2));
      expect(find.text(r'$399.00'), findsNWidgets(2));
      expect(find.text('Paid'), findsOneWidget);
      expect(find.text('Failed'), findsOneWidget);
      expect(find.text('Error code: card_declined'), findsOneWidget);
      expect(find.byType(StatusPill), findsNWidgets(2));
    });
  });
}
