import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/api_error_text.dart';
import 'package:lawbid/core/l10n/l10n_formats.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/features/case_payments/application/case_payments_providers.dart';
import 'package:lawbid/features/case_payments/case_payments_routes.dart';
import 'package:lawbid/features/case_payments/domain/case_payment_models.dart';
import 'package:lawbid/features/case_payments/presentation/case_payment_widgets.dart';
import 'package:lawbid/features/cases/presentation/widgets/case_header.dart';
import 'package:lawbid/features/cases/presentation/widgets/case_status.dart';
import 'package:lawbid/features/cases/presentation/widgets/detail_widgets.dart';
import 'package:lawbid/features/team/application/team_providers.dart';

/// Owner 2026-10-05 — "Pay the attorney" on a case with an accepted bid.
/// Client: pay the bid / a deposit / the balance / any amount, see the
/// receipts; attorney: what was received, refunds, a nudge to connect
/// Stripe. Hidden while the `payments_in_app` flag is off.
class CasePaymentsCard extends ConsumerStatefulWidget {
  const CasePaymentsCard({
    required this.caseId,
    required this.asAttorney,
    super.key,
  });

  final String caseId;
  final bool asAttorney;

  @override
  ConsumerState<CasePaymentsCard> createState() => _CasePaymentsCardState();
}

