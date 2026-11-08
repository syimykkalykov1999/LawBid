import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/features/cases/deals/deal_record_format.dart';
import 'package:lawbid/features/cases/deals/rich_terms_editor.dart';
import 'package:lawbid/features/cases/domain/case_models.dart';
import 'package:lawbid/features/cases/domain/contingency.dart';
import 'package:lawbid/features/cases/presentation/widgets/case_wizard_steps.dart';
import 'package:lawbid/features/cases/presentation/widgets/pay_tile_grid.dart';
import 'package:lawbid_api/lawbid_api.dart' as api;

/// Owner 2026-11-07 (prototype `bid_prototype.html`): the six ways an
/// attorney can ask to be paid, as tiles of ONE «Оплата» block.
enum PayKind { flat, hourly, installments, percent, mixed, free }

/// The state of the merged «Оплата» block of the bid form and of «Поменять
/// бид». It owns the fields of the rich payment terms ([RichTermsDraft]) and
/// turns the chosen tile into the SAME request the two old blocks (fee type +
/// amount, and the detailed terms) used to build:
///
/// * Сумма: fixed + amount (+ terms `flat`);
/// * Почасово: hourly + rate (+ terms `hourly`);
/// * Процент: contingency + percent (+ terms `contingency_pct`);
/// * Рассрочка: fixed, headline amount = retainer + payment × count
///   (+ terms `retainer_plus_installments`);
/// * Смешанно: fixed with that headline, or contingency when the percent is
///   the only part (+ terms `mixed`);
/// * Бесплатно: free consultation, no terms.
///
/// The detailed terms go out only while `bids.rich_terms_enabled` is on.
class PayDraft {
  PayDraft({this.kind = PayKind.flat});

  PayKind kind;
  final rich = RichTermsDraft();

  void dispose() => rich.dispose();

  /// The tile list: «Рассрочка» and «Смешанно» need the detailed terms,
  /// «Процент» a topic that allows it, «Бесплатно» is optional (a change of
  /// a bid offers it only after the client changed the case).
  static List<PayKind> available({
    required bool richOn,
    required bool percentAllowed,
    bool free = true,
  }) =>
      [
        PayKind.flat,
        PayKind.hourly,
        if (richOn) PayKind.installments,
        if (percentAllowed) PayKind.percent,
        if (richOn) PayKind.mixed,
        if (free) PayKind.free,
      ];

  /// The tile a saved fee type stands on.
  static PayKind kindOfFee(FeeType fee) => switch (fee) {
        FeeType.fixed => PayKind.flat,
        FeeType.hourly => PayKind.hourly,
        FeeType.contingency => PayKind.percent,
        FeeType.freeConsultation => PayKind.free,
        _ => PayKind.flat,
      };

  TextEditingController _mainOf(PayKind k) => switch (k) {
        PayKind.hourly => rich.rate,
        PayKind.percent => rich.percent,
        _ => rich.flat,
      };

  List<TextEditingController> _fieldsOf(PayKind k) => switch (k) {
        PayKind.flat => [rich.flat],
        PayKind.hourly => [
            rich.rate,
            rich.hoursMin,
            rich.hoursMax,
            rich.retainer,
          ],
        PayKind.percent => [rich.percent],
        PayKind.installments => [
            rich.retainer,
            rich.installment,
            rich.count,
          ],
        // «Смешанно» reaches every field of the old editor's mixed type.
        PayKind.mixed => [
            rich.flat,
            rich.rate,
            rich.hoursMin,
            rich.hoursMax,
            rich.retainer,
            rich.installment,
            rich.count,
            rich.percent,
          ],
        PayKind.free => [],
      };

  /// Picks a tile. What was typed for a field the new tile does not show is
  /// dropped (so it can never leak into the request); an amount carries over
  /// between «Сумма» and «Почасово».
  void select(PayKind next) {
    if (next == kind) return;
    final carry = (kind == PayKind.flat && next == PayKind.hourly) ||
            (kind == PayKind.hourly && next == PayKind.flat)
        ? _mainOf(kind).text
        : null;
    final keep = _fieldsOf(next);
    for (final c in [
      rich.flat,
      rich.rate,
      rich.percent,
      rich.hoursMin,
      rich.hoursMax,
      rich.retainer,
      rich.installment,
      rich.count,
    ]) {
      if (!keep.contains(c)) c.clear();
    }
    if (carry != null) _mainOf(next).text = carry;
    kind = next;
  }

