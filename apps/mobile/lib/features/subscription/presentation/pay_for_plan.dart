import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:lawbid/core/config/app_config.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/l10n_formats.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/features/subscription/application/subscription_providers.dart';
import 'package:lawbid/features/subscription/data/card_collector.dart';
import 'package:lawbid/features/subscription/domain/subscription_models.dart';

/// Owner 2026-10-11: the card is entered in Stripe's sheet INSIDE the app
/// (3-D Secure included), for any plan — the order (plan, seats, assistant
/// phones, promo) travels to the server first and the subscription is
/// created when the card is saved. A build without the Stripe publishable
/// key falls back to the hosted page in the browser.
Future<SubscribeOutcome> payForPlan(
  BuildContext context,
  WidgetRef ref, {
  SubscriptionPlan plan = SubscriptionPlan.monthly,
  int assistantSeats = 0,
  List<String> assistantPhones = const [],
  String? promoCode,
  String? planCode,
}) {
  final controller = ref.read(subscribeControllerProvider.notifier);
  if (AppConfig.stripePublishableKey.isEmpty) {
    return controller.subscribeWeb(
      plan: plan,
      assistantSeats: assistantSeats,
      assistantPhones: assistantPhones,
      promoCode: promoCode,
      planCode: planCode,
    );
  }
  final t = ref.read(translatorProvider);
  final formats = ref.read(l10nFormatsProvider);
  final colors = Theme.of(context).extension<AppColorTokens>()!;
  final dark = Theme.of(context).brightness == Brightness.dark;

  Future<bool> askChargeNow(int cents) async {
    final price = formats.currencyFromCents(cents);
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: colors.surface,
        title: Text(t.t('subscription.chargeNow.title')),
        content: Text(t.t('subscription.chargeNow.body', {'price': price})),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(false),
            child: Text(t.t('common.cancel')),
          ),
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(true),
            child:
                Text(t.t('subscription.chargeNow.confirm', {'price': price})),
          ),
        ],
      ),
    );
    return ok ?? false;
  }

  return controller.subscribe(
    plan: plan,
    assistantSeats: assistantSeats,
    assistantPhones: assistantPhones,
    promoCode: promoCode,
    planCode: planCode,
    confirmChargeNow: askChargeNow,
    buildRequest: (start) => CardCollectionRequest(
      clientSecret: start.clientSecret,
      customerId: start.customerId,
      dark: dark,
      primaryColor: dark ? colors.gold : colors.navy,
    ),
  );
}
