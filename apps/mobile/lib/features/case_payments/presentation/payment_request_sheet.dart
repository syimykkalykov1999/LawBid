import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/api_error_text.dart';
import 'package:lawbid/core/l10n/l10n_formats.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/features/case_payments/application/case_payments_providers.dart';
import 'package:lawbid/features/case_payments/domain/case_payment_models.dart';
import 'package:lawbid/features/case_payments/presentation/case_payment_widgets.dart';

/// Owner 2026-10-05 — the attorney asks the client to pay: an amount, what
/// for, an optional due date; or the same split into installments (N parts
/// every K days). The client gets a push and pays in two taps.
class PaymentRequestSheet extends ConsumerStatefulWidget {
  const PaymentRequestSheet({
    required this.caseId,
    required this.state,
    required this.onSent,
    super.key,
  });

  final String caseId;
  final CasePaymentsState state;
  final VoidCallback onSent;

  static Future<void> show(
    BuildContext context,
    String caseId,
    CasePaymentsState state, {
    required VoidCallback onSent,
  }) =>
      showAppBottomSheet<void>(
        context: context,
        isScrollControlled: true,
        builder: (_) => PaymentRequestSheet(
          caseId: caseId,
          state: state,
          onSent: onSent,
        ),
      );

  @override
  ConsumerState<PaymentRequestSheet> createState() =>
      _PaymentRequestSheetState();
}

class _PaymentRequestSheetState extends ConsumerState<PaymentRequestSheet> {
  final _amount = TextEditingController();
  final _description = TextEditingController();
  DateTime? _due;
  bool _installments = false;
  int _parts = 2;
  int _everyDays = 30;
  bool _busy = false;
  // Who covers Stripe's fee: the attorney's default, changeable here.
  late String _feePayer = widget.state.processingFeePayer;
  PaymentQuote? _preview;
  int _previewSeq = 0;

  CasePaymentsState get s => widget.state;

  int? get _totalCents {
    final v = double.tryParse(_amount.text.replaceAll(',', '.').trim());
    if (v == null || v <= 0) return null;
    return (v * 100).round();
  }

  /// Equal parts, the remainder on the last one; due dates K days apart
  /// starting from the chosen date (or today + K when none).
  List<({int amountCents, DateTime? dueAt})> get _items {
    final total = _totalCents;
    if (total == null) return const [];
    if (!_installments) return [(amountCents: total, dueAt: _due)];
    final n = _parts.clamp(2, s.maxInstallments);
    final base = total ~/ n;
    final first = _due ?? DateTime.now().add(Duration(days: _everyDays));
    return [
      for (var i = 0; i < n; i++)
        (
          amountCents: i == n - 1 ? total - base * (n - 1) : base,
          dueAt: first.add(Duration(days: _everyDays * i)),
        ),
    ];
  }

  bool get _ok {
    final items = _items;
    return items.isNotEmpty &&
        _description.text.trim().isNotEmpty &&
        items.every(
          (it) =>
              it.amountCents >= s.minAmountCents &&
              it.amountCents <= s.maxAmountCents,
        );
  }

  @override
  void dispose() {
    _amount.dispose();
    _description.dispose();
    super.dispose();
  }

  Future<void> _pickDue() async {
    final now = DateTime.now();
    final picked = await showDatePicker(
      context: context,
      initialDate: _due ?? now.add(const Duration(days: 7)),
      firstDate: now,
      lastDate: now.add(const Duration(days: 365 * 2)),
    );
    if (picked != null && mounted) {
      // End of the chosen day, local time.
      setState(
        () => _due = DateTime(picked.year, picked.month, picked.day, 23, 59),
      );
    }
  }

  /// What the client will pay and what the attorney receives for the whole
  /// amount under the chosen fee payer (server estimate).
  Future<void> _refreshPreview() async {
    final total = _totalCents;
    if (total == null || total < s.minAmountCents || total > s.maxAmountCents) {
      setState(() => _preview = null);
      return;
    }
    final seq = ++_previewSeq;
    try {
      final q = await ref.read(casePaymentsRepositoryProvider).quote(
            total,
            processingFeePayer: _feePayer,
          );
      if (mounted && seq == _previewSeq) setState(() => _preview = q);
    } on Object {
      // The invoice shows the server's breakdown anyway.
    }
  }

