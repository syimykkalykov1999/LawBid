import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/features/cases/deals/deal_record_format.dart';
import 'package:lawbid_api/lawbid_api.dart' as api;

/// Deal record 2026-10-27: the rich payment terms of a bid (plan §2.3), shown
/// in the bid form only while `bids.rich_terms_enabled`. The classic fee
/// type / amount stay the headline; this adds detail. Amounts are dollars in
/// the fields and cents in the DTO; the API validates the rules per type.
class RichTermsDraft {
  api.PaymentTermsDtoType? type;
  final flat = TextEditingController();
  final rate = TextEditingController();
  final hoursMin = TextEditingController();
  final hoursMax = TextEditingController();
  final percent = TextEditingController();
  final retainer = TextEditingController();
  final installment = TextEditingController();
  final count = TextEditingController();
  api.PaymentTermsDtoInstallmentPeriod period =
      api.PaymentTermsDtoInstallmentPeriod.monthly;
  final notes = TextEditingController();

  void dispose() {
    for (final c in [
      flat,
      rate,
      hoursMin,
      hoursMax,
      percent,
      retainer,
      installment,
      count,
      notes,
    ]) {
      c.dispose();
    }
  }

  static int? _cents(TextEditingController c) {
    final v = int.tryParse(c.text.trim());
    return v == null || v <= 0 ? null : v * 100;
  }

  static int? _int(TextEditingController c) {
    final v = int.tryParse(c.text.trim());
    return v == null || v <= 0 ? null : v;
  }

  static int? _bps(TextEditingController c) {
    final v = double.tryParse(c.text.trim().replaceAll(',', '.'));
    if (v == null || v <= 0 || v > 100) return null;
    return (v * 100).round();
  }

  /// Which fields the chosen type shows.
  bool get showsFlat => type == api.PaymentTermsDtoType.flat || _mixed;
  bool get showsHourly => type == api.PaymentTermsDtoType.hourly || _mixed;
  bool get showsPercent =>
      type == api.PaymentTermsDtoType.contingencyPct || _mixed;
  bool get showsRetainer =>
      type == api.PaymentTermsDtoType.retainerPlusInstallments ||
      type == api.PaymentTermsDtoType.hourly ||
      _mixed;
  bool get showsInstallments =>
      type == api.PaymentTermsDtoType.retainerPlusInstallments || _mixed;
  bool get _mixed => type == api.PaymentTermsDtoType.mixed;

  /// Null when the section is off (no type chosen).
  api.PaymentTermsDto? toDto() {
    final t = type;
    if (t == null) return null;
    final inst = showsInstallments ? _cents(installment) : null;
    final n = showsInstallments ? _int(count) : null;
    final hasInst = inst != null && n != null;
    final note = notes.text.trim();
    return api.PaymentTermsDto(
      version: 1,
      type: t,
      currency: api.PaymentTermsDtoCurrency.usd,
      flatCents: showsFlat ? _cents(flat) : null,
      hourlyRateCents: showsHourly ? _cents(rate) : null,
      estimatedHoursMin: showsHourly ? _int(hoursMin) : null,
      estimatedHoursMax: showsHourly ? _int(hoursMax) : null,
      contingencyBps: showsPercent ? _bps(percent) : null,
      retainerCents: showsRetainer ? _cents(retainer) : null,
      installmentCents: hasInst ? inst : null,
      installmentCount: hasInst ? n : null,
      installmentPeriod: hasInst ? period : null,
      notes: note.isEmpty ? null : note,
    );
  }

  /// The same rules the API checks, so the button is grey until they hold.
  bool get ok {
    final t = type;
    if (t == null) return true;
    switch (t) {
      case api.PaymentTermsDtoType.flat:
        return _cents(flat) != null;
      case api.PaymentTermsDtoType.hourly:
        final a = _int(hoursMin);
        final b = _int(hoursMax);
        return _cents(rate) != null && (a == null || b == null || a <= b);
      case api.PaymentTermsDtoType.contingencyPct:
        return _bps(percent) != null;
      case api.PaymentTermsDtoType.retainerPlusInstallments:
        return _cents(retainer) != null &&
            _cents(installment) != null &&
            _int(count) != null;
      case api.PaymentTermsDtoType.mixed:
        return [_cents(flat), _cents(rate), _bps(percent), _cents(retainer)]
            .any((x) => x != null);
      case api.PaymentTermsDtoType.toBeClarified:
        return true;
      case api.PaymentTermsDtoType.$unknown:
        return false;
    }
  }
}

class RichTermsEditor extends ConsumerWidget {
  const RichTermsEditor({
    required this.draft,
    required this.onChanged,
    this.enabled = true,
    super.key,
  });

