import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/misc.dart' show Override;
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid/features/cases/presentation/widgets/async_views.dart';
import 'package:lawbid/features/cases/presentation/widgets/case_status.dart';
import 'package:lawbid/features/subscription/application/subscription_providers.dart';
import 'package:lawbid/features/subscription/data/card_collector.dart';
import 'package:lawbid/features/subscription/domain/subscription_models.dart';
import 'package:lawbid/features/subscription/presentation/payments_screen.dart';
import 'package:lawbid/features/subscription/presentation/paywall_screen.dart';
import 'package:lawbid/features/subscription/presentation/subscription_screen.dart';
import 'package:lawbid/shared/domain/cursor_page.dart';

import '../../helpers/ux_harness.dart';
import 'subscription_fakes.dart';

/// docs/06 §1.7 screens: "Подписка" in its states, the paywall per gate,
/// the payment history.
void main() {
  late FakeSubscriptionRepository repo;
  late FakeCardCollector collector;
  setUpAll(initializeDateFormatting);

  List<Override> overrides() => uxOverrides(extra: [
        subscriptionRepositoryProvider.overrideWithValue(repo),
        cardCollectorProvider.overrideWithValue(collector),
        subscriptionPollIntervalProvider.overrideWithValue(Duration.zero),
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
  });

  group('SubscriptionScreen states', () {
    testWidgets('loading: skeleton, then the plan card', (tester) async {
      repo.hold = Completer<void>();
      await pump(tester, const SubscriptionScreen());
      expect(find.byType(DetailSkeleton), findsOneWidget);
      expect(find.byType(CircularProgressIndicator), findsNothing);
      repo.hold!.complete();
      await tester.pump();
      await tester.pump();
      expect(find.byType(PlanCard), findsOneWidget);
      expect(find.byKey(const ValueKey('plan-price')), findsOneWidget);
      expect(find.text('\$399'), findsOneWidget);
      expect(find.text('7 days free, then \$399 per month. Cancel anytime.'),
          findsOneWidget);
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
      expect(find.byType(PlanCard), findsOneWidget);
    });

    testWidgets('not verified yet: CTA disabled with the explanation',
        (tester) async {
      repo.current = makeOverview(canStart: false);
      await pump(tester, const SubscriptionScreen());
      final cta =
          tester.widget<AppButton>(find.byKey(const ValueKey('subscribe-cta')));
      expect(cta.isEnabled, isFalse);
      expect(cta.label, 'Start free trial');
      expect(find.byKey(const ValueKey('verify-first')), findsOneWidget);
      expect(find.text('Go to verification'), findsOneWidget);
      expect(find.byType(SubscriptionStatusCard), findsNothing);
    });

    testWidgets('verified: tap → card sheet → trial started', (tester) async {
      repo.onConfirm = (_) => makeOverview(subscription: makeInfo());
      await pump(tester, const SubscriptionScreen());
      await tester.tap(find.byKey(const ValueKey('subscribe-cta')));
      await tester.pump();
      await tester.pump();
      expect(collector.requests, hasLength(1));
      expect(repo.calls, contains('confirm:seti_1:false'));
      expect(find.text('Your trial has started'), findsOneWidget);
      expect(find.byKey(const ValueKey('subscription-status')), findsOneWidget);
      expect(find.text('Trial'), findsOneWidget);
      expect(find.textContaining('Trial until'), findsOneWidget);
      // Active now: no CTA, Manage + Cancel available.
      expect(find.byKey(const ValueKey('subscribe-cta')), findsNothing);
      expect(find.byKey(const ValueKey('subscription-manage')), findsOneWidget);
      expect(find.byKey(const ValueKey('subscription-cancel')), findsOneWidget);
    });

    testWidgets('no trial available: honest dialog, charge only after consent',
        (tester) async {
      repo.current = makeOverview(trialEligible: false);
      repo.startResult = const SubscriptionStart(
        clientSecret: 's',
        setupIntentId: 'seti_1',
        customerId: 'cus_1',
        trialEligible: false,
        priceCents: 39900,
        trialDays: 7,
      );
      repo.onConfirm = (_) => makeOverview(
          subscription: makeInfo(status: SubscriptionStatus.active),
          trialEligible: false);
      await pump(tester, const SubscriptionScreen());
      expect(find.text('Subscribe'), findsOneWidget);
      expect(find.text('\$399 per month. Cancel anytime.'), findsOneWidget);
      await tester.tap(find.byKey(const ValueKey('subscribe-cta')));
      await tester.pump();
      expect(find.text('Trial unavailable'), findsOneWidget);
      expect(
          find.text(
              'No trial is available: \$399 will be charged now. Continue?'),
          findsOneWidget);
      await tester.tap(find.text('Pay \$399'));
      await tester.pump();
      await tester.pump();
      expect(repo.calls, contains('confirm:seti_1:true'));
      expect(find.text('Subscription active'), findsOneWidget);
    });

    testWidgets('closing the card sheet leaves the screen calm',
        (tester) async {
      collector.error = const CardCollectionCancelled();
      await pump(tester, const SubscriptionScreen());
      await tester.tap(find.byKey(const ValueKey('subscribe-cta')));
      await tester.pump();
      await tester.pump();
      expect(repo.calls, ['overview', 'start']);
      expect(find.byType(SnackBar), findsNothing);
      final cta =
          tester.widget<AppButton>(find.byKey(const ValueKey('subscribe-cta')));
      expect(cta.isLoading, isFalse);
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
      expect(find.text('Subscribe again'), findsOneWidget);
      expect(find.text('Expired'), findsOneWidget);
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
