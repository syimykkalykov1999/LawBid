import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/features/subscription/subscription_routes.dart';

/// Which gate sent the attorney here (docs/06 §1.7 п.3): the paywall
/// names the locked action instead of a generic "нужна подписка".
enum PaywallReason {
  bid,
  chat,
  contacts,
  generic;

  static PaywallReason parse(String? raw) => values.firstWhere(
        (r) => r.name == raw,
        orElse: () => PaywallReason.generic,
      );
}

/// docs/06 §1.7 п.3 — paywall for «Сделать бид», «Написать клиенту»,
/// «Контакты клиента»: short explanation, "7 дней бесплатно" hint and the
/// way to the "Подписка" screen. Modal over the gated screen.
class PaywallScreen extends ConsumerWidget {
  const PaywallScreen({this.reason = PaywallReason.generic, super.key});

  final PaywallReason reason;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    final (IconData icon, String title, String body) = switch (reason) {
      PaywallReason.bid => (
          AppIcons.gavelRounded,
          t.t('paywall.bid.title'),
          t.t('paywall.bid.body'),
        ),
      PaywallReason.chat => (
          AppIcons.chatBubbleOutlineRounded,
          t.t('paywall.chat.title'),
          t.t('paywall.chat.body'),
        ),
      PaywallReason.contacts => (
          AppIcons.contactPhoneOutlined,
          t.t('paywall.contacts.title'),
          t.t('paywall.contacts.body'),
        ),
      PaywallReason.generic => (
          AppIcons.workspacePremiumOutlined,
          t.t('cases.subscription.title'),
          t.t('cases.subscription.message'),
        ),
    };
    return Scaffold(
      backgroundColor: colors.bg,
      appBar: AppTopBar(
        leading: AppBackButton(
          semanticLabel: t.t('common.close'),
          onPressed: () => Navigator.of(context).maybePop(),
        ),
        title: Text(t.t('paywall.title')),
      ),
      body: AppStateLayout(
        icon: icon,
        title: title,
        message: body,
        action: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            AppButton(
              key: const ValueKey('paywall-cta'),
              label: t.t('paywall.cta'),
              icon: AppIcons.workspacePremiumOutlined,
              height: AppSizes.touchTarget,
              onPressed: () =>
                  context.pushReplacement(SubscriptionRoutes.subscription),
            ),
            const SizedBox(height: AppSpacing.sm),
            Text(
              t.t('paywall.trialHint'),
              textAlign: TextAlign.center,
              style: typography.caption.copyWith(color: colors.textSecondary),
            ),
            const SizedBox(height: AppSpacing.md),
            AppButton(
              label: t.t('common.close'),
              variant: AppButtonVariant.secondary,
              height: AppSizes.touchTarget,
              onPressed: () => Navigator.of(context).maybePop(),
            ),
          ],
        ),
      ),
    );
  }
}