  /// The text of the single main field of «Сумма», «Почасово», «Процент».
  TextEditingController get main => _mainOf(kind);

  static int? _pos(TextEditingController c) {
    final v = int.tryParse(c.text.trim());
    return v == null || v <= 0 ? null : v;
  }

  /// A retainer plus the instalments (and, in «Смешанно», the flat part).
  int? get _total {
    final f = kind == PayKind.mixed ? _pos(rich.flat) : null;
    final r = _pos(rich.retainer);
    final i = _pos(rich.installment);
    final n = _pos(rich.count);
    final sum = (f ?? 0) + (r ?? 0) + (i != null && n != null ? i * n : 0);
    return sum > 0 ? sum : null;
  }

  /// The headline amount in dollars of the classic fee type (null: none).
  int? get headlineDollars => switch (kind) {
        PayKind.flat => _pos(rich.flat),
        PayKind.hourly => _pos(rich.rate),
        PayKind.installments => _total,
        // The fixed parts first; else the hourly rate; else only a percent.
        PayKind.mixed => _total ?? _pos(rich.rate),
        _ => null,
      };

  FeeType get feeType => switch (kind) {
        PayKind.flat || PayKind.installments => FeeType.fixed,
        PayKind.hourly => FeeType.hourly,
        PayKind.percent => FeeType.contingency,
        PayKind.mixed => _total != null
            ? FeeType.fixed
            : _pos(rich.rate) != null
                ? FeeType.hourly
                : FeeType.contingency,
        PayKind.free => FeeType.freeConsultation,
      };

  /// Cents of the headline; null for a percent and a free consultation.
  int? get amountCents {
    final f = feeType;
    if (f == FeeType.contingency || f == FeeType.freeConsultation) return null;
    final h = headlineDollars;
    return h == null ? null : h * 100;
  }

  /// Basis points of a contingency bid; null otherwise.
  int? percentBps(ContingencyRules rules) =>
      feeType == FeeType.contingency ? rules.parse(rich.percent.text) : null;

  bool get _hasPercentText => rich.percent.text.trim().isNotEmpty;

  /// The same checks the two old blocks made, so the button is grey until
  /// they hold. [maxDollars]: the form's ceiling for the headline.
  bool ok({
    required ContingencyRules rules,
    required bool richOn,
    int? maxDollars,
  }) {
    final h = headlineDollars;
    final withinMax = h != null && (maxDollars == null || h <= maxDollars);
    switch (kind) {
      case PayKind.free:
        return true;
      case PayKind.flat:
        return withinMax && _termsOk(richOn);
      case PayKind.hourly:
        return withinMax && _hoursOk && _termsOk(richOn);
      case PayKind.percent:
        return rules.parse(rich.percent.text) != null && _termsOk(richOn);
      case PayKind.installments:
        return withinMax && _termsOk(richOn);
      case PayKind.mixed:
        final pctOk = rules.parse(rich.percent.text) != null;
        if (_hasPercentText && !pctOk) return false;
        if (!_hoursOk) return false;
        if (h != null) return withinMax;
        return pctOk;
    }
  }

  /// Hours need a rate, and «from» may not exceed «to» (the API's rules).
  bool get _hoursOk {
    final a = _pos(rich.hoursMin);
    final b = _pos(rich.hoursMax);
    if ((a != null || b != null) && _pos(rich.rate) == null) return false;
    return a == null || b == null || a <= b;
  }

  bool _termsOk(bool richOn) {
    if (!richOn) return true;
    rich.type = _termsType;
    return rich.ok;
  }

  api.PaymentTermsDtoType? get _termsType => switch (kind) {
        PayKind.flat => api.PaymentTermsDtoType.flat,
        PayKind.hourly => api.PaymentTermsDtoType.hourly,
        PayKind.installments =>
          api.PaymentTermsDtoType.retainerPlusInstallments,
        PayKind.percent => api.PaymentTermsDtoType.contingencyPct,
        PayKind.mixed => api.PaymentTermsDtoType.mixed,
        PayKind.free => null,
      };

  /// The detailed terms for the request; null while the switch is off and for
  /// a free consultation.
  api.PaymentTermsDto? terms({
    required bool richOn,
    required bool percentAllowed,
  }) {
    if (!richOn || kind == PayKind.free) return null;
    if (!percentAllowed) rich.percent.clear();
    rich.type = _termsType;
    return rich.toDto();
  }
}

