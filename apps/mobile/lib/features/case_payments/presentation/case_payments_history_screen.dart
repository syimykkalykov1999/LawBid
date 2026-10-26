import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/api_error_text.dart';
import 'package:lawbid/core/l10n/l10n_formats.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/navigation/app_routes.dart';
import 'package:lawbid/features/case_payments/application/case_payments_providers.dart';
import 'package:lawbid/features/case_payments/domain/case_payment_models.dart';
import 'package:lawbid/features/case_payments/presentation/case_payment_widgets.dart';
import 'package:lawbid/features/cases/presentation/widgets/async_views.dart';
import 'package:lawbid/features/onboarding/application/current_user_controller.dart';
import 'package:lawbid/shared/domain/user_role.dart';

/// Owner 2026-10-05 — «Платежи по делам»: what the client paid attorneys /
/// what the attorney received, newest first, with the year's total on top.
/// A row opens the case. Owner 2026-10-22 (audit #4 §1): a tab of the one
/// «Платежи» page of both roles.
class CasePaymentsHistoryList extends ConsumerWidget {
  const CasePaymentsHistoryList({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final f = ref.watch(l10nFormatsProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final attorney = ref.watch(currentUserRoleProvider) == UserRole.attorney;
    final value = ref.watch(casePaymentsHistoryProvider);
    final notifier = ref.read(casePaymentsHistoryProvider.notifier);
    final summary = ref.watch(casePaymentsSummaryProvider).value;
    return PagedListBody<CasePayment>(
      value: value,
      t: t,
      header: summary == null || summary.count == 0
          ? null
          : Padding(
              padding: const EdgeInsets.only(bottom: AppSpacing.md),
              child: Text(
                t.t('cpay.history.year', {
                  'amount': f.currencyFromCents(summary.totalCents),
                  'count': '${summary.count}',
                }),
                style: type.bodySmall.copyWith(color: colors.textSecondary),
              ),
            ),
      itemBuilder: (context, p, index) {
        final other = attorney ? p.client : p.attorney;
        final who = other?.display ?? '';
        final sub = [
          if (p.caseTitle != null) p.caseTitle!,
          if (who.isNotEmpty)
            t.t(attorney ? 'cpay.history.from' : 'cpay.history.to', {
              'name': who,
            }),
        ].join(' · ');
        return AppEntrance(
          index: index.clamp(0, 6),
          child: GestureDetector(
            behavior: HitTestBehavior.opaque,
            onTap: () => context.push(
              attorney
                  ? AppRoutes.workCase(p.caseId)
                  : AppRoutes.myCase(p.caseId),
            ),
            child: CasePaymentTile(
              payment: p,
              t: t,
              formats: f,
              asAttorney: attorney,
              subtitle: sub.isEmpty ? null : sub,
            ),
          ),
        );
      },
      itemKey: (p) => p.id,
      empty: AppEmptyState(
        icon: AppIcons.receiptLongOutlined,
        title: t.t('cpay.history.empty.title'),
        message: t.t('cpay.history.empty.message'),
      ),
      onRefresh: () async {
        ref.invalidate(casePaymentsSummaryProvider);
        await notifier.refresh();
      },
      onLoadMore: notifier.loadMore,
      onRetryMore: notifier.retryLoadMore,
    );
  }
}

/// The «download CSV» action of the case payments tab.
class CasePaymentsCsvButton extends ConsumerWidget {
  const CasePaymentsCsvButton({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    return IconButton(
      key: const ValueKey('case-payments-csv'),
      tooltip: t.t('cpay.csv.export'),
      icon: const AppIcon(AppIcons.downloadRounded),
      onPressed: () async {
        try {
          final bytes =
              await ref.read(casePaymentsRepositoryProvider).exportCsv();
          await shareBytes(
            bytes,
            'lawbid-payments.csv',
            mimeType: 'text/csv',
          );
        } on Object catch (e) {
          if (context.mounted) showAppSnackBar(context, errorText(t, e));
        }
      },
    );
  }
}
