import 'package:lawbid/features/subscription/domain/subscription_models.dart';
import 'package:lawbid/shared/domain/cursor_page.dart';

/// docs/06 §1.4 flows behind the "Подписка" screens. Throws
/// `ApiException` (see `guardApiCall`).
abstract interface class SubscriptionRepository {
  Future<SubscriptionOverview> overview();

  /// Owner 2026-09-30: Stripe's hosted payment page (opened in the
  /// browser) — the store-compliant, cheapest way to pay.
  /// OQ-048: [plan], [assistantSeats] (monthly) and the phones of
  /// assistants who join without a code.
  Future<WebCheckout> checkout({
    SubscriptionPlan plan = SubscriptionPlan.monthly,
    int assistantSeats = 0,
    List<String> assistantPhones = const [],
  });

  /// OQ-048: monthly plan — change the number of assistant seats.
  Future<SubscriptionOverview> setSeats(int seats);

  /// Owner 2026-10-01: monthly → yearly Prime (the difference is charged).
  Future<SubscriptionOverview> switchToYearly();

  /// Back from the browser: apply the paid session (no-op until paid).
  Future<SubscriptionOverview> completeCheckout(String sessionId);

  /// Customer + SetupIntent for the PaymentSheet.
  Future<SubscriptionStart> start();

  /// Card confirmed → create the subscription. [chargeNow] is the explicit
  /// consent to be charged immediately when no trial is available
  /// (SUBSCRIPTION_TRIAL_UNAVAILABLE otherwise, docs/06 §1.1).
  Future<SubscriptionOverview> confirm(
    String setupIntentId, {
    bool chargeNow = false,
  });

  Future<CursorPage<PaymentRecord>> payments({String? cursor});

  /// Stripe Customer Portal (card, invoices, cancel) — short-lived URL.
  Future<Uri> portalUrl();

  /// Cancel at period end; access stays until then (docs/06 §1.3).
  Future<SubscriptionOverview> cancel();

  /// Audit 2026-10-01: undo a cancel before the period ends.
  Future<SubscriptionOverview> resume();
}
