import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/api_error_text.dart';
import 'package:lawbid/core/l10n/l10n_formats.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/features/cases/application/cases_providers.dart';
import 'package:lawbid/features/cases/data/cases_repository.dart';
import 'package:lawbid/features/cases/domain/case_models.dart';
import 'package:lawbid/features/cases/presentation/screens/attorney_case_screen.dart';
import 'package:lawbid/features/cases/presentation/widgets/case_wizard_steps.dart';
import 'package:lawbid/features/cases/presentation/widgets/detail_widgets.dart';
import 'package:lawbid/core/navigation/app_routes.dart';

/// docs/04 §5.1 limits.
abstract final class BidLimits {
  static const messageMin = 20;
  static const messageMax = 2000;
  static const amountMaxDollars = 10000000;
  static const durationMax = 3650;
}

/// docs/04 §5.1 — "Сделать бид": fee type, amount (hidden for a free
/// consultation), message, start, optional duration.
class BidFormScreen extends ConsumerStatefulWidget {
  const BidFormScreen({required this.caseId, super.key});

  final String caseId;

  @override
  ConsumerState<BidFormScreen> createState() => _BidFormScreenState();
}

class _BidFormScreenState extends ConsumerState<BidFormScreen> {
  FeeType _fee = FeeType.fixed;
  StartAvailability _start = StartAvailability.immediately;
  DateTime? _startDate;
  final _amount = TextEditingController();
  final _message = TextEditingController();
  final _duration = TextEditingController();
  bool _busy = false;
  String? _error;

  int? get _amountDollars => int.tryParse(_amount.text);

  bool get _amountOk =>
      _fee == FeeType.freeConsultation ||
      (_amountDollars != null &&
          _amountDollars! > 0 &&
          _amountDollars! <= BidLimits.amountMaxDollars);

  bool get _messageOk {
    final n = _message.text.trim().length;
    return n >= BidLimits.messageMin && n <= BidLimits.messageMax;
  }

  bool get _startOk =>
      _start != StartAvailability.customDate || _startDate != null;

  bool get _durationOk {
    if (_duration.text.isEmpty) return true;
    final n = int.tryParse(_duration.text);
    return n != null && n >= 1 && n <= BidLimits.durationMax;
  }

  bool get _valid => _amountOk && _messageOk && _startOk && _durationOk;

  @override
  void dispose() {
    _amount.dispose();
    _message.dispose();
    _duration.dispose();
    super.dispose();
  }

  Future<void> _pickDate() async {
    final now = DateTime.now();
    final picked = await showDatePicker(
      context: context,
      initialDate: _startDate ?? now,
      firstDate: DateTime(now.year, now.month, now.day),
      lastDate: now.add(const Duration(days: 365 * 2)),
    );
    if (picked != null) setState(() => _startDate = picked);
  }