  final RichTermsDraft draft;
  final VoidCallback onChanged;
  final bool enabled;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final types = api.PaymentTermsDtoType.values
        .where((x) => x != api.PaymentTermsDtoType.$unknown)
        .toList();
    Widget money(TextEditingController c, String label) => Padding(
          padding: const EdgeInsets.only(top: AppSpacing.md),
          child: AppTextField(
            controller: c,
            label: label,
            enabled: enabled,
            leading: Text(
              r'$',
              style: typography.titleMedium.copyWith(color: colors.goldDark),
            ),
            keyboardType: TextInputType.number,
            inputFormatters: [
              FilteringTextInputFormatter.digitsOnly,
              LengthLimitingTextInputFormatter(8),
            ],
            onChanged: (_) => onChanged(),
          ),
        );
    Widget number(TextEditingController c, String label, {int max = 3}) =>
        Padding(
          padding: const EdgeInsets.only(top: AppSpacing.md),
          child: AppTextField(
            controller: c,
            label: label,
            enabled: enabled,
            keyboardType: TextInputType.number,
            inputFormatters: [
              FilteringTextInputFormatter.digitsOnly,
              LengthLimitingTextInputFormatter(max),
            ],
            onChanged: (_) => onChanged(),
          ),
        );
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(
          t.t('deal.terms.title'),
          style: typography.bodySmall.copyWith(color: colors.textSecondary),
        ),
        const SizedBox(height: AppSpacing.sm),
        DropdownButtonFormField<api.PaymentTermsDtoType?>(
          initialValue: draft.type,
          decoration: InputDecoration(labelText: t.t('deal.row.terms')),
          items: [
            DropdownMenuItem<api.PaymentTermsDtoType?>(
              child: Text(String.fromCharCode(0x2014)),
            ),
            for (final x in types)
              DropdownMenuItem<api.PaymentTermsDtoType?>(
                value: x,
                child: Text(DealRecordFormat.typeLabel(t, x)),
              ),
          ],
          onChanged: enabled
              ? (v) {
                  draft.type = v;
                  onChanged();
                }
              : null,
        ),
        if (draft.showsFlat) money(draft.flat, t.t('cases.bidForm.amount')),
        if (draft.showsHourly) ...[
          money(draft.rate, t.t('cases.bidForm.rate')),
          Row(
            children: [
              Expanded(child: number(draft.hoursMin, 'h min', max: 5)),
              const SizedBox(width: AppSpacing.sm),
              Expanded(child: number(draft.hoursMax, 'h max', max: 5)),
            ],
          ),
        ],
        if (draft.showsPercent)
          Padding(
            padding: const EdgeInsets.only(top: AppSpacing.md),
            child: AppTextField(
              controller: draft.percent,
              label: t.t('deal.terms.type.contingency_pct'),
              enabled: enabled,
              leading: Text(
                '%',
                style: typography.titleMedium.copyWith(color: colors.goldDark),
              ),
              keyboardType:
                  const TextInputType.numberWithOptions(decimal: true),
              inputFormatters: [
                FilteringTextInputFormatter.allow(RegExp('[0-9.,]')),
                LengthLimitingTextInputFormatter(6),
              ],
              onChanged: (_) => onChanged(),
            ),
          ),
        if (draft.showsRetainer)
          money(draft.retainer, t.t('deal.terms.retainer')),
        if (draft.showsInstallments) ...[
          money(draft.installment, t.t('deal.terms.installment')),
          number(draft.count, t.t('deal.terms.count')),
          Padding(
            padding: const EdgeInsets.only(top: AppSpacing.md),
            child:
                DropdownButtonFormField<api.PaymentTermsDtoInstallmentPeriod>(
              initialValue: draft.period,
              items: [
                for (final p
                    in api.PaymentTermsDtoInstallmentPeriod.values.where(
                  (x) => x != api.PaymentTermsDtoInstallmentPeriod.$unknown,
                ))
                  DropdownMenuItem(
                    value: p,
                    child: Text(DealRecordFormat.periodLabel(t, p)),
                  ),
              ],
              onChanged: enabled
                  ? (v) {
                      if (v != null) draft.period = v;
                      onChanged();
                    }
                  : null,
            ),
          ),
        ],
        if (draft.type != null)
          Padding(
            padding: const EdgeInsets.only(top: AppSpacing.md),
            child: AppTextField(
              controller: draft.notes,
              label: t.t('deal.terms.notes'),
              enabled: enabled,
              maxLines: 3,
              maxLength: 1000,
              onChanged: (_) => onChanged(),
            ),
          ),
      ],
    );
  }
}