  Future<void> _send() async {
    final t = ref.read(translatorProvider);
    setState(() => _busy = true);
    try {
      await ref.read(casePaymentsRepositoryProvider).createRequests(
        widget.caseId,
        description: _description.text.trim(),
        processingFeePayer: _feePayer,
        items: [
          for (final it in _items)
            (
              amountCents: it.amountCents,
              dueAt: it.dueAt,
              description: null,
            ),
        ],
      );
      if (!mounted) return;
      widget.onSent();
      Navigator.of(context).pop();
      showAppSnackBar(context, t.t('cpay.req.sheet.sent'));
    } on Object catch (e) {
      if (!mounted) return;
      setState(() => _busy = false);
      showAppSnackBar(context, errorText(t, e));
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = ref.watch(translatorProvider);
    final f = ref.watch(l10nFormatsProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final min = f.currencyFromCents(s.minAmountCents);
    final max = f.currencyFromCents(s.maxAmountCents);
    final items = _items;
    return Padding(
      padding: EdgeInsets.fromLTRB(
        AppSpacing.screenSide,
        AppSpacing.md,
        AppSpacing.screenSide,
        AppSpacing.lg + MediaQuery.viewInsetsOf(context).bottom,
      ),
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const AppSheetHandle(),
            const SizedBox(height: AppSpacing.md),
            Text(
              t.t('cpay.req.sheet.title'),
              style: type.titleMedium.copyWith(color: colors.text),
            ),
            const SizedBox(height: AppSpacing.xs),
            Text(
              t.t('cpay.req.sheet.sub'),
              style: type.bodySmall.copyWith(color: colors.textSecondary),
            ),
            const SizedBox(height: AppSpacing.lg),
            AppTextField(
              controller: _amount,
              label: t.t('cpay.req.sheet.amount'),
              helperText:
                  t.t('cpay.sheet.amountHint', {'min': min, 'max': max}),
              keyboardType:
                  const TextInputType.numberWithOptions(decimal: true),
              inputFormatters: [
                FilteringTextInputFormatter.allow(RegExp('[0-9.,]')),
              ],
              onChanged: (_) {
                setState(() {});
                _refreshPreview();
              },
            ),
            const SizedBox(height: AppSpacing.md),
            AppTextField(
              controller: _description,
              label: t.t('cpay.req.sheet.description'),
              helperText: _description.text.isEmpty
                  ? t.t('cpay.req.sheet.needDescription')
                  : null,
              maxLength: 200,
              maxLines: 2,
              textCapitalization: TextCapitalization.sentences,
              onChanged: (_) => setState(() {}),
            ),
            const SizedBox(height: AppSpacing.md),
            AppListRow(
              icon: AppIcons.scheduleRounded,
              label: t.t('cpay.req.sheet.due'),
              trailingText:
                  _due == null ? t.t('cpay.req.sheet.noDue') : f.date(_due!),
              onTap: _pickDue,
            ),
            const SizedBox(height: AppSpacing.md),
            Text(
              t.t('cpay.req.sheet.feePayer'),
              style: type.bodySmall.copyWith(color: colors.textSecondary),
            ),
            const SizedBox(height: AppSpacing.xs),
            FeePayerChips(
              value: _feePayer,
              t: t,
              onChanged: (v) {
                setState(() => _feePayer = v);
                _refreshPreview();
              },
            ),
            if (_preview != null) ...[
              const SizedBox(height: AppSpacing.xs),
              Text(
                t.t('cpay.req.sheet.feePreview', {
                  'total': f.currencyFromCents(_preview!.clientTotalCents),
                  'net': f.currencyFromCents(_preview!.attorneyReceivesCents),
                }),
                style: type.caption.copyWith(color: colors.text),
              ),
            ],
            if (s.allowInstallments && s.maxInstallments >= 2) ...[
              const SizedBox(height: AppSpacing.sm),
              SwitchListTile.adaptive(
                contentPadding: EdgeInsets.zero,
                value: _installments,
                onChanged: (v) => setState(() => _installments = v),
                title: Text(
                  t.t('cpay.req.sheet.installments'),
                  style: type.body.copyWith(color: colors.text),
                ),
              ),
              if (_installments) ...[
                _Stepper(
                  label: t.t('cpay.req.sheet.parts', {'count': '$_parts'}),
                  onMinus:
                      _parts > 2 ? () => setState(() => _parts -= 1) : null,
                  onPlus: _parts < s.maxInstallments
                      ? () => setState(() => _parts += 1)
                      : null,
                ),
                _Stepper(
                  label: t.t(
                    'cpay.req.sheet.everyDays',
                    {'days': '$_everyDays'},
                  ),
                  onMinus: _everyDays > 7
                      ? () => setState(() => _everyDays -= 7)
                      : null,
                  onPlus: _everyDays < 90
                      ? () => setState(() => _everyDays += 7)
                      : null,
                ),
                if (items.length > 1) ...[
                  const SizedBox(height: AppSpacing.sm),
                  for (final (i, it) in items.indexed)
                    Padding(
                      padding: const EdgeInsets.only(top: AppSpacing.xs / 2),
                      child: Text(
                        t.t('cpay.req.sheet.preview', {
                          'seq': '${i + 1}',
                          'amount': f.currencyFromCents(it.amountCents),
                          'date': it.dueAt == null ? '—' : f.date(it.dueAt!),
                        }),
                        style:
                            type.caption.copyWith(color: colors.textSecondary),
                      ),
                    ),
                ],
              ],
            ],
            const SizedBox(height: AppSpacing.lg),
            AppButton(
              label: items.length > 1
                  ? t.t('cpay.req.sheet.sendPlan', {'count': '${items.length}'})
                  : t.t('cpay.req.sheet.send'),
              icon: AppIcons.receiptLongOutlined,
              isLoading: _busy,
              disabledHint: t.t('form.disabled.required'),
              isEnabled: _ok,
              onPressed: _send,
            ),
          ],
        ),
      ),
    );
  }
}

