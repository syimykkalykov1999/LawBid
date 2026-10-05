import 'package:flutter/material.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/l10n_formats.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/features/case_payments/domain/case_payment_models.dart';
import 'package:lawbid/features/cases/presentation/widgets/case_status.dart';
import 'package:url_launcher/url_launcher.dart';

StatusTone casePaymentTone(CasePaymentStatus s) => switch (s) {
      CasePaymentStatus.succeeded => StatusTone.success,
      CasePaymentStatus.pendingPayment => StatusTone.info,
      CasePaymentStatus.failed ||
      CasePaymentStatus.disputed =>
        StatusTone.danger,
      CasePaymentStatus.partiallyRefunded => StatusTone.warning,
      CasePaymentStatus.canceled ||
      CasePaymentStatus.refunded ||
      CasePaymentStatus.unknown =>
        StatusTone.neutral,
    };

String casePaymentStatusLabel(Translator t, CasePaymentStatus s) =>
    t.t('cpay.status.${s.wire}');

String casePaymentKindLabel(Translator t, CasePaymentKind k) =>
    t.t('cpay.kind.${k.name}');

Future<void> openExternal(String url) async {
  final uri = Uri.tryParse(url);
  if (uri != null && (uri.scheme == 'https' || uri.scheme == 'http')) {
    await launchUrl(uri, mode: LaunchMode.externalApplication);
  }
}

/// The server's legal text (editable in the admin): LawBid only provides
/// the means to pay, takes no share of the fee, is not a party.
class PaymentDisclaimer extends StatelessWidget {
  const PaymentDisclaimer({required this.text, required this.t, super.key});

  final String text;
  final Translator t;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    return Container(
      padding: const EdgeInsets.all(AppSpacing.md),
      decoration: BoxDecoration(
        color: colors.surface,
        borderRadius: BorderRadius.circular(AppRadii.card),
        border: Border.all(color: colors.border),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          AppIcon(AppIcons.infoOutlineRounded, color: colors.textSecondary),
          const SizedBox(width: AppSpacing.sm),
          Expanded(
            child: Text(
              text,
              style: type.caption.copyWith(color: colors.textSecondary),
            ),
          ),
        ],
      ),
    );
  }
}

/// One payment row: amount, date, status, receipt link, optional action.
class CasePaymentTile extends StatelessWidget {
  const CasePaymentTile({
    required this.payment,
    required this.t,
    required this.formats,
    required this.asAttorney,
    this.subtitle,
    this.action,
    super.key,
  });

  final CasePayment payment;
  final Translator t;
  final L10nFormats formats;
  final bool asAttorney;
  final String? subtitle;
  final Widget? action;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final p = payment;
    final amount = formats.currencyFromCents(
      asAttorney ? p.attorneyNetCents : p.clientTotalCents,
      currencyCode: p.currency.toUpperCase(),
    );
    final date = formats.date(p.paidAt ?? p.createdAt);
    final status = casePaymentStatusLabel(t, p.status);
    final sub = subtitle ?? casePaymentKindLabel(t, p.kind);
    return Padding(
      padding: const EdgeInsets.only(bottom: AppSpacing.sm),
      child: Semantics(
        container: true,
        label: '$amount, $sub, $date, $status',
        child: AppCard(
          padding: const EdgeInsets.all(AppSpacing.md),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Expanded(
                    child: ExcludeSemantics(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            amount,
                            style:
                                type.titleMedium.copyWith(color: colors.text),
                          ),
                          const SizedBox(height: AppSpacing.xs / 2),
                          Text(
                            '$sub · $date',
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                            style: type.caption
                                .copyWith(color: colors.textSecondary),
                          ),
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(width: AppSpacing.sm),
                  ExcludeSemantics(
                    child: StatusPill(
                      label: status,
                      tone: casePaymentTone(p.status),
                    ),
                  ),
                ],
              ),
              if (p.refundedCents > 0) ...[
                const SizedBox(height: AppSpacing.xs),
                Text(
                  t.t('cpay.refunded', {
                    'amount': formats.currencyFromCents(p.refundedCents),
                  }),
                  style: type.caption.copyWith(color: colors.textSecondary),
                ),
              ],
              if (p.status == CasePaymentStatus.disputed && asAttorney) ...[
                const SizedBox(height: AppSpacing.xs),
                Text(
                  t.t('cpay.dispute'),
                  style: type.caption.copyWith(color: colors.dangerText),
                ),
              ],
              if (p.note != null && p.note!.isNotEmpty) ...[
                const SizedBox(height: AppSpacing.xs),
                Text(
                  p.note!,
                  maxLines: 3,
                  overflow: TextOverflow.ellipsis,
                  style: type.bodySmall.copyWith(color: colors.text),
                ),
              ],
              if (p.receiptUrl != null || action != null) ...[
                const SizedBox(height: AppSpacing.sm),
                Row(
                  children: [
                    if (p.receiptUrl != null)
                      Flexible(
                        child: AppButton(
                          label: t.t('cpay.receipt'),
                          icon: AppIcons.receiptLongOutlined,
                          variant: AppButtonVariant.secondary,
                          height: 40,
                          onPressed: () => openExternal(p.receiptUrl!),
                        ),
                      ),
                    if (p.receiptUrl != null && action != null)
                      const SizedBox(width: AppSpacing.sm),
                    if (action != null) Flexible(child: action!),
                  ],
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}
