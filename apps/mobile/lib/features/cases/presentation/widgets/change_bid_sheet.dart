import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/feature_flags/feature_flags_providers.dart';
import 'package:lawbid/core/l10n/api_error_text.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/features/cases/application/cases_providers.dart';
import 'package:lawbid/features/cases/deals/deal_record_data.dart';
import 'package:lawbid/features/cases/deals/pay_block.dart';
import 'package:lawbid/features/cases/domain/case_models.dart';
import 'package:lawbid/features/cases/domain/contingency.dart';

/// Owner 2026-11-05: «Поменять бид». The list starts empty, the current terms
/// are on the «Изменения» screen behind it. [free]: the client changed the
/// case, so a free consultation is possible and no round is spent.
Future<void> showChangeBidSheet(
  BuildContext context, {
  required CaseBid bid,
  required bool free,
  required bool percentAllowed,
}) =>
    showAppBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      builder: (_) => _ChangeBidSheet(
        bid: bid,
        free: free,
        percentAllowed: percentAllowed,
      ),
    );

class _ChangeBidSheet extends ConsumerStatefulWidget {
  const _ChangeBidSheet({
    required this.bid,
    required this.free,
    required this.percentAllowed,
  });

  final CaseBid bid;
  final bool free;
  final bool percentAllowed;

  @override
  ConsumerState<_ChangeBidSheet> createState() => _ChangeBidSheetState();
}

class _ChangeBidSheetState extends ConsumerState<_ChangeBidSheet> {
  // Owner 2026-11-07: the same «Оплата» tiles as on the bid form; the new
  // terms replace the old ones.
  final _pay = PayDraft();
  final _message = TextEditingController();
  bool _busy = false;

  @override
  void dispose() {
    _message.dispose();
    _pay.dispose();
    super.dispose();
  }

  ContingencyRules get _rules =>
      ContingencyRules.of(ref.read(featureFlagsControllerProvider));

  bool get _valid => _pay.ok(
        rules: _rules,
        richOn: ref.read(richTermsEnabledProvider),
      );

  Future<void> _send() async {
    final t = ref.read(translatorProvider);
    setState(() => _busy = true);
    try {
      await ref.read(caseActionsProvider).changeBid(
            widget.bid,
            feeType: _pay.feeType,
            amountCents: _pay.amountCents,
            percentBps: _pay.percentBps(_rules),
            message: _message.text.trim().isEmpty ? null : _message.text.trim(),
            paymentTerms: _pay.terms(
              richOn: ref.read(richTermsEnabledProvider),
              percentAllowed: widget.percentAllowed,
            ),
          );
      if (mounted) Navigator.of(context).pop();
    } on Object catch (e) {
      if (mounted) {
        setState(() => _busy = false);
        showAppSnackBar(context, errorText(t, e));
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = ref.watch(translatorProvider);
    final richOn = ref.watch(richTermsEnabledProvider);
    // «Рассрочка» / «Смешанно» need the detailed terms, «Процент» a topic that
    // allows it, «Бесплатно» a client who changed the case: back to «Сумма».
    final gone = (!widget.percentAllowed && _pay.kind == PayKind.percent) ||
        (!richOn &&
            (_pay.kind == PayKind.installments ||
                _pay.kind == PayKind.mixed)) ||
        (!widget.free && _pay.kind == PayKind.free);
    if (gone) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) setState(() => _pay.select(PayKind.flat));
      });
    }
    return SingleChildScrollView(
      padding: EdgeInsets.fromLTRB(
        AppSpacing.screenSide,
        AppSpacing.md,
        AppSpacing.screenSide,
        MediaQuery.viewInsetsOf(context).bottom + AppSpacing.lg,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const AppSheetHandle(),
          const SizedBox(height: AppSpacing.md),
          PayBlock(
            draft: _pay,
            rules: ContingencyRules.of(
              ref.watch(featureFlagsControllerProvider),
            ),
            richOn: richOn,
            percentAllowed: widget.percentAllowed,
            showFree: widget.free,
            enabled: !_busy,
            showErrors: false,
            onChanged: () => setState(() {}),
          ),
          const SizedBox(height: AppSpacing.md),
          AppTextField(
            controller: _message,
            label: t.t('cases.counter.message'),
            maxLines: 3,
            maxLength: 2000,
          ),
          const SizedBox(height: AppSpacing.md),
          AppButton(
            key: const ValueKey('change-bid-send'),
            label: t.t('cases.changes.change'),
            isEnabled: _valid,
            isLoading: _busy,
            onPressed: _send,
          ),
        ],
      ),
    );
  }
}