class _CasePaymentsCardState extends ConsumerState<CasePaymentsCard>
    with WidgetsBindingObserver {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  // Back from Stripe's page: the state call checks the open session.
  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      ref.invalidate(casePaymentsStateProvider(widget.caseId));
    }
  }

  void _refresh() => ref.invalidate(casePaymentsStateProvider(widget.caseId));

  Future<void> _cancelPending(CasePayment p) async {
    final t = ref.read(translatorProvider);
    try {
      await ref.read(casePaymentsRepositoryProvider).cancel(p.id);
      _refresh();
    } on Object catch (e) {
      if (mounted) showAppSnackBar(context, errorText(t, e));
    }
  }

  @override
  Widget build(BuildContext context) {
    if (!ref.watch(casePaymentsFlagProvider)) return const SizedBox.shrink();
    final t = ref.watch(translatorProvider);
    final f = ref.watch(l10nFormatsProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final state = ref.watch(casePaymentsStateProvider(widget.caseId)).value;
    if (state == null || !state.enabled) return const SizedBox.shrink();
    final isAssistant = ref.watch(isAssistantProvider);
    final paid = state.items.where((p) => p.status.isPaid).toList();
    final pending = state.items
        .where((p) => p.status == CasePaymentStatus.pendingPayment)
        .toList();
    final shown = state.items.take(5).toList();

    String summary() {
      final bid = state.bidAmountCents;
      final paidText = f.currencyFromCents(state.paidCents);
      if (widget.asAttorney) {
        return t.t('cpay.attorney.received', {'amount': paidText});
      }
      if (bid == null) {
        return state.paidCents > 0
            ? t.t('cpay.client.paidCustom', {'paid': paidText})
            : t.t('cpay.sub');
      }
      if (state.paidCents == 0) {
        return t.t('cpay.client.bidLine', {'amount': f.currencyFromCents(bid)});
      }
      if ((state.remainingCents ?? 0) <= 0) {
        return t.t('cpay.client.paidAll', {'paid': paidText});
      }
      return t.t('cpay.client.paidLine', {
        'paid': paidText,
        'total': f.currencyFromCents(bid),
      });
    }

    final children = <Widget>[
      Text(
        summary(),
        style: type.bodySmall.copyWith(color: colors.textSecondary),
      ),
      if (!widget.asAttorney &&
          state.paidCents > 0 &&
          (state.remainingCents ?? 0) > 0)
        Padding(
          padding: const EdgeInsets.only(top: AppSpacing.xs / 2),
          child: Text(
            t.t('cpay.client.remaining', {
              'amount': f.currencyFromCents(state.remainingCents!),
            }),
            style: type.caption.copyWith(color: colors.goldDark),
          ),
        ),
      // Attorney without a payout account: how to get paid in the app.
      if (widget.asAttorney && !state.attorneyReady) ...[
        const SizedBox(height: AppSpacing.md),
        NoticeCard(
          icon: AppIcons.accountBalanceOutlined,
          message: t.t('cpay.attorney.notReady'),
          action: isAssistant
              ? null
              : AppButton(
                  label: t.t('cpay.attorney.connect'),
                  icon: AppIcons.openInNewRounded,
                  variant: AppButtonVariant.secondary,
                  height: 44,
                  onPressed: () =>
                      context.push(CasePaymentsRoutes.payoutAccount),
                ),
        ),
      ],
      if (!widget.asAttorney && !state.attorneyReady) ...[
        const SizedBox(height: AppSpacing.md),
        NoticeCard(
          icon: AppIcons.infoOutlineRounded,
          tone: StatusTone.neutral,
          message: t.t('cpay.client.notReady'),
        ),
      ],
      if (!widget.asAttorney && pending.isNotEmpty) ...[
        const SizedBox(height: AppSpacing.md),
        NoticeCard(
          icon: AppIcons.hourglassTopRounded,
          tone: StatusTone.info,
          message: t.t('cpay.client.pendingNotice'),
          action: Row(
            children: [
              Expanded(
                child: AppButton(
                  label: t.t('cpay.client.cancelPending'),
                  variant: AppButtonVariant.secondary,
                  height: 44,
                  onPressed: () => _cancelPending(pending.first),
                ),
              ),
            ],
          ),
        ),
      ],
      if (shown.isNotEmpty) ...[
        const SizedBox(height: AppSpacing.md),
        for (final p in shown)
          CasePaymentTile(
            payment: p,
            t: t,
            formats: f,
            asAttorney: widget.asAttorney,
            action: widget.asAttorney && p.refundable && !isAssistant
                ? AppButton(
                    label: t.t('cpay.attorney.refund'),
                    icon: AppIcons.undoRounded,
                    variant: AppButtonVariant.secondary,
                    height: 40,
                    onPressed: () =>
                        RefundSheet.show(context, p, onDone: _refresh),
                  )
                : null,
          ),
      ] else if (widget.asAttorney) ...[
        const SizedBox(height: AppSpacing.sm),
        Text(
          t.t('cpay.attorney.none'),
          style: type.caption.copyWith(color: colors.textSecondary),
        ),
      ],
      if (!widget.asAttorney && state.canPay && pending.isEmpty) ...[
        const SizedBox(height: AppSpacing.md),
        AppButton(
          label: paid.isEmpty
              ? t.t('cpay.client.pay')
              : t.t('cpay.client.payMore'),
          icon: AppIcons.lockOutlineRounded,
          onPressed: () => PaySheet.show(
            context,
            widget.caseId,
            state,
            onStarted: _refresh,
          ),
        ),
      ],
    ];

    return DetailSection(
      title: t.t('cpay.title'),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: children,
      ),
    );
  }
}

/// Client: choose what to pay, see the split, go to Stripe.
class PaySheet extends ConsumerStatefulWidget {
  const PaySheet({
    required this.caseId,
    required this.state,
    required this.onStarted,
    super.key,
  });

  final String caseId;
  final CasePaymentsState state;
  final VoidCallback onStarted;

  static Future<void> show(
    BuildContext context,
    String caseId,
    CasePaymentsState state, {
    required VoidCallback onStarted,
  }) =>
      showAppBottomSheet<void>(
        context: context,
        isScrollControlled: true,
        builder: (_) =>
            PaySheet(caseId: caseId, state: state, onStarted: onStarted),
      );

  @override
  ConsumerState<PaySheet> createState() => _PaySheetState();
}

