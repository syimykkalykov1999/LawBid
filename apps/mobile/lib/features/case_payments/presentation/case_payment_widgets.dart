import 'dart:io';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/l10n_formats.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/features/case_payments/domain/case_payment_models.dart';
import 'package:lawbid/features/cases/presentation/widgets/case_status.dart';
import 'package:path_provider/path_provider.dart';
import 'package:share_plus/share_plus.dart';
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

StatusTone paymentRequestTone(PaymentRequest r) => switch (r.status) {
      PaymentRequestStatus.open =>
        r.overdue ? StatusTone.danger : StatusTone.info,
      PaymentRequestStatus.paid => StatusTone.success,
      PaymentRequestStatus.canceled ||
      PaymentRequestStatus.expired =>
        StatusTone.neutral,
    };

String paymentRequestStatusLabel(Translator t, PaymentRequest r) => r.overdue
    ? t.t('cpay.req.overdue')
    : t.t('cpay.req.status.${r.status.name}');

/// Saves [bytes] to a temp file and opens the system share sheet (save
/// to Files, send by mail…). Receipts and CSV exports.
Future<void> shareBytes(
  Uint8List bytes,
  String filename, {
  required String mimeType,
}) async {
  final dir = await getTemporaryDirectory();
  final file = File('${dir.path}/$filename');
  await file.writeAsBytes(bytes, flush: true);
  await SharePlus.instance.share(
    ShareParams(files: [XFile(file.path, mimeType: mimeType)]),
  );
}

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
    this.onReceipt,
    super.key,
  });

  final CasePayment payment;
  final Translator t;
  final L10nFormats formats;
  final bool asAttorney;
  final String? subtitle;
  final Widget? action;

  /// Our PDF receipt (shared through the system sheet).
  final VoidCallback? onReceipt;

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
              if (p.receiptUrl != null ||
                  onReceipt != null ||
                  action != null) ...[
                const SizedBox(height: AppSpacing.sm),
                Row(
                  children: [
                    if (onReceipt != null)
                      Flexible(
                        child: AppButton(
                          label: t.t('cpay.receiptPdf'),
                          icon: AppIcons.iosShareRounded,
                          variant: AppButtonVariant.secondary,
                          height: 40,
                          onPressed: onReceipt,
                        ),
                      ),
                    if (onReceipt != null && p.receiptUrl != null)
                      const SizedBox(width: AppSpacing.sm),
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

/// One payment request (invoice) in the case card or the chat bar.
/// «Платит клиент / Плачу я / Пополам» — who covers Stripe's fee. Used in
/// the attorney's payout settings (default) and on each invoice (override).
class FeePayerChips extends StatelessWidget {
  const FeePayerChips({
    required this.value,
    required this.onChanged,
    required this.t,
    this.enabled = true,
    super.key,
  });

  static const values = ['client', 'attorney', 'split'];

  final String value;
  final ValueChanged<String> onChanged;
  final Translator t;
  final bool enabled;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final current = values.contains(value) ? value : 'client';
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            for (final v in values) ...[
              Expanded(
                child: AppChip(
                  label: t.t('cpay.feePayer.$v'),
                  selected: v == current,
                  expand: true,
                  fitLabel: true,
                  onTap: enabled ? () => onChanged(v) : null,
                ),
              ),
              if (v != values.last) const SizedBox(width: AppSpacing.xs),
            ],
          ],
        ),
        const SizedBox(height: AppSpacing.xs),
        Text(
          '${t.t('cpay.feePayer.$current.hint')}. ${t.t('cpay.fee.noShare')}',
          style: type.caption.copyWith(color: colors.textSecondary),
        ),
      ],
    );
  }
}

/// One line the client (or attorney) reads before paying an invoice:
/// total, Stripe's share, what the attorney receives.
String requestBreakdownText(
  Translator t,
  L10nFormats formats,
  PaymentRequest r,
) {
  final key = FeePayerChips.values.contains(r.processingFeePayer)
      ? r.processingFeePayer
      : 'client';
  return t.t('cpay.req.breakdown.$key', {
    'total': formats.currencyFromCents(r.clientTotalCents),
    'fee': formats.currencyFromCents(r.processingFeeCents),
    'net': formats.currencyFromCents(r.attorneyReceivesCents),
  });
}

