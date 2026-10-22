import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/l10n_formats.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/features/promotions/domain/promotion_models.dart';

/// What the owner does with a Boost left at «Завершить оплату».
enum PendingPaymentChoice { pay, restart, cancel }

/// Owner 2026-10-22: a Boost whose payment was not finished used to offer
/// only «Завершить оплату». Now: pay it, start over (new settings) or
/// cancel it — the payment is voided at Stripe, the post stays as it was.
Future<PendingPaymentChoice?> showPendingPaymentSheet(
  BuildContext context,
  CasePromotion promotion,
) =>
    showAppBottomSheet<PendingPaymentChoice>(
      context: context,
      builder: (_) => PendingPaymentSheet(promotion: promotion),
    );

class PendingPaymentSheet extends ConsumerWidget {
  const PendingPaymentSheet({required this.promotion, super.key});

  final CasePromotion promotion;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final f = ref.watch(l10nFormatsProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    void pick(PendingPaymentChoice c) => Navigator.of(context).pop(c);
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(
          AppSpacing.screenSide,
          AppSpacing.md,
          AppSpacing.screenSide,
          AppSpacing.lg,
        ),
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const AppSheetHandle(),
              const SizedBox(height: AppSpacing.lg),
              Text(
                t.t('promote.pending.title'),
                textAlign: TextAlign.center,
                style: type.titleMedium.copyWith(
                  color: colors.text,
                  fontWeight: FontWeight.w700,
                ),
              ),
              const SizedBox(height: AppSpacing.sm),
              Text(
                t.t('promote.pending.message', {
                  'price': f.currencyFromCents(promotion.totalCents),
                }),
                textAlign: TextAlign.center,
                style: type.body.copyWith(color: colors.textSecondary),
              ),
              const SizedBox(height: AppSpacing.xl),
              AppButton(
                key: const ValueKey('pending-pay'),
                label: t.t('promote.completePayment'),
                onPressed: () => pick(PendingPaymentChoice.pay),
              ),
              const SizedBox(height: AppSpacing.sm),
              AppButton(
                key: const ValueKey('pending-restart'),
                label: t.t('promote.pending.restart'),
                variant: AppButtonVariant.secondary,
                onPressed: () => pick(PendingPaymentChoice.restart),
              ),
              const SizedBox(height: AppSpacing.sm),
              AppButton(
                key: const ValueKey('pending-cancel'),
                label: t.t('promote.pending.cancel'),
                variant: AppButtonVariant.danger,
                onPressed: () => pick(PendingPaymentChoice.cancel),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