class _PaySheetState extends ConsumerState<PaySheet> {
  late CasePaymentKind _kind = _defaultKind();
  final _amount = TextEditingController();
  final _note = TextEditingController();
  PaymentQuote? _quote;
  bool _busy = false;
  int _quoteSeq = 0;

  CasePaymentsState get s => widget.state;
  int? get remaining => s.remainingCents;
  bool get fullLeft =>
      s.bidAmountCents != null && remaining == s.bidAmountCents;

  CasePaymentKind _defaultKind() {
    if (s.bidAmountCents == null) return CasePaymentKind.custom;
    if ((remaining ?? 0) <= 0) return CasePaymentKind.custom;
    return fullLeft ? CasePaymentKind.bid : CasePaymentKind.balance;
  }

  List<CasePaymentKind> get _kinds {
    final out = <CasePaymentKind>[];
    final r = remaining ?? 0;
    if (s.bidAmountCents != null && r > 0) {
      out.add(fullLeft ? CasePaymentKind.bid : CasePaymentKind.balance);
      if (s.allowPartial) out.add(CasePaymentKind.deposit);
    }
    if (s.allowCustomAmount || out.isEmpty) out.add(CasePaymentKind.custom);
    return out;
  }

  String _kindLabel(Translator t, L10nFormats f, CasePaymentKind k) {
    final base = casePaymentKindLabel(t, k);
    final fixed = switch (k) {
      CasePaymentKind.bid => s.bidAmountCents,
      CasePaymentKind.balance => remaining,
      _ => null,
    };
    return fixed == null ? base : '$base · ${f.currencyFromCents(fixed)}';
  }

  bool get _needsAmount =>
      _kind == CasePaymentKind.custom || _kind == CasePaymentKind.deposit;

  int? get _enteredCents {
    final v = double.tryParse(_amount.text.replaceAll(',', '.').trim());
    if (v == null || v <= 0) return null;
    return (v * 100).round();
  }

  int? get _amountCents => _needsAmount
      ? _enteredCents
      : _kind == CasePaymentKind.bid
          ? s.bidAmountCents
          : remaining;

  int get _max => _kind == CasePaymentKind.deposit
      ? (remaining ?? s.maxAmountCents)
          .clamp(s.minAmountCents, s.maxAmountCents)
      : s.maxAmountCents;

  bool get _amountOk {
    final a = _amountCents;
    return a != null && a >= s.minAmountCents && a <= _max;
  }

  @override
  void initState() {
    super.initState();
    _refreshQuote();
  }

  @override
  void dispose() {
    _amount.dispose();
    _note.dispose();
    super.dispose();
  }

  Future<void> _refreshQuote() async {
    final a = _amountCents;
    if (a == null || !_amountOk) {
      setState(() => _quote = null);
      return;
    }
    final seq = ++_quoteSeq;
    try {
      final q = await ref.read(casePaymentsRepositoryProvider).quote(a);
      if (mounted && seq == _quoteSeq) setState(() => _quote = q);
    } on Object {
      // The server prices the payment anyway.
    }
  }

