import 'dart:async';

import 'package:lawbid/features/plans/domain/plan_models.dart';
import 'package:lawbid/features/subscription/data/card_collector.dart';
import 'package:lawbid/features/subscription/domain/subscription_models.dart';
import 'package:lawbid/features/subscription/domain/subscription_repository.dart';
import 'package:lawbid/shared/domain/cursor_page.dart';

final day = DateTime.utc(2026, 10, 6, 12);

SubscriptionInfo makeInfo({
  SubscriptionStatus status = SubscriptionStatus.trialing,
  bool? isActive,
  DateTime? trialEndsAt,
  DateTime? currentPeriodEnd,
  bool cancelAtPeriodEnd = false,
  DateTime? graceEndsAt,
  SubscriptionPlan plan = SubscriptionPlan.monthly,
  int assistantSeats = 0,
}) =>
    SubscriptionInfo(
      id: 'sub_1',
      plan: plan,
      assistantSeats: assistantSeats,
      status: status,
      isActive: isActive ??
          (status == SubscriptionStatus.trialing ||
              status == SubscriptionStatus.active),
      priceCents: 39900,
      trialEndsAt:
          trialEndsAt ?? (status == SubscriptionStatus.trialing ? day : null),
      currentPeriodEnd: currentPeriodEnd ??
          (status == SubscriptionStatus.active ? day : null),
      cancelAtPeriodEnd: cancelAtPeriodEnd,
      graceEndsAt: graceEndsAt,
      createdAt: DateTime.utc(2026, 9, 29),
    );

SubscriptionOverview makeOverview({
  SubscriptionInfo? subscription,
  bool? isActive,
  bool? canStart,
  bool trialEligible = true,
  List<PlanOffer> plans = const [],
  PlanOffer? plan,
  SeatSummary? seats,
}) =>
    SubscriptionOverview(
      subscription: subscription,
      isActive: isActive ?? subscription?.isActive ?? false,
      canStart: canStart ?? !(subscription?.isActive ?? false),
      trialEligible: trialEligible,
      priceCents: 39900,
      plans: plans,
      plan: plan,
      entitlements: plan?.entitlements ?? PlanEntitlements.none,
      seats: seats,
    );

/// Owner 2026-10-05 (plan builder): two attorney plans — Solo (no seats)
/// and Team (2 included, up to 5, $100 per extra seat, 14-day trial).
const soloPlan = PlanOffer(
  id: 'p1',
  code: 'solo',
  audience: PlanAudience.attorney,
  name: LocalizedText(en: 'Solo', ru: 'Соло'),
  tagline: LocalizedText(en: 'For one attorney', ru: 'Для одного адвоката'),
  amountCents: 29900,
  entitlements: PlanEntitlements(
    includedSeats: 0,
    maxSeats: 0,
    bidsAnyState: true,
    maxActiveBids: 10,
    calls: true,
  ),
  isDefault: true,
  trialDays: 7,
);

const teamPlan = PlanOffer(
  id: 'p2',
  code: 'team',
  audience: PlanAudience.attorney,
  name: LocalizedText(en: 'Team', ru: 'Команда'),
  amountCents: 59900,
  extraSeatCents: 10000,
  entitlements: PlanEntitlements(
    includedSeats: 2,
    maxSeats: 5,
    extraSeatPriceCents: 10000,
    bidsAnyState: true,
    maxActiveBids: 0,
    prioritySearch: true,
    calls: true,
    chatTranslate: true,
  ),
  highlights: [LocalizedText(en: 'Best for firms', ru: 'Для фирм')],
  trialDays: 14,
);

PaymentRecord makePayment(
  String id, {
  PaymentStatus status = PaymentStatus.succeeded,
  String? failureCode,
}) =>
    PaymentRecord(
      id: id,
      amountCents: 39900,
      currency: 'usd',
      status: status,
      paidAt: status == PaymentStatus.succeeded ? day : null,
      failureCode: failureCode,
      createdAt: day,
    );

const startFixture = SubscriptionStart(
  clientSecret: 'seti_secret',
  setupIntentId: 'seti_1',
  customerId: 'cus_1',
  trialEligible: true,
  priceCents: 39900,
  trialDays: 7,
);

class FakeSubscriptionRepository implements SubscriptionRepository {
  FakeSubscriptionRepository(SubscriptionOverview initial) : current = initial;

  SubscriptionOverview current;

  /// Answers of the next `overview()` calls before falling back to
  /// [current] (polling after confirm).
  final List<SubscriptionOverview> overviewQueue = [];
  final List<CursorPage<PaymentRecord>> paymentPages = [];
  final List<String> calls = [];

  /// Set to make `overview()` wait (loading state), or to fail.
  Completer<void>? hold;
  Object? overviewError;
  Object? startError;
  SubscriptionStart startResult = startFixture;

