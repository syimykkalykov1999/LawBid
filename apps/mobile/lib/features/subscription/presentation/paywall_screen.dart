import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/api_error_text.dart';
import 'package:lawbid/core/l10n/l10n_formats.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/features/subscription/application/subscription_providers.dart';
import 'package:lawbid/features/subscription/presentation/subscription_offer.dart';

/// Which gate sent the attorney here (docs/06 §1.7 п.3): the paywall
/// names the locked action instead of a generic "нужна подписка".
enum PaywallReason {
  bid,
  chat,
  contacts,
  // Owner 2026-10-05 (plan builder): features a plan switches on.
  templates,
  videoCall,
  generic;

  static PaywallReason parse(String? raw) => values.firstWhere(
        (r) => r.name == raw,
        orElse: () => PaywallReason.generic,
      );
}

/// docs/06 §1.7 п.3 — paywall for «Сделать бид», «Написать клиенту»,
/// «Контакты клиента». Owner 2026-10-04: the same subscription offer as
/// the onboarding step — "Start 7 days free" (or "Subscribe" after the
/// trial), "Later" closes it. Modal over the gated screen.
class PaywallScreen extends ConsumerStatefulWidget {
  const PaywallScreen({this.reason = PaywallReason.generic, super.key});

  final PaywallReason reason;

  @override
  ConsumerState<PaywallScreen> createState() => _PaywallScreenState();
}

class _PaywallScreenState extends ConsumerState<PaywallScreen> {
  void _close() => Navigator.of(context).maybePop();

  @override
  Widget build(BuildContext context) {
    final t = ref.watch(translatorProvider);
    final formats = ref.watch(l10nFormatsProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    final overview = ref.watch(subscriptionOverviewProvider);
    final subscribe = ref.watch(subscribeControllerProvider);
    final reason = switch (widget.reason) {
      PaywallReason.bid => t.t('paywall.bid.title'),
      PaywallReason.chat => t.t('paywall.chat.title'),
      PaywallReason.contacts => t.t('paywall.contacts.title'),
      PaywallReason.templates => t.t('paywall.templates.title'),
      PaywallReason.videoCall => t.t('paywall.videoCall.title'),
      PaywallReason.generic => null,
    };
    // Became active (e.g. paid on another device): nothing to sell.
    ref.listen(subscriptionOverviewProvider, (_, next) {
      if (next.value?.isActive ?? false) _close();
    });

    Widget body;
    Widget? actions;
    switch (overview) {
      case AsyncData(:final value):
        final texts = offerTexts(t, value, formats.currencyFromCents);
        final kind = offerKindOf(value);
        final waiting = subscribe.phase == SubscribePhase.awaitingPayment;
        body = ListView(
          padding: const EdgeInsets.fromLTRB(
            AppSpacing.screenSide,
            AppSpacing.lg,
            AppSpacing.screenSide,
            AppSpacing.xl,
          ),
          children: [
            Text(
              texts.title,
              style: typography.titleLarge.copyWith(color: colors.text),
            ),
            const SizedBox(height: AppSpacing.sm),
            Text(
              texts.body,
              style: typography.body.copyWith(color: colors.textSecondary),
            ),
            const SizedBox(height: AppSpacing.xl),
            SubscriptionOfferBenefits(reason: reason),
          ],
        );
        actions = Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            if (waiting) ...[
              Text(
                t.t('plans.waiting'),
                textAlign: TextAlign.center,
                style: typography.caption.copyWith(color: colors.textSecondary),
              ),
              const SizedBox(height: AppSpacing.sm),
            ],
            if (kind == OfferKind.trial || kind == OfferKind.paid)
              AppButton(
                key: const ValueKey('paywall-cta'),
                label: texts.cta,
                icon: AppIcons.workspacePremiumOutlined,
                isLoading: subscribe.busy,
                onPressed: () async {
                  if (await startSubscriptionFromOffer(context, ref)) {
                    _close();
                  }
                },
              ),
            const SizedBox(height: AppSpacing.sm),
            AppButton(
              key: const ValueKey('paywall-later'),
              label: waiting
                  ? t.t('plans.waiting.stop')
                  : t.t('subscription.offer.later'),
              variant: AppButtonVariant.secondary,
              onPressed: waiting
                  ? () => ref
                      .read(subscribeControllerProvider.notifier)
                      .stopWaiting()
                  : _close,
            ),
          ],
        );
      case AsyncError(:final error):
        body = AppErrorState(
          message: errorText(t, error),
          retryLabel: t.t('error.retry'),
          onRetry: () => ref.invalidate(subscriptionOverviewProvider),
        );
      default:
        body = const Center(child: CircularProgressIndicator());
    }

    return Scaffold(
      backgroundColor: colors.bg,
      appBar: AppTopBar(
        leading: AppBackButton(
          semanticLabel: t.t('common.close'),
          onPressed: _close,
        ),
        title: Text(t.t('paywall.title')),
      ),
      body: body,
      bottomNavigationBar: actions == null
          ? null
          : SafeArea(
              top: false,
              child: Padding(
                padding: const EdgeInsets.fromLTRB(
                  AppSpacing.screenSide,
                  AppSpacing.sm,
                  AppSpacing.screenSide,
                  AppSpacing.md,
                ),
                child: actions,
              ),
            ),
    );
  }
}