  Future<void> _pay() async {
    final t = ref.read(translatorProvider);
    setState(() => _busy = true);
    try {
      final r = await ref.read(casePaymentsRepositoryProvider).pay(
            widget.caseId,
            kind: _kind,
            amountCents: _needsAmount ? _amountCents : null,
            note: _note.text.trim().isEmpty ? null : _note.text.trim(),
          );
      if (!mounted) return;
      widget.onStarted();
      Navigator.of(context).pop();
      await openExternal(r.checkoutUrl);
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
    final settings = ref.watch(paymentSettingsProvider).value;
    final q = _quote;
    final min = f.currencyFromCents(s.minAmountCents);
    final max = f.currencyFromCents(_max);
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
              t.t('cpay.sheet.title'),
              style: type.titleMedium.copyWith(color: colors.text),
            ),
            const SizedBox(height: AppSpacing.xs),
            Text(
              t.t('cpay.sub'),
              style: type.bodySmall.copyWith(color: colors.textSecondary),
            ),
            if (_kinds.length > 1) ...[
              const SizedBox(height: AppSpacing.lg),
              Text(
                t.t('cpay.sheet.what'),
                style: type.caption.copyWith(color: colors.textSecondary),
              ),
              const SizedBox(height: AppSpacing.sm),
              Wrap(
                spacing: AppSpacing.sm,
                runSpacing: AppSpacing.sm,
                children: [
                  for (final k in _kinds)
                    _KindChip(
                      label: _kindLabel(t, f, k),
                      selected: _kind == k,
                      onTap: () {
                        setState(() => _kind = k);
                        _refreshQuote();
                      },
                    ),
                ],
              ),
            ],
            if (_needsAmount) ...[
              const SizedBox(height: AppSpacing.lg),
              AppTextField(
                controller: _amount,
                label: t.t('cpay.sheet.amount'),
                helperText:
                    t.t('cpay.sheet.amountHint', {'min': min, 'max': max}),
                errorText: _amount.text.isNotEmpty && !_amountOk
                    ? t.t('cpay.sheet.amountInvalid', {'min': min, 'max': max})
                    : null,
                keyboardType:
                    const TextInputType.numberWithOptions(decimal: true),
                inputFormatters: [
                  FilteringTextInputFormatter.allow(RegExp('[0-9.,]')),
                ],
                onChanged: (_) {
                  setState(() {});
                  _refreshQuote();
                },
              ),
            ],
            const SizedBox(height: AppSpacing.md),
            AppTextField(
              controller: _note,
              label: t.t('cpay.sheet.note'),
              maxLength: 300,
              maxLines: 2,
              textCapitalization: TextCapitalization.sentences,
            ),
            if (q != null) ...[
              const SizedBox(height: AppSpacing.md),
              _Line(
                text: t.t('cpay.sheet.attorneyGets', {
                  'amount': f.currencyFromCents(q.attorneyNetCents),
                }),
                style: type.bodySmall.copyWith(color: colors.textSecondary),
              ),
              if (q.platformFeeCents > 0)
                _Line(
                  text: t.t('cpay.sheet.platformFee', {
                    'amount': f.currencyFromCents(q.platformFeeCents),
                  }),
                  style: type.caption.copyWith(color: colors.textSecondary),
                ),
              if (q.processingFeeCents > 0)
                _Line(
                  text: t.t('cpay.sheet.processingFee', {
                    'amount': f.currencyFromCents(q.processingFeeCents),
                  }),
                  style: type.caption.copyWith(color: colors.textSecondary),
                ),
              _Line(
                text: t.t('cpay.sheet.youPay', {
                  'amount': f.currencyFromCents(q.clientTotalCents),
                }),
                style: type.titleMedium.copyWith(color: colors.text),
              ),
            ],
            if (settings != null) ...[
              const SizedBox(height: AppSpacing.md),
              PaymentDisclaimer(text: settings.disclaimer(f.locale), t: t),
            ],
            const SizedBox(height: AppSpacing.md),
            AppButton(
              label: t.t('cpay.sheet.pay'),
              icon: AppIcons.lockOutlineRounded,
              isLoading: _busy,
              isEnabled: _amountOk,
              onPressed: _pay,
            ),
          ],
        ),
      ),
    );
  }
}

class _Line extends StatelessWidget {
  const _Line({required this.text, required this.style});
  final String text;
  final TextStyle style;
  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(top: AppSpacing.xs / 2),
        child: Text(text, style: style),
      );
}