/// The merged «Оплата» block: the title, the tiles, and only the chosen
/// tile's fields once. Used by the bid form and by «Поменять бид».
class PayBlock extends ConsumerWidget {
  const PayBlock({
    required this.draft,
    required this.rules,
    required this.richOn,
    required this.percentAllowed,
    required this.onChanged,
    this.showFree = true,
    this.enabled = true,
    this.showErrors = true,
    this.showTitle = true,
    this.maxDollars,
    super.key,
  });

  final PayDraft draft;
  final ContingencyRules rules;
  final bool richOn;
  final bool percentAllowed;
  final bool showFree;
  final bool enabled;

  /// Error lines under a main field that has text but does not pass.
  final bool showErrors;
  final bool showTitle;
  final int? maxDollars;
  final VoidCallback onChanged;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final kinds = PayDraft.available(
      richOn: richOn,
      percentAllowed: percentAllowed,
      free: showFree,
    );
    final kind = draft.kind;

    PayTile<PayKind> tile(PayKind k) => switch (k) {
          PayKind.flat => PayTile(
              value: k,
              name: 'flat',
              glyph: r'$',
              label: t.t('cases.pay.tile.fixed'),
              hint: t.t('cases.pay.fixedHint'),
            ),
          PayKind.hourly => PayTile(
              value: k,
              name: 'hourly',
              icon: AppIcons.timerOutlined,
              label: t.t('cases.pay.tile.hourly'),
              hint: t.t('cases.pay.hourlyHint'),
            ),
          PayKind.installments => PayTile(
              value: k,
              name: 'installments',
              icon: AppIcons.eventRepeatRounded,
              label: t.t('cases.pay.tile.installments'),
              hint: t.t('cases.pay.retainerHint'),
            ),
          PayKind.percent => PayTile(
              value: k,
              name: 'percent',
              glyph: '%',
              label: t.t('cases.pay.tile.percent'),
              hint: t.t('cases.pay.percentHint'),
            ),
          PayKind.mixed => PayTile(
              value: k,
              name: 'mixed',
              icon: AppIcons.addRounded,
              label: t.t('cases.pay.tile.mixed'),
              hint: t.t('cases.pay.mixedHint'),
            ),
          PayKind.free => PayTile(
              value: k,
              name: 'free',
              icon: AppIcons.giftOutlined,
              label: t.t('cases.pay.tile.free'),
              hint: t.t('cases.pay.freeHint'),
            ),
        };

