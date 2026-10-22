import 'package:flutter_stripe/flutter_stripe.dart';
import 'package:lawbid/features/subscription/data/card_collector.dart';

/// Owner 2026-10-22: a seat purchase is charged at once to the card the
/// subscription already uses; when the bank asks for 3-D Secure the server
/// answers `requires_action` with the PaymentIntent's client secret and
/// the app shows the bank's check here. Behind an interface so screens and
/// tests never touch the Stripe platform channel.
// ignore: one_member_abstracts
abstract interface class PaymentConfirmer {
  /// Returns when the payment is authenticated; throws
  /// [CardCollectionCancelled], [CardCollectionFailed] or
  /// [CardCollectorUnavailable] (the same outcomes as the card sheet).
  Future<void> confirm(String clientSecret);
}

/// `flutter_stripe`'s `handleNextAction` — the bank's own 3-D Secure page
/// for a PaymentIntent created off-session by the invoice.
class StripePaymentConfirmer implements PaymentConfirmer {
  StripePaymentConfirmer({required this.publishableKey});

  final String publishableKey;
  bool _configured = false;

  @override
  Future<void> confirm(String clientSecret) async {
    if (publishableKey.isEmpty) throw const CardCollectorUnavailable();
    if (!_configured) {
      Stripe.publishableKey = publishableKey;
      await Stripe.instance.applySettings();
      _configured = true;
    }
    try {
      final intent = await Stripe.instance.handleNextAction(clientSecret);
      if (intent.status == PaymentIntentsStatus.Canceled) {
        throw const CardCollectionCancelled();
      }
      if (intent.status == PaymentIntentsStatus.RequiresPaymentMethod) {
        throw const CardCollectionFailed('requires_payment_method');
      }
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