class _KindChip extends StatelessWidget {
  const _KindChip({
    required this.label,
    required this.selected,
    required this.onTap,
  });
  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    return Semantics(
      button: true,
      selected: selected,
      child: InkWell(
        borderRadius: BorderRadius.circular(AppRadii.pill),
        onTap: onTap,
        child: Container(
          constraints: const BoxConstraints(minHeight: 40),
          padding: const EdgeInsets.symmetric(
            horizontal: AppSpacing.md,
            vertical: AppSpacing.sm,
          ),
          decoration: BoxDecoration(
            color: selected ? colors.goldTint : colors.surface,
            borderRadius: BorderRadius.circular(AppRadii.pill),
            border: Border.all(
              color: selected ? colors.goldStroke : colors.border,
            ),
          ),
          child: Text(
            label,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: type.bodySmall.copyWith(
              color: selected ? colors.goldDark : colors.text,
              fontWeight: FontWeight.w600,
            ),
          ),
        ),
      ),
    );
  }
}

/// Attorney: give money back, fully or in part, with a reason.
class RefundSheet extends ConsumerStatefulWidget {
  const RefundSheet({
    required this.payment,
    required this.onDone,
    super.key,
  });

  final CasePayment payment;
  final VoidCallback onDone;

  static Future<void> show(
    BuildContext context,
    CasePayment payment, {
    required VoidCallback onDone,
  }) =>
      showAppBottomSheet<void>(
        context: context,
        isScrollControlled: true,
        builder: (_) => RefundSheet(payment: payment, onDone: onDone),
      );

  @override
  ConsumerState<RefundSheet> createState() => _RefundSheetState();
}

class _RefundSheetState extends ConsumerState<RefundSheet> {
  final _amount = TextEditingController();
  final _reason = TextEditingController();
  bool _busy = false;

  int get _left =>
      widget.payment.clientTotalCents - widget.payment.refundedCents;

  int? get _cents {
    if (_amount.text.trim().isEmpty) return _left;
    final v = double.tryParse(_amount.text.replaceAll(',', '.').trim());
    if (v == null || v <= 0) return null;
    return (v * 100).round();
  }

  bool get _ok =>
      _cents != null &&
      _cents! >= 50 &&
      _cents! <= _left &&
      _reason.text.trim().length >= 3;

  @override
  void dispose() {
    _amount.dispose();
    _reason.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final t = ref.read(translatorProvider);
    setState(() => _busy = true);
    try {
      await ref.read(casePaymentsRepositoryProvider).refund(
            widget.payment.id,
            amountCents: _amount.text.trim().isEmpty ? null : _cents,
            reason: _reason.text.trim(),
          );
      if (!mounted) return;
      widget.onDone();
      Navigator.of(context).pop();
      showAppSnackBar(context, t.t('cpay.refund.done'));
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
              t.t('cpay.refund.title'),
              style: type.titleMedium.copyWith(color: colors.text),
            ),
            const SizedBox(height: AppSpacing.xs),
            Text(
              t.t('cpay.refund.sub'),
              style: type.bodySmall.copyWith(color: colors.textSecondary),
            ),
            const SizedBox(height: AppSpacing.lg),
            AppTextField(
              controller: _amount,
              label: t.t('cpay.refund.amount'),
              hintText: (_left / 100).toStringAsFixed(2),
              keyboardType:
                  const TextInputType.numberWithOptions(decimal: true),
              inputFormatters: [
                FilteringTextInputFormatter.allow(RegExp('[0-9.,]')),
              ],
              onChanged: (_) => setState(() {}),
            ),
            const SizedBox(height: AppSpacing.md),
            AppTextField(
              controller: _reason,
              label: t.t('cpay.refund.reason'),
              helperText:
                  _reason.text.isNotEmpty && _reason.text.trim().length < 3
                      ? t.t('cpay.refund.reasonShort')
                      : null,
              maxLength: 500,
              maxLines: 3,
              textCapitalization: TextCapitalization.sentences,
              onChanged: (_) => setState(() {}),
            ),
            const SizedBox(height: AppSpacing.md),
            AppButton(
              label: t.t('cpay.refund.confirm', {
                'amount': f.currencyFromCents(_cents ?? _left),
              }),
              icon: AppIcons.undoRounded,
              isLoading: _busy,
              isEnabled: _ok,
              onPressed: _submit,
            ),
          ],
        ),
      ),
    );
  }
}