  /// What `confirm` returns; the `chargeNow` flag is recorded in [calls].
  // ignore: avoid_positional_boolean_parameters
  SubscriptionOverview Function(bool chargeNow)? onConfirm;
  Object? confirmError;
  Uri portal = Uri.parse('https://billing.stripe.com/p/session_1');

  @override
  Future<SubscriptionOverview> overview() async {
    calls.add('overview');
    if (hold != null) await hold!.future;
    // ignore: only_throw_errors
    if (overviewError != null) throw overviewError!;
    if (overviewQueue.isNotEmpty) return current = overviewQueue.removeAt(0);
    return current;
  }

  WebCheckout checkoutResult = WebCheckout(
    url: Uri.parse('https://checkout.stripe.com/c/pay/cs_1'),
    sessionId: 'cs_1',
    trialEligible: true,
    priceCents: 39900,
    trialDays: 7,
  );

  /// What `completeCheckout` returns (null → [current]).
  SubscriptionOverview Function()? onComplete;

  @override
  Future<WebCheckout> checkout({
    SubscriptionPlan plan = SubscriptionPlan.monthly,
    int assistantSeats = 0,
    List<String> assistantPhones = const [],
    String? promoCode,
    String? planCode,
  }) async {
    calls.add(
      'checkout:${plan.name}:$assistantSeats:${assistantPhones.join(',')}'
      '${planCode == null ? '' : ':$planCode'}',
    );
    return checkoutResult;
  }

  @override
  Future<PromoCheck> validatePromo(String code, SubscriptionPlan plan) async =>
      const PromoCheck(valid: false, reason: 'not_found');

  @override
  Future<SubscriptionOverview> completeCheckout(String sessionId) async {
    calls.add('complete:$sessionId');
    return current = onComplete?.call() ?? current;
  }

  @override
  Future<SubscriptionOverview> setSeats(int seats) async {
    calls.add('seats:$seats');
    final s = current.subscription!;
    return current = makeOverview(
      subscription: makeInfo(status: s.status, assistantSeats: seats),
      trialEligible: false,
    );
  }

  @override
  Future<SubscriptionOverview> switchToYearly() async {
    calls.add('yearly');
    return current = makeOverview(
      subscription: makeInfo(
        status: SubscriptionStatus.active,
        plan: SubscriptionPlan.yearly,
        assistantSeats: 6,
      ),
      trialEligible: false,
    );
  }

  @override
  Future<SubscriptionStart> start() async {
    calls.add('start');
    // ignore: only_throw_errors
    if (startError != null) throw startError!;
    return startResult;
  }

  @override
  Future<SubscriptionOverview> confirm(
    String setupIntentId, {
    bool chargeNow = false,
  }) async {
    calls.add('confirm:$setupIntentId:$chargeNow');
    if (confirmError != null) {
      final e = confirmError!;
      confirmError = null;
      // ignore: only_throw_errors
      throw e;
    }
    return current = onConfirm?.call(chargeNow) ??
        makeOverview(subscription: makeInfo(), trialEligible: false);
  }

  @override
  Future<CursorPage<PaymentRecord>> payments({String? cursor}) async {
    calls.add('payments:$cursor');
    if (paymentPages.isEmpty) return const CursorPage(items: []);
    final index = cursor == null ? 0 : int.parse(cursor);
    return paymentPages[index];
  }

  @override
  Future<Uri> portalUrl() async {
    calls.add('portal');
    return portal;
  }

  @override
  Future<SubscriptionOverview> resume() async {
    calls.add('resume');
    final s = current.subscription!;
    return current = makeOverview(
      subscription: makeInfo(
        status: s.status,
        trialEndsAt: s.trialEndsAt,
        currentPeriodEnd: s.currentPeriodEnd,
      ),
      trialEligible: false,
    );
  }

  @override
  Future<SubscriptionOverview> cancel() async {
    calls.add('cancel');
    final s = current.subscription!;
    return current = makeOverview(
      subscription: makeInfo(
        status: s.status,
        trialEndsAt: s.trialEndsAt,
        currentPeriodEnd: s.currentPeriodEnd,
        cancelAtPeriodEnd: true,
      ),
      trialEligible: false,
    );
  }
}

class FakeCardCollector implements CardCollector {
  final List<CardCollectionRequest> requests = [];
  Object? error;

  @override
  Future<void> collect(CardCollectionRequest request) async {
    requests.add(request);
    // ignore: only_throw_errors
    if (error != null) throw error!;
  }
}

/// The attorney baseline («Без подписки») the server reports as the plan
/// of an attorney without a subscription.
const baselinePlan = PlanOffer(
  id: 'p0',
  code: 'attorney_free',
  audience: PlanAudience.attorney,
  isBaseline: true,
  name: LocalizedText(en: 'No subscription', ru: 'Без подписки'),
  entitlements: PlanEntitlements(calls: true, videoCalls: true),
);
