import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/api_error_text.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/features/subscription/application/subscription_providers.dart';
import 'package:lawbid/features/subscription/domain/subscription_models.dart';
import 'package:lawbid/features/subscription/subscription_routes.dart';

/// Owner 2026-10-04: the ONE subscription offer an attorney sees — as the
/// onboarding step after the practice areas, and whenever an action needs
/// a subscription (the bid button, chats, contacts; PaywallScreen):
/// "7 days free, a card at the start" with "Start 7 days free", or — when
/// the trial is used up — "Subscribe". "Later" is always there: without a
/// subscription the attorney still browses everything.
enum OfferKind {
  /// No trial used yet: "Start 7 days free".
  trial,

  /// Trial used / subscription ended: "Subscribe".
  paid,

  /// Not verified yet: the trial opens after the licence (docs/06 §1.1).
  verifyFirst,

  /// Already active (trial or paid): nothing to offer.
  active,
}

OfferKind offerKindOf(SubscriptionOverview o) {
  if (o.isActive) return OfferKind.active;
  if (!o.canStart) return OfferKind.verifyFirst;
  final ended = o.subscription?.ended ?? false;
  return o.trialEligible && !ended ? OfferKind.trial : OfferKind.paid;
}

/// Texts of the offer for [o] (prices come from the API, admin-set).
({String title, String body, String cta}) offerTexts(
  Translator t,
  SubscriptionOverview o,
  String Function(int cents) price,
) {
  final monthly = price(o.prices.monthlyCents);
  final days = trialDaysText(t, o.prices.trialDays);
  return switch (offerKindOf(o)) {
    OfferKind.trial || OfferKind.active => (
        title: t.t('subscription.offer.trial.title', {'days': days}),
        body: t.t(
          'subscription.offer.trial.body',
          {'price': monthly, 'days': days},
        ),
        cta: t.t('subscription.offer.trial.cta', {'days': days}),
      ),
    OfferKind.paid => (
        title: t.t('subscription.offer.paid.title'),
        body: t.t('subscription.offer.paid.body', {'price': monthly}),
        cta: t.t('subscription.offer.paid.cta'),
      ),
    OfferKind.verifyFirst => (
        title: t.t('subscription.offer.trial.title', {'days': days}),
        body: t.t('subscription.offer.verifyFirst'),
        cta: t.t('subscription.offer.trial.cta', {'days': days}),
      ),
  };
}

/// "7 дней" / "1 день" / "14 days": the admin-set trial length
/// (owner 2026-10-05), for the {days} slot of the trial texts.
String trialDaysText(Translator t, int days) =>
    t.plural('subscription.trial.days', days);

/// Starts the monthly plan on Stripe's hosted page (a 7-day trial when the
/// attorney had none — the server decides) and reports the outcome with a
/// snack bar. True when the subscription (or trial) is now active.
Future<bool> startSubscriptionFromOffer(
  BuildContext context,
  WidgetRef ref,
) async {
  final t = ref.read(translatorProvider);
  final outcome = await ref
      .read(subscribeControllerProvider.notifier)
      .subscribeWeb(plan: SubscriptionPlan.monthly);
  if (!context.mounted) return false;
  switch (outcome) {
    case SubscribeOutcome.trialStarted:
      showAppSnackBar(context, t.t('subscription.done.trial'));
      return true;
    case SubscribeOutcome.activated:
      showAppSnackBar(context, t.t('subscription.done.active'));
      return true;
    case SubscribeOutcome.pendingConfirmation:
      showAppSnackBar(context, t.t('subscription.done.pending'));
      return false;
    case SubscribeOutcome.cancelled:
      return false;
    case SubscribeOutcome.failed:
      final error = ref.read(subscribeControllerProvider).error;
      showAppSnackBar(
        context,
        error is CheckoutNotOpened
            ? t.t('plans.cantOpen')
            : errorText(t, error ?? Exception()),
      );
      return false;
  }
}

/// The body of the offer: what the subscription gives, the "browse
/// without it" note and the link to every plan (yearly, assistant seats).
/// Title, text and buttons are placed by the hosting screen.
class SubscriptionOfferBenefits extends ConsumerWidget {
  const SubscriptionOfferBenefits({this.reason, super.key});

  /// Why the offer opened (e.g. "Bids come with a subscription").
  final String? reason;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    final t = ref.watch(translatorProvider);
    Widget benefit(String key) => Padding(
          padding: const EdgeInsets.only(bottom: AppSpacing.sm),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              AppIcon(
                AppIcons.checkCircleRounded,
                size: AppSizes.iconSm,
                color: colors.goldDark,
              ),
              const SizedBox(width: AppSpacing.sm),
              Expanded(
                child: Text(
                  t.t(key),
                  style: typography.body.copyWith(color: colors.text),
                ),
              ),
            ],
          ),
        );
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (reason != null) ...[
          Text(
            reason!,
            style: typography.bodySmall.copyWith(
              color: colors.goldDark,
              fontWeight: FontWeight.w600,
            ),
          ),
          const SizedBox(height: AppSpacing.md),
        ],
        AppCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const Align(
                alignment: AlignmentDirectional.centerStart,
                child: AppIconMedallion(
                  icon: AppIcons.workspacePremiumOutlined,
                ),
              ),
              const SizedBox(height: AppSpacing.md),
              benefit('subscription.offer.benefit.bids'),
              benefit('subscription.offer.benefit.chats'),
              benefit('subscription.offer.benefit.cancel'),
            ],
          ),
        ),
        const SizedBox(height: AppSpacing.md),
        Text(
          t.t('subscription.offer.browseNote'),
          style: typography.bodySmall.copyWith(color: colors.textSecondary),
        ),
        const SizedBox(height: AppSpacing.sm),
        Align(
          alignment: AlignmentDirectional.centerStart,
          child: TextButton(
            key: const ValueKey('offer-all-plans'),
            onPressed: () => context.push(SubscriptionRoutes.subscription),
            child: Text(
              t.t('subscription.offer.allPlans'),
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: typography.bodySmall.copyWith(
                color: colors.goldDark,
                fontWeight: FontWeight.w700,
              ),
            ),
          ),
        ),
      ],
    );
  }
}
