import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/l10n_formats.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/features/cases/presentation/widgets/async_views.dart';
import 'package:lawbid/features/cases/presentation/widgets/case_status.dart';
import 'package:lawbid/features/subscription/application/subscription_providers.dart';
import 'package:lawbid/features/subscription/domain/subscription_models.dart';

/// docs/06 §1.7 п.4 — payments of the subscription (`payments` table),
/// newest first, cursor-paged, with the usual loading/empty/error/offline
/// states.
class PaymentsScreen extends ConsumerWidget {
  const PaymentsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final formats = ref.watch(l10nFormatsProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final value = ref.watch(paymentsProvider);
    final notifier = ref.read(paymentsProvider.notifier);
    return Scaffold(
      backgroundColor: colors.bg,
      appBar: AppTopBar(
        leading: AppBackButton(
          semanticLabel: t.t('common.back'),
          onPressed: () => Navigator.of(context).maybePop(),
        ),
        title: Text(t.t('payments.title')),
      ),
      body: PagedListBody<PaymentRecord>(
        value: value,
        t: t,
        itemBuilder: (context, payment, index) => AppEntrance(
          index: index.clamp(0, 6),
          child: PaymentCard(payment: payment, t: t, formats: formats),
        ),
        itemKey: (p) => p.id,
        empty: AppEmptyState(
          icon: AppIcons.receiptLongOutlined,
          title: t.t('payments.empty.title'),
          message: t.t('payments.empty.message'),
        ),
        onRefresh: notifier.refresh,
        onLoadMore: notifier.loadMore,
        onRetryMore: notifier.retryLoadMore,
      ),
    );
  }
}

StatusTone paymentTone(PaymentStatus status) => switch (status) {
      PaymentStatus.succeeded => StatusTone.success,
      PaymentStatus.pending => StatusTone.info,
      PaymentStatus.failed => StatusTone.danger,
      PaymentStatus.refunded || PaymentStatus.unknown => StatusTone.neutral,
    };

/// One payment: amount, date, status pill, failure code when it failed.
class PaymentCard extends StatelessWidget {
  const PaymentCard({
    required this.payment,
    required this.t,
    required this.formats,
    super.key,
  });

  final PaymentRecord payment;
  final Translator t;
  final L10nFormats formats;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    final tone = paymentTone(payment.status);
    final amount = formats.currencyFromCents(
      payment.amountCents,
      currencyCode: payment.currency.toUpperCase(),
    );
    final date = formats.date(payment.paidAt ?? payment.createdAt);
    final status = t.t('payments.status.${payment.status.name}');
    return Padding(
      padding: const EdgeInsets.only(bottom: AppSpacing.md),
      child: Semantics(
        container: true,
        label: '$amount, $date, $status',
        child: AppCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  AppIconMedallion(
                    icon: payment.status == PaymentStatus.failed
                        ? AppIcons.errorOutlineRounded
                        : AppIcons.receiptLongOutlined,
                    tone: switch (tone) {
                      StatusTone.danger => AppMedallionTone.danger,
                      StatusTone.success => AppMedallionTone.success,
                      StatusTone.neutral => AppMedallionTone.neutral,
                      _ => AppMedallionTone.gold,
                    },
                  ),
                  const SizedBox(width: AppSpacing.md),
                  Expanded(
                    child: ExcludeSemantics(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            amount,
                            style: typography.titleMedium
                                .copyWith(color: colors.text),
                          ),
                          const SizedBox(height: AppSpacing.xs / 2),
                          Text(
                            date,
                            style: typography.caption
                                .copyWith(color: colors.textSecondary),
                          ),
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(width: AppSpacing.sm),
                  ExcludeSemantics(
                      child: StatusPill(label: status, tone: tone)),
                ],
              ),
              if (payment.failureCode != null) ...[
                const SizedBox(height: AppSpacing.sm),
                Text(
                  t.t('payments.failureCode', {'code': payment.failureCode!}),
                  style: typography.caption.copyWith(color: colors.dangerText),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}