/// The state of the fee-payer agreement on an invoice, from [side]'s
/// point of view ('client' | 'attorney'); null once paid / withdrawn.
String? feeNegotiationText(Translator t, PaymentRequest r, String side) {
  if (!r.payable) return null;
  final payer = t.t('cpay.feePayerOf.${r.processingFeePayer}');
  final String key;
  if (r.feeAgreed) {
    key = 'cpay.fee.agreed';
  } else if (r.feePayerBy == 'attorney') {
    key = side == 'attorney'
        ? (r.feePayerRounds == 0
            ? 'cpay.fee.agreed'
            : 'cpay.fee.counteredByAttorney')
        : 'cpay.fee.proposedByAttorney';
  } else {
    key = side == 'client'
        ? 'cpay.fee.proposedByClient'
        : 'cpay.fee.counteredByClient';
  }
  // The attorney's own first proposal reads as the invoice's terms.
  final text = key == 'cpay.fee.agreed' && !r.feeAgreed
      ? t.t('cpay.feePayer.${r.processingFeePayer}')
      : t.t(key, {'payer': payer});
  return r.feePayerRounds == 0 || r.feeAgreed
      ? text
      : '$text · ${t.t('cpay.fee.rounds', {
              'n': '${r.feePayerRounds}',
              'max': '${r.feePayerMaxRounds}',
            })}';
}

class PaymentRequestTile extends StatelessWidget {
  const PaymentRequestTile({
    required this.request,
    required this.t,
    required this.formats,
    this.side = 'client',
    this.action,
    super.key,
  });

  final PaymentRequest request;
  final Translator t;
  final L10nFormats formats;

  /// 'client' | 'attorney' — whose screen this is.
  final String side;
  final Widget? action;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final r = request;
    final amount = formats.currencyFromCents(r.amountCents);
    final sub = [
      r.description,
      if (r.total > 1)
        t.t('cpay.req.part', {'seq': '${r.seq}', 'total': '${r.total}'}),
      if (r.dueAt != null && r.status == PaymentRequestStatus.open)
        t.t('cpay.req.due', {'date': formats.date(r.dueAt!)}),
      if (r.paidAt != null) formats.date(r.paidAt!),
    ].join(' · ');
    final breakdown = r.payable ? requestBreakdownText(t, formats, r) : null;
    final negotiation = feeNegotiationText(t, r, side);
    final status = paymentRequestStatusLabel(t, r);
    return Padding(
      padding: const EdgeInsets.only(bottom: AppSpacing.sm),
      child: Semantics(
        container: true,
        label: '$amount, $sub, ${breakdown ?? ''}, $status',
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
                            sub,
                            maxLines: 3,
                            overflow: TextOverflow.ellipsis,
                            style: type.caption
                                .copyWith(color: colors.textSecondary),
                          ),
                          if (breakdown != null) ...[
                            const SizedBox(height: AppSpacing.xs / 2),
                            Text(
                              breakdown,
                              maxLines: 2,
                              style: type.caption.copyWith(color: colors.text),
                            ),
                          ],
                          if (negotiation != null) ...[
                            const SizedBox(height: AppSpacing.xs / 2),
                            Text(
                              negotiation,
                              maxLines: 2,
                              style: type.caption.copyWith(
                                color: r.feeAgreed
                                    ? colors.success
                                    : colors.goldDark,
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                          ],
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(width: AppSpacing.sm),
                  ExcludeSemantics(
                    child: StatusPill(
                      label: status,
                      tone: paymentRequestTone(r),
                    ),
                  ),
                ],
              ),
              if (action != null) ...[
                const SizedBox(height: AppSpacing.sm),
                action!,
              ],
            ],
          ),
        ),
      ),
    );
  }
}
