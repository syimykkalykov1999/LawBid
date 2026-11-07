import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/feature_flags/feature_flags_providers.dart';
import 'package:lawbid/core/l10n/api_error_text.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/features/cases/application/cases_providers.dart';
import 'package:lawbid/features/cases/deals/deal_record_data.dart';
import 'package:lawbid/features/cases/deals/rich_terms_editor.dart';
import 'package:lawbid/features/cases/domain/case_models.dart';
import 'package:lawbid/features/cases/domain/contingency.dart';
import 'package:lawbid/features/cases/presentation/widgets/case_option_picker.dart';

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
  final _amount = TextEditingController();
  final _message = TextEditingController();
  final _rich = RichTermsDraft();
  FeeType? _fee;
  bool _busy = false;

  @override
  void dispose() {
    _amount.dispose();
    _message.dispose();
    _rich.dispose();
    super.dispose();
  }

  bool get _percent => _fee == FeeType.contingency;

  int? get _bps => ContingencyRules.of(
        ref.read(featureFlagsControllerProvider),
      ).parse(_amount.text);

  int? get _cents {
    final v = int.tryParse(_amount.text.trim());
    return v == null || v <= 0 ? null : v * 100;
  }

  bool get _valid =>
      _fee == FeeType.freeConsultation ||
      (_fee != null && (_percent ? _bps != null : _cents != null));

  Future<void> _send() async {
    final t = ref.read(translatorProvider);
    setState(() => _busy = true);
    try {
      await ref.read(caseActionsProvider).changeBid(
            widget.bid,
            feeType: _fee!,
            amountCents:
                _percent || _fee == FeeType.freeConsultation ? null : _cents,
            percentBps: _percent ? _bps : null,
            message: _message.text.trim().isEmpty ? null : _message.text.trim(),
            paymentTerms:
                ref.read(richTermsEnabledProvider) ? _rich.toDto() : null,
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
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
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
          CaseOptionPicker<FeeType>(
            label: t.t('cases.bidForm.feeType'),
            value: _fee,
            options: [
              CaseOption(
                FeeType.fixed,
                t.t('cases.fee.fixed'),
                t.t('cases.pay.fixedHint'),
              ),
              CaseOption(
                FeeType.hourly,
                t.t('cases.fee.hourly'),
                t.t('cases.pay.hourlyHint'),
              ),
              if (widget.percentAllowed)
                CaseOption(
                  FeeType.contingency,
                  t.t('cases.fee.percent'),
                  t.t('cases.pay.percentHint'),
                ),
              if (widget.free)
                CaseOption(
                  FeeType.freeConsultation,
                  t.t('cases.fee.free'),
                  t.t('cases.pay.freeHint'),
                ),
            ],
            onChanged: (v) => setState(() {
              if ((v == FeeType.contingency) != _percent) _amount.clear();
              _fee = v;
            }),
          ),
          if (_fee != null && _fee != FeeType.freeConsultation) ...[
            const SizedBox(height: AppSpacing.md),
            AppTextField(
              key: ValueKey('change-bid-amount-$_percent'),
              controller: _amount,
              label: t.t(
                _percent
                    ? 'cases.bidForm.percent'
                    : _fee == FeeType.hourly
                        ? 'cases.bidForm.rate'
                        : 'cases.bidForm.amount',
              ),
              leading: Text(
                _percent ? '%' : r'$',
                style: type.titleMedium.copyWith(color: colors.goldDark),
              ),
              keyboardType: _percent
                  ? const TextInputType.numberWithOptions(decimal: true)
                  : TextInputType.number,
              inputFormatters: [
                if (_percent)
                  FilteringTextInputFormatter.allow(RegExp('[0-9.,]'))
                else
                  FilteringTextInputFormatter.digitsOnly,
                LengthLimitingTextInputFormatter(_percent ? 6 : 8),
              ],
              onChanged: (_) => setState(() {}),
            ),
          ],
          // Owner 2026-11-05: «$2000 сразу, затем по $1000 в месяц» — the same
          // editor as on the bid form; the new terms replace the old ones.
          if (_fee != null && ref.watch(richTermsEnabledProvider)) ...[
            const SizedBox(height: AppSpacing.lg),
            RichTermsEditor(
              draft: _rich,
              enabled: !_busy,
              percentAllowed: widget.percentAllowed,
              onChanged: () => setState(() {}),
            ),
          ],
          if (_fee != null) ...[
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
        ],
      ),
    );
  }
}
