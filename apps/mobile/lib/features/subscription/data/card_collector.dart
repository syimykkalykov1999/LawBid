import 'package:flutter/material.dart';
import 'package:flutter_stripe/flutter_stripe.dart';

/// What the PaymentSheet needs (docs/06 §1.4 step 2).
@immutable
class CardCollectionRequest {
  const CardCollectionRequest({
    required this.clientSecret,
    required this.customerId,
    required this.dark,
    required this.primaryColor,
  });

  /// SetupIntent client secret from `POST /subscriptions/start`.
  final String clientSecret;
  final String customerId;
  final bool dark;

  /// The sheet's accent (brand gold/navy) so it does not look foreign.
  final Color primaryColor;
}

/// The attorney closed the sheet without saving a card.
class CardCollectionCancelled implements Exception {
  const CardCollectionCancelled();
}

/// Stripe rejected the card / could not authenticate it (3-D Secure).
class CardCollectionFailed implements Exception {
  const CardCollectionFailed(this.reason);

  final String reason;
}

/// This build has no publishable key (`STRIPE_PUBLISHABLE_KEY` define).
class CardCollectorUnavailable implements Exception {
  const CardCollectorUnavailable();
}

/// Confirms a card for the SetupIntent. Behind an interface so screens,
/// controller and tests never touch the Stripe platform channel.
// ignore: one_member_abstracts
abstract interface class CardCollector {
  /// Returns when the card is saved; throws [CardCollectionCancelled],
  /// [CardCollectionFailed] or [CardCollectorUnavailable].
  Future<void> collect(CardCollectionRequest request);
}

/// `flutter_stripe` PaymentSheet in setup mode (includes 3-D Secure).
/// The key is applied lazily on first use, so app start-up stays untouched.
class StripeCardCollector implements CardCollector {
  StripeCardCollector({required this.publishableKey});

  final String publishableKey;
  bool _configured = false;

  @override
  Future<void> collect(CardCollectionRequest request) async {
    if (publishableKey.isEmpty) throw const CardCollectorUnavailable();
    if (!_configured) {
      Stripe.publishableKey = publishableKey;
      await Stripe.instance.applySettings();
      _configured = true;
    }
    try {
      await Stripe.instance.initPaymentSheet(
        paymentSheetParameters: SetupPaymentSheetParameters(
          setupIntentClientSecret: request.clientSecret,
          customerId: request.customerId,
          merchantDisplayName: 'LawBid',
          style: request.dark ? ThemeMode.dark : ThemeMode.light,
          appearance: PaymentSheetAppearance(
            colors: PaymentSheetAppearanceColors(primary: request.primaryColor),
          ),
        ),
      );
      await Stripe.instance.presentPaymentSheet();
    } on StripeException catch (e) {
      if (e.error.code == FailureCode.Canceled) {
        throw const CardCollectionCancelled();
      }
      throw CardCollectionFailed(
        e.error.localizedMessage ?? e.error.message ?? e.error.code.name,
      );
    } on StripeConfigException catch (e) {
      throw CardCollectionFailed(e.message);
    }
  }
}