class _Stepper extends StatelessWidget {
  const _Stepper({
    required this.label,
    required this.onMinus,
    required this.onPlus,
  });

  final String label;
  final VoidCallback? onMinus;
  final VoidCallback? onPlus;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    return Row(
      children: [
        Expanded(
          child: Text(
            label,
            style: type.bodySmall.copyWith(color: colors.text),
          ),
        ),
        IconButton(
          onPressed: onMinus,
          icon: const AppIcon(AppIcons.removeRounded),
        ),
        IconButton(
          onPressed: onPlus,
          icon: const AppIcon(AppIcons.addRounded),
        ),
      ],
    );
  }
}

/// Counter-offer on who covers Stripe's fee (either side, like a bid):
/// pick another option and send; the other side accepts or answers.
class FeePayerSheet extends ConsumerStatefulWidget {
  const FeePayerSheet({required this.request, required this.onDone, super.key});

  final PaymentRequest request;
  final VoidCallback onDone;

  static Future<void> show(
    BuildContext context,
    PaymentRequest request, {
    required VoidCallback onDone,
  }) =>
      showAppBottomSheet<void>(
        context: context,
        builder: (_) => FeePayerSheet(request: request, onDone: onDone),
      );

  @override
  ConsumerState<FeePayerSheet> createState() => _FeePayerSheetState();
}

class _FeePayerSheetState extends ConsumerState<FeePayerSheet> {
  late String _payer = widget.request.processingFeePayer;
  bool _busy = false;

  Future<void> _send() async {
    final t = ref.read(translatorProvider);
    setState(() => _busy = true);
    try {
      await ref.read(casePaymentsRepositoryProvider).answerFeePayer(
            widget.request.id,
            accept: false,
            processingFeePayer: _payer,
          );
      if (!mounted) return;
      widget.onDone();
      Navigator.of(context).pop();
      showAppSnackBar(context, t.t('cpay.fee.sheet.sent'));
    } on Object catch (e) {
      if (!mounted) return;
      setState(() => _busy = false);
      showAppSnackBar(context, errorText(t, e));
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final r = widget.request;
    return Padding(
      padding: const EdgeInsets.fromLTRB(
        AppSpacing.screenSide,
        AppSpacing.md,
        AppSpacing.screenSide,
        AppSpacing.lg,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const AppSheetHandle(),
          const SizedBox(height: AppSpacing.md),
          Text(
            t.t('cpay.fee.sheet.title'),
            style: type.titleMedium.copyWith(color: colors.text),
          ),
          const SizedBox(height: AppSpacing.xs),
          Text(
            t.t('cpay.fee.sheet.sub'),
            style: type.bodySmall.copyWith(color: colors.textSecondary),
          ),
          const SizedBox(height: AppSpacing.md),
          FeePayerChips(
            value: _payer,
            t: t,
            onChanged: (v) => setState(() => _payer = v),
          ),
          const SizedBox(height: AppSpacing.xs),
          Text(
            t.t('cpay.fee.rounds', {
              'n': '${r.feePayerRounds + 1}',
              'max': '${r.feePayerMaxRounds}',
            }),
            style: type.caption.copyWith(color: colors.textSecondary),
          ),
          const SizedBox(height: AppSpacing.lg),
          AppButton(
            label: t.t('cpay.fee.sheet.send'),
            icon: AppIcons.handshakeOutlined,
            isLoading: _busy,
            isEnabled: _payer != r.processingFeePayer,
            onPressed: _send,
          ),
        ],
      ),
    );
  }
}
