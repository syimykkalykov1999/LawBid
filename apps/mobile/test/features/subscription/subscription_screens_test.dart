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
import 'package:lawbid/shared/domain/cursor_page.dart';

import '../../helpers/ux_harness.dart';
import 'subscription_fakes.dart';

/// docs/06 §1.7 screens: "Подписка" in its states, the paywall per gate,
/// the payment history.
void main() {
  late FakeSubscriptionRepository repo;
  late FakeCardCollector collector;
  late List<Uri> launched;
  var launchResult = true;
  setUpAll(initializeDateFormatting);

  List<Override> overrides() => uxOverrides(extra: [
        subscriptionRepositoryProvider.overrideWithValue(repo),
        cardCollectorProvider.overrideWithValue(collector),
        subscriptionPollIntervalProvider.overrideWithValue(Duration.zero),
        checkoutPollIntervalProvider.overrideWithValue(Duration.zero),
        checkoutLauncherProvider.overrideWithValue((url) async {
          launched.add(url);
          return launchResult;
        }),
      ]);

  Future<void> pump(
    WidgetTester tester,
    Widget child, {
    ThemeData? theme,
    double textScale = 1,
  }) async {
    await tester.pumpWidget(uxApp(
      child,
      theme: theme ?? AppTheme.light(),
      disableAnimations: true,
      overrides: overrides(),
      textScale: textScale,
    ));
    await tester.pump();
    await tester.pump();
  }

  setUp(() {
    repo = FakeSubscriptionRepository(makeOverview());
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
      expect(find.text('\$399 per month'), findsWidgets);
      expect(find.text('\$9,590 per year'), findsOneWidget);
    });

    testWidgets('offline: offline state with Retry that reloads',
        (tester) async {
      repo.overviewError = const ApiException(
          code: ApiException.networkErrorCode, message: 'offline');
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
      expect(cta.label, 'Start 7 days free');
      expect(find.byKey(const ValueKey('verify-first')), findsOneWidget);
      expect(find.text('Go to verification'), findsOneWidget);
      expect(find.byType(SubscriptionStatusCard), findsNothing);
    });

    testWidgets('monthly + 2 assistants + a phone → Stripe page → trial',
        (tester) async {
      repo.onComplete = () => makeOverview(
            subscription: makeInfo(assistantSeats: 2),
            trialEligible: false,
          );
      await pump(tester, const SubscriptionScreen());
      await tester.tap(find.byKey(const ValueKey('seats-plus')));
      await tester.pump();
      await tester.tap(find.byKey(const ValueKey('seats-plus')));
      await tester.pump();
      expect(find.text('\$599 per month'), findsOneWidget);
      await tester.ensureVisible(find.byKey(const ValueKey('plan-phone-add')));
      await tester.tap(find.byKey(const ValueKey('plan-phone-add')));
      await tester.pump();
      await tester.enterText(
          find.byKey(const ValueKey('plan-phone-0')), '+13125550111');
      await tester.ensureVisible(find.byKey(const ValueKey('subscribe-cta')));
      await tester.pump();
      await tester.tap(find.byKey(const ValueKey('subscribe-cta')));
      await tester.pump();
      await tester.pump();
      await tester.pump();
      expect(repo.calls, contains('checkout:monthly:2:+13125550111'));
      expect(launched.single.host, 'checkout.stripe.com');
      expect(repo.calls, contains('complete:cs_1'));
      expect(find.text('Your trial has started'), findsOneWidget);
      expect(find.byKey(const ValueKey('subscription-status')), findsOneWidget);
      expect(find.byKey(const ValueKey('subscribe-cta')), findsNothing);
      await tester.scrollUntilVisible(
        find.text('Monthly · assistants: 2'),
        300,
        scrollable: find.byType(Scrollable).first,
      );
      expect(find.text('Monthly · assistants: 2'), findsOneWidget);
    });

    testWidgets('yearly: all six seats, the year total', (tester) async {
      repo.onComplete = () => makeOverview(
            subscription: makeInfo(
              status: SubscriptionStatus.active,
              plan: SubscriptionPlan.yearly,
            ),
            trialEligible: false,
          );
      await pump(tester, const SubscriptionScreen());
      await tester.tap(find.byKey(const ValueKey('plan-yearly')));
      await tester.pump();
      expect(find.text('All 6 seats included'), findsOneWidget);
      expect(find.text('\$9,590 per year'), findsWidgets);
      await tester.ensureVisible(find.byKey(const ValueKey('subscribe-cta')));
      await tester.pump();
      await tester.tap(find.byKey(const ValueKey('subscribe-cta')));
      await tester.pump();
      await tester.pump();
      await tester.pump();
      expect(repo.calls, contains('checkout:yearly:6:'));
      expect(find.text('Subscription active'), findsOneWidget);
      await tester.scrollUntilVisible(
        find.text('Yearly · 6 assistants'),
        300,
        scrollable: find.byType(Scrollable).first,
      );
      expect(find.text('Yearly · 6 assistants'), findsOneWidget);
    });

    testWidgets('a bad phone is flagged, nothing is sent', (tester) async {
      await pump(tester, const SubscriptionScreen());
      await tester.tap(find.byKey(const ValueKey('seats-plus')));
      await tester.pump();
      await tester.ensureVisible(find.byKey(const ValueKey('plan-phone-add')));
      await tester.tap(find.byKey(const ValueKey('plan-phone-add')));
      await tester.pump();
      await tester.enterText(find.byKey(const ValueKey('plan-phone-0')), '123');
      await tester.ensureVisible(find.byKey(const ValueKey('subscribe-cta')));
      await tester.pump();
      await tester.tap(find.byKey(const ValueKey('subscribe-cta')));
      await tester.pump();
      expect(find.text('Phone like +13125550123'), findsOneWidget);
      expect(repo.calls.where((c) => c.startsWith('checkout')), isEmpty);
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

    testWidgets('active monthly: change seats from the plan row',
        (tester) async {
      repo.current = makeOverview(
        subscription: makeInfo(
          status: SubscriptionStatus.active,
          assistantSeats: 2,
        ),
        trialEligible: false,
      );
      await pump(tester, const SubscriptionScreen());
      await tester.scrollUntilVisible(
        find.byKey(const ValueKey('current-plan')),
        300,
        scrollable: find.byType(Scrollable).first,
      );
      await tester.tap(find.byKey(const ValueKey('current-plan')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const ValueKey('seats-plus')).last);
      await tester.pump();
      await tester.tap(find.byKey(const ValueKey('seats-save')));
      await tester.pumpAndSettle();
      expect(repo.calls, contains('seats:3'));
      expect(find.text('Assistant seats: 3'), findsOneWidget);
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
      expect(find.text('Payment failed'), findsNWidgets(2),
          reason: 'notice title + status pill');
      expect(find.byKey(const ValueKey('payment-failed-update-card')),
          findsOneWidget);
      expect(
          find.textContaining('Update your card to keep it'), findsOneWidget);
      expect(find.byKey(const ValueKey('subscribe-cta')), findsNothing);
    });

    testWidgets('active: cancel asks, then shows the scheduled cancellation',
        (tester) async {
      repo.current = makeOverview(
          subscription: makeInfo(status: SubscriptionStatus.active),
          trialEligible: false);
      await pump(tester, const SubscriptionScreen());
      expect(find.textContaining('Next charge \$399'), findsOneWidget);
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

    testWidgets('ended subscription: "Subscribe again" without the trial line',
        (tester) async {
      repo.current = makeOverview(
          subscription: makeInfo(
              status: SubscriptionStatus.expired,
              isActive: false,
              trialEndsAt: day),
          trialEligible: false);
      await pump(tester, const SubscriptionScreen());
      expect(find.byType(PlanPicker), findsOneWidget);
      expect(find.text('Expired'), findsOneWidget);
      expect(find.text('Pay on the secure Stripe page'), findsOneWidget);
      expect(find.textContaining('7 days free'), findsNothing);
    });

    testWidgets('incomplete: hint + Refresh, no CTA', (tester) async {
      repo.current = makeOverview(
          subscription:
              makeInfo(status: SubscriptionStatus.incomplete, isActive: false),
          canStart: false);
      await pump(tester, const SubscriptionScreen());
      expect(
          find.byKey(const ValueKey('subscription-refresh')), findsOneWidget);
      expect(find.textContaining('under a minute'), findsOneWidget);
      expect(find.byKey(const ValueKey('subscribe-cta')), findsNothing);
    });

    testWidgets('dark theme and 200% text: no overflow', (tester) async {
      repo.current = makeOverview(
          subscription: makeInfo(status: SubscriptionStatus.active),
          trialEligible: false);
      await pump(tester, const SubscriptionScreen(),
          theme: AppTheme.dark(), textScale: 2);
      expect(tester.takeException(), isNull);
      expect(find.byType(PlanCard), findsOneWidget);
    });

    testWidgets('plan picker: dark theme and 200% text, no overflow',
        (tester) async {
      await pump(tester, const SubscriptionScreen(),
          theme: AppTheme.dark(), textScale: 2);
      expect(tester.takeException(), isNull);
      expect(find.byType(PlanPicker), findsOneWidget);
    });
  });

  group('subscriptionPrice', () {
    test('whole dollars without cents, exact amount otherwise', () {
      final formats = L10nFormats(AppLanguage.en);
      expect(subscriptionPrice(formats, 39900), '\$399');
      expect(subscriptionPrice(formats, 39950), '\$399.50');
      expect(subscriptionPrice(formats, 5), '\$0.05');
    });
  });

  group('PaywallScreen', () {
    testWidgets('names the gate and leads to the subscription', (tester) async {
      await pump(tester, const PaywallScreen(reason: PaywallReason.contacts));
      expect(find.text('Client contacts come with a subscription'),
          findsOneWidget);
      expect(find.byKey(const ValueKey('paywall-cta')), findsOneWidget);
      expect(find.text('7 days free for verified attorneys.'), findsOneWidget);
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
      repo.paymentPages.add(CursorPage(items: [
        makePayment('p1'),
        makePayment('p2',
            status: PaymentStatus.failed, failureCode: 'card_declined'),
      ]));
      await pump(tester, const PaymentsScreen());
      expect(find.byType(PaymentCard), findsNWidgets(2));
      expect(find.text('\$399.00'), findsNWidgets(2));
      expect(find.text('Paid'), findsOneWidget);
      expect(find.text('Failed'), findsOneWidget);
      expect(find.text('Error code: card_declined'), findsOneWidget);
      expect(find.byType(StatusPill), findsNWidgets(2));
    });
  });
}