    Widget gap(Widget w) => Padding(
          padding: const EdgeInsets.only(top: AppSpacing.md),
          child: w,
        );
    Widget money(
      String name,
      TextEditingController c,
      String label, {
      String? errorText,
    }) =>
        gap(
          AppTextField(
            key: ValueKey('pay-field-$name'),
            controller: c,
            label: label,
            enabled: enabled,
            errorText: errorText,
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
    Widget percent({String? errorText, bool helper = true}) => gap(
          AppTextField(
            key: const ValueKey('pay-field-percent'),
            controller: draft.rich.percent,
            label: t.t('cases.bidForm.percent'),
            helperText: helper ? t.t('cases.bidForm.percentHint') : null,
            enabled: enabled,
            errorText: errorText,
            leading: Text(
              '%',
              style: typography.titleMedium.copyWith(color: colors.goldDark),
            ),
            keyboardType: const TextInputType.numberWithOptions(decimal: true),
            inputFormatters: [
              FilteringTextInputFormatter.allow(RegExp('[0-9.,]')),
              LengthLimitingTextInputFormatter(6),
            ],
            onChanged: (_) => onChanged(),
          ),
        );
    Widget number(String name, TextEditingController c, String label) => gap(
          AppTextField(
            key: ValueKey('pay-field-$name'),
            controller: c,
            label: label,
            enabled: enabled,
            keyboardType: TextInputType.number,
            inputFormatters: [
              FilteringTextInputFormatter.digitsOnly,
              LengthLimitingTextInputFormatter(5),
            ],
            onChanged: (_) => onChanged(),
          ),
        );
    // Owner 2026-11-07: rate, hours from / to (the old editor's fields).
    Widget hours() => Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(
              child: number(
                'hoursMin',
                draft.rich.hoursMin,
                t.t('cases.pay.hoursFrom'),
              ),
            ),
            const SizedBox(width: AppSpacing.sm),
            Expanded(
              child: number(
                'hoursMax',
                draft.rich.hoursMax,
                t.t('cases.pay.hoursTo'),
              ),
            ),
          ],
        );
    Widget installments() => Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            money('retainer', draft.rich.retainer, t.t('deal.terms.retainer')),
            money(
              'installment',
              draft.rich.installment,
              t.t('deal.terms.installment'),
            ),
            gap(
              AppTextField(
                key: const ValueKey('pay-field-count'),
                controller: draft.rich.count,
                label: t.t('deal.terms.count'),
                enabled: enabled,
                keyboardType: TextInputType.number,
                inputFormatters: [
                  FilteringTextInputFormatter.digitsOnly,
                  LengthLimitingTextInputFormatter(3),
                ],
                onChanged: (_) => onChanged(),
              ),
            ),
            // Owner 2026-11-05: the period is a strip of three parts.
            gap(
              SegmentedChoice<api.PaymentTermsDtoInstallmentPeriod>(
                value: draft.rich.period,
                options: [
                  for (final p
                      in api.PaymentTermsDtoInstallmentPeriod.values.where(
                    (x) => x != api.PaymentTermsDtoInstallmentPeriod.$unknown,
                  ))
                    (p, DealRecordFormat.periodLabel(t, p)),
                ],
                onChanged: (v) {
                  if (!enabled) return;
                  draft.rich.period = v;
                  onChanged();
                },
              ),
            ),
          ],
        );

    final main = draft.main.text;
    final badAmount = showErrors &&
        main.isNotEmpty &&
        (kind == PayKind.flat || kind == PayKind.hourly) &&
        !draft.ok(rules: rules, richOn: false, maxDollars: maxDollars);
    final badPercent = showErrors &&
        main.isNotEmpty &&
        kind == PayKind.percent &&
        rules.parse(main) == null;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (showTitle) ...[
          Text(
            t.t('pay.title'),
            style: typography.bodySmall.copyWith(color: colors.textSecondary),
          ),
          const SizedBox(height: AppSpacing.sm),
        ],
        PayTileGrid<PayKind>(
          tiles: [for (final k in kinds) tile(k)],
          value: kind,
          enabled: enabled,
          onChanged: (k) {
            draft.select(k);
            onChanged();
          },
        ),
        AnimatedSize(
          duration: context.sizeChangeDuration,
          curve: AppMotion.enterCurve,
          alignment: AlignmentDirectional.topStart,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              if (kind == PayKind.flat)
                money(
                  'amount',
                  draft.rich.flat,
                  t.t('cases.bidForm.amount'),
                  errorText: badAmount ? _amountError(t) : null,
                ),
              if (kind == PayKind.hourly)
                money(
                  'rate',
                  draft.rich.rate,
                  t.t('cases.bidForm.rate'),
                  errorText: badAmount ? _amountError(t) : null,
                ),
              if (kind == PayKind.hourly && richOn) ...[
                hours(),
                money(
                  'retainer',
                  draft.rich.retainer,
                  t.t('deal.terms.retainerOptional'),
                ),
              ],
              if (kind == PayKind.percent)
                percent(
                  errorText: badPercent
                      ? t.t('cases.bidForm.percentError', {
                          'max': ContingencyRules.plain(rules.maxBps),
                        })
                      : null,
                ),
              if (kind == PayKind.installments) installments(),
              if (kind == PayKind.mixed) ...[
                money('amount', draft.rich.flat, t.t('cases.bidForm.amount')),
                money('rate', draft.rich.rate, t.t('cases.bidForm.rate')),
                hours(),
                installments(),
                if (percentAllowed) percent(helper: false),
              ],
              if (richOn && kind != PayKind.free)
                gap(
                  AppTextField(
                    key: const ValueKey('pay-field-notes'),
                    controller: draft.rich.notes,
                    label: t.t('deal.terms.notes'),
                    enabled: enabled,
                    maxLines: 3,
                    maxLength: 1000,
                    onChanged: (_) => onChanged(),
                  ),
                ),
            ],
          ),
        ),
      ],
    );
  }

  String _amountError(Translator t) => t.t('cases.bidForm.amountError', {
        'max': ContingencyRules.plain(rules.maxBps),
      });
}