  Future<void> _submit() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    final t = ref.read(translatorProvider);
    try {
      final bid = await ref.read(caseActionsProvider).placeBid(
            widget.caseId,
            BidInput(
              feeType: _fee,
              amountCents: _fee == FeeType.freeConsultation
                  ? null
                  : _amountDollars! * 100,
              message: _message.text,
              startAvailability: _start,
              startDate: _startDate,
              estimatedDurationDays: int.tryParse(_duration.text),
            ),
          );
      if (!mounted) return;
      showAppSnackBar(context, t.t('cases.bidForm.sent'));
      context.pushReplacement(AppRoutes.bid(bid.id));
    } on Object catch (e) {
      if (!mounted) return;
      if (routeSubscriptionError(context, e, reason: 'bid')) {
        setState(() => _busy = false);
        return;
      }
      setState(() {
        _busy = false;
        _error = errorText(t, e);
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = ref.watch(translatorProvider);
    final formats = ref.watch(l10nFormatsProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    final free = _fee == FeeType.freeConsultation;
    return Scaffold(
      backgroundColor: colors.bg,
      appBar: AppTopBar(
        leading: AppBackButton(
            semanticLabel: t.t('common.back'), onPressed: () => context.pop()),
        title: Text(t.t('cases.bidForm.title')),
      ),
      body: ListView(
        padding: kDetailPadding,
        children: [
          WizardHeading(
            title: t.t('cases.bidForm.heading'),
            subtitle: t.t('cases.bidForm.subtitle'),
          ),
          Text(t.t('cases.bidForm.feeType'),
              style:
                  typography.bodySmall.copyWith(color: colors.textSecondary)),
          const SizedBox(height: AppSpacing.sm),
          SegmentedChoice<FeeType>(
            value: _fee,
            options: [
              (FeeType.fixed, t.t('cases.fee.fixed')),
              (FeeType.hourly, t.t('cases.fee.hourly')),
              (FeeType.freeConsultation, t.t('cases.fee.freeShort')),
            ],
            onChanged: (v) => setState(() => _fee = v),
          ),
          AnimatedSize(
            duration:
                context.reduceMotion ? Duration.zero : AppMotion.stateChange,
            curve: AppMotion.enterCurve,
            child: free
                ? const SizedBox(width: double.infinity)
                : Padding(
                    padding: const EdgeInsets.only(top: AppSpacing.lg),
                    child: AppTextField(
                      controller: _amount,
                      label: t.t(_fee == FeeType.hourly
                          ? 'cases.bidForm.rate'
                          : 'cases.bidForm.amount'),
                      leading: Text('\$',
                          style: typography.titleMedium
                              .copyWith(color: colors.goldDark)),
                      keyboardType: TextInputType.number,
                      inputFormatters: [
                        FilteringTextInputFormatter.digitsOnly,
                        LengthLimitingTextInputFormatter(8),
                      ],
                      errorText: _amount.text.isNotEmpty && !_amountOk
                          ? t.t('cases.bidForm.amountError')
                          : null,
                      onChanged: (_) => setState(() {}),
                    ),
                  ),
          ),
          const SizedBox(height: AppSpacing.lg),
          AppTextField(
            controller: _message,
            label: t.t('cases.bidForm.message'),
            hintText: t.t('cases.bidForm.messageHint'),
            maxLines: 6,
            maxLength: BidLimits.messageMax,
            textCapitalization: TextCapitalization.sentences,
            errorText: _message.text.isNotEmpty && !_messageOk
                ? t.t('cases.bidForm.messageError',
                    {'min': '${BidLimits.messageMin}'})
                : null,
            onChanged: (_) => setState(() {}),
          ),
          const SizedBox(height: AppSpacing.lg),
          Text(t.t('cases.bidForm.start'),
              style:
                  typography.bodySmall.copyWith(color: colors.textSecondary)),
          const SizedBox(height: AppSpacing.sm),
          Wrap(
            spacing: AppSpacing.sm,
            runSpacing: AppSpacing.sm,
            children: [
              for (final (s, key) in [
                (StartAvailability.immediately, 'cases.start.immediately'),
                (StartAvailability.withinWeek, 'cases.start.withinWeek'),
                (StartAvailability.customDate, 'cases.start.pickDate'),
              ])
                AppChip(
                  label: s == StartAvailability.customDate && _startDate != null
                      ? formats.date(_startDate!)
                      : t.t(key),
                  selected: _start == s,
                  onTap: () {
                    setState(() => _start = s);
                    if (s == StartAvailability.customDate) _pickDate();
                  },
                ),
            ],
          ),
          const SizedBox(height: AppSpacing.lg),
          AppTextField(
            controller: _duration,
            label: t.t('cases.bidForm.duration'),
            hintText: t.t('cases.bidForm.durationHint'),
            keyboardType: TextInputType.number,
            inputFormatters: [
              FilteringTextInputFormatter.digitsOnly,
              LengthLimitingTextInputFormatter(4),
            ],
            errorText: _durationOk ? null : t.t('cases.bidForm.durationError'),
            onChanged: (_) => setState(() {}),
          ),
          if (_error != null) ...[
            const SizedBox(height: AppSpacing.lg),
            Semantics(
              liveRegion: true,
              child: Text(_error!,
                  style:
                      typography.bodySmall.copyWith(color: colors.dangerText)),
            ),
          ],
        ],
      ),
      bottomNavigationBar: BottomActionBar(
        children: [
          GavelStrikeButton(
            label: t.t('cases.bidForm.submit'),
            strike: true,
            isLoading: _busy,
            isEnabled: _valid,
            onPressed: _submit,
          ),
        ],
      ),
    );
  }
}
