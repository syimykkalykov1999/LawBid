import 'package:lawbid/features/subscription/domain/subscription_models.dart';
import 'package:lawbid/shared/domain/cursor_page.dart';

/// docs/06 §1.4 flows behind the "Подписка" screens. Throws
/// `ApiException` (see `guardApiCall`).
abstract interface class SubscriptionRepository {
  Future<SubscriptionOverview> overview();

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
}
