import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/l10n_formats.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/features/subscription/application/subscription_providers.dart';
import 'package:lawbid/features/subscription/domain/subscription_models.dart';
import 'package:lawbid/features/subscription/presentation/subscription_screen.dart';

final phoneE164 = RegExp(r'^\+[1-9][0-9]{7,14}$');

/// What the attorney picked: the plan, monthly seats and the phones of
/// assistants who join without a code.
typedef PlanChoice = ({
  SubscriptionPlan plan,
  int seats,
  List<String> phones,
});

/// OQ-048 (owner 2026-09-30): two plans — monthly ($399 + $100 per
/// assistant, chosen by default) and yearly below it (attorney + all six
/// assistants, −20%) — the seat stepper, optional assistant phones, the
/// total and the button that opens Stripe's payment page.
class PlanPicker extends StatefulWidget {
  const PlanPicker({
    required this.t,
    required this.formats,
    required this.overview,
    required this.verified,
    required this.state,
    required this.onPay,
    required this.onStopWaiting,
    required this.onGoVerify,
    super.key,
  });

  final Translator t;
  final L10nFormats formats;
  final SubscriptionOverview overview;
  final bool verified;
  final SubscribeState state;
  final ValueChanged<PlanChoice> onPay;
  final VoidCallback onStopWaiting;
  final VoidCallback onGoVerify;

  @override
  State<PlanPicker> createState() => _PlanPickerState();
}

class _PlanPickerState extends State<PlanPicker> {
  SubscriptionPlan _plan = SubscriptionPlan.monthly;
  int _seats = 0;
  final List<TextEditingController> _phones = [];
  bool _tried = false;

  PlanPrices get _p => widget.overview.prices;
  int get _seatLimit => _plan == SubscriptionPlan.yearly ? _p.maxSeats : _seats;

  @override
  void dispose() {
    for (final c in _phones) {
      c.dispose();
    }
    super.dispose();
  }

  String _price(int cents) => subscriptionPrice(widget.formats, cents);

  void _setPlan(SubscriptionPlan plan) {
    if (plan == _plan) return;
    HapticFeedback.selectionClick();
    setState(() {
      _plan = plan;
      _trimPhones();
    });
  }

  void _setSeats(int seats) {
    HapticFeedback.selectionClick();
    setState(() {
      _seats = seats.clamp(0, _p.maxSeats);
      _trimPhones();
    });
  }

  /// Fewer seats than phone rows: empty rows go first.
  void _trimPhones() {
    while (_phones.length > _seatLimit) {
      final i = _phones.lastIndexWhere((c) => c.text.trim().isEmpty);
      _phones.removeAt(i >= 0 ? i : _phones.length - 1).dispose();
    }
  }

  String? _phoneError(TextEditingController c) {
    if (!_tried) return null;
    final v = c.text.trim();
    if (v.isEmpty) return null;
    return phoneE164.hasMatch(v) ? null : widget.t.t('plans.phones.invalid');
  }

  void _pay() {
    setState(() => _tried = true);
    final phones = [
      for (final c in _phones)
        if (c.text.trim().isNotEmpty) c.text.trim(),
    ];
    if (phones.any((p) => !phoneE164.hasMatch(p))) return;
    widget.onPay(
      (
        plan: _plan,
        seats: _plan == SubscriptionPlan.yearly ? _p.maxSeats : _seats,
        phones: phones.toSet().toList(),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final t = widget.t;
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    final o = widget.overview;
    final yearly = _plan == SubscriptionPlan.yearly;
    final total = yearly ? _p.yearlyCents : _p.monthlyTotal(_seats);
    final waiting = widget.state.phase == SubscribePhase.awaitingPayment;
    final trial = o.trialEligible && !(o.subscription?.ended ?? false);
    final dur = context.reduceMotion ? Duration.zero : AppMotion.stateChange;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(
          t.t('plans.title'),
          style: typography.titleMedium.copyWith(color: colors.text),
        ),
        const SizedBox(height: AppSpacing.md),
        _PlanOption(
          key: const ValueKey('plan-monthly'),
          selected: !yearly,
          title: t.t('plans.monthly'),
          price: t.t('plans.monthly.price', {'price': _price(_p.monthlyCents)}),
          line: t.t('plans.monthly.line', {'seat': _price(_p.seatCents)}),
          onTap: () => _setPlan(SubscriptionPlan.monthly),
          expanded: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Expanded(
                    child: Text(
                      t.t('plans.seats'),
                      style: typography.body.copyWith(
                        color: colors.text,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                  SeatsStepper(
                    seats: _seats,
                    max: _p.maxSeats,
                    onChanged: _setSeats,
                  ),
                ],
              ),
              const SizedBox(height: AppSpacing.xs),
              Text(
                t.t('plans.seats.hint'),
                style: typography.caption.copyWith(color: colors.textSecondary),
              ),
            ],
          ),
        ),
        const SizedBox(height: AppSpacing.md),
        _PlanOption(
          key: const ValueKey('plan-yearly'),
          selected: yearly,
          title: t.t('plans.yearly'),
          badge: t.t('plans.yearly.badge'),
          price: t.t('plans.yearly.price', {'price': _price(_p.yearlyCents)}),
          line: t.t('plans.yearly.line', {
            'save': _price(_p.yearlySavingsCents),
          }),
          onTap: () => _setPlan(SubscriptionPlan.yearly),
          expanded: Row(
            children: [
              Icon(
                Icons.groups_2_outlined,
                size: AppSizes.iconSm,
                color: colors.gold,
              ),
              const SizedBox(width: AppSpacing.sm),
              Expanded(
                child: Text(
                  t.t('plans.seats.included'),
                  style: typography.bodySmall.copyWith(color: colors.text),
                ),
              ),
            ],
          ),
        ),
        _Grow(
          duration: dur,
          curve: Curves.easeOutCubic,
          alignment: Alignment.topCenter,
          child: _seatLimit > 0
              ? Padding(
                  padding: const EdgeInsets.only(top: AppSpacing.lg),
                  child: _PhonesSection(
                    t: t,
                    controllers: _phones,
                    limit: _seatLimit,
                    errorOf: _phoneError,
                    onAdd: () =>
                        setState(() => _phones.add(TextEditingController())),
                    onRemove: (i) =>
                        setState(() => _phones.removeAt(i).dispose()),
                  ),
                )
              : const SizedBox(width: double.infinity),
        ),
        const SizedBox(height: AppSpacing.lg),
        AppCard(
          padding: const EdgeInsets.symmetric(
            horizontal: AppSpacing.lg,
            vertical: AppSpacing.md,
          ),
          child: Row(
            children: [
              Expanded(
                child: Text(
                  t.t('plans.total', {'price': ''}).replaceAll(':', '').trim(),
                  style: typography.body.copyWith(color: colors.textSecondary),
                ),
              ),
              AnimatedSwitcher(
                duration: dur,
                child: Text(
                  t.t(
                    yearly ? 'plans.total.year' : 'plans.total.month',
                    {'price': _price(total)},
                  ),
                  key: ValueKey('total-$total'),
                  style: typography.titleMedium.copyWith(color: colors.text),
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: AppSpacing.lg),
        AppButton(
          key: const ValueKey('subscribe-cta'),
          label: t.t(trial ? 'plans.pay.trial' : 'plans.pay'),
          icon: Icons.lock_outline_rounded,
          isLoading: widget.state.busy,
          isEnabled: o.canStart,
          dimWhenDisabled: true,
          onPressed: o.canStart ? _pay : null,
        ),
        AnimatedSwitcher(
          duration: dur,
          child: waiting
              ? Padding(
                  key: const ValueKey('waiting'),
                  padding: const EdgeInsets.only(top: AppSpacing.sm),
                  child: Column(
                    children: [
                      Text(
                        t.t('plans.waiting'),
                        textAlign: TextAlign.center,
                        style: typography.caption
                            .copyWith(color: colors.textSecondary),
                      ),
                      TextButton(
                        key: const ValueKey('stop-waiting'),
                        onPressed: widget.onStopWaiting,
                        child: Text(t.t('plans.waiting.stop')),
                      ),
                    ],
                  ),
                )
              : const SizedBox.shrink(),
        ),
        if (!o.canStart && !widget.verified) ...[
          const SizedBox(height: AppSpacing.sm),
          Text(
            t.t('subscription.cta.verifyFirst'),
            key: const ValueKey('verify-first'),
            textAlign: TextAlign.center,
            style: typography.caption.copyWith(color: colors.textSecondary),
          ),
          TextButton(
            onPressed: widget.onGoVerify,
            child: Text(t.t('subscription.cta.goVerify')),
          ),
        ],
        const SizedBox(height: AppSpacing.md),
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(
              Icons.verified_user_outlined,
              size: AppSizes.iconSm,
              color: colors.textSecondary,
            ),
            const SizedBox(width: AppSpacing.sm),
            Expanded(
              child: Text(
                t.t('plans.pay.secure'),
                style: typography.caption.copyWith(color: colors.textSecondary),
              ),
            ),
          ],
        ),
        const SizedBox(height: AppSpacing.sm),
        Text(
          t.t('subscription.terms'),
          textAlign: TextAlign.center,
          style: typography.caption.copyWith(color: colors.textSecondary),
        ),
      ],
    );
  }
}

/// A selectable plan card: radio, title (+ badge), price, one line and —
/// while selected — its own controls.
class _PlanOption extends StatelessWidget {
  const _PlanOption({
    required this.selected,
    required this.title,
    required this.price,
    required this.line,
    required this.onTap,
    required this.expanded,
    this.badge,
    super.key,
  });

  final bool selected;
  final String title;
  final String? badge;
  final String price;
  final String line;
  final VoidCallback onTap;
  final Widget expanded;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    final dur = context.reduceMotion ? Duration.zero : AppMotion.stateChange;
    const radio = 22.0;
    return Semantics(
      button: true,
      selected: selected,
      label: '$title, $price',
      child: AppPressable(
        onTap: onTap,
        child: AnimatedContainer(
          duration: dur,
          curve: Curves.easeOutCubic,
          padding: const EdgeInsets.all(AppSpacing.lg),
          decoration: BoxDecoration(
            color: selected ? colors.goldTint : colors.surface,
            borderRadius: BorderRadius.circular(AppRadii.card),
            border: Border.all(
              color: selected ? colors.gold : colors.border,
              width: selected ? 1.6 : 1,
            ),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  AnimatedContainer(
                    duration: dur,
                    width: radio,
                    height: radio,
                    alignment: Alignment.center,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      border: Border.all(
                        color: selected ? colors.gold : colors.border,
                        width: 2,
                      ),
                    ),
                    child: AnimatedScale(
                      duration: dur,
                      scale: selected ? 1 : 0,
                      child: Container(
                        width: 11,
                        height: 11,
                        decoration: BoxDecoration(
                          color: colors.gold,
                          shape: BoxShape.circle,
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(width: AppSpacing.md),
                  Expanded(
                    child: Text(
                      title,
                      style:
                          typography.titleMedium.copyWith(color: colors.text),
                    ),
                  ),
                  if (badge != null)
                    Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: AppSpacing.sm,
                        vertical: 3,
                      ),
                      decoration: BoxDecoration(
                        color: colors.gold,
                        borderRadius: BorderRadius.circular(AppRadii.pill),
                      ),
                      child: Text(
                        badge!,
                        style: typography.caption.copyWith(
                          color: AppColorsLight.navy,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ),
                ],
              ),
              const SizedBox(height: AppSpacing.sm),
              Padding(
                padding: const EdgeInsets.only(left: radio + AppSpacing.md),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      price,
                      style: typography.titleLarge.copyWith(
                        color: colors.text,
                        fontSize: 24,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      line,
                      style: typography.bodySmall
                          .copyWith(color: colors.textSecondary),
                    ),
                    _Grow(
                      duration: dur,
                      curve: Curves.easeOutCubic,
                      alignment: Alignment.topCenter,
                      child: selected
                          ? Padding(
                              padding:
                                  const EdgeInsets.only(top: AppSpacing.md),
                              child: expanded,
                            )
                          : const SizedBox(width: double.infinity),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Round − / + with the number between (the plan picker and the
/// "change seats" sheet of an active monthly plan).
class SeatsStepper extends StatelessWidget {
  const SeatsStepper({
    required this.seats,
    required this.max,
    required this.onChanged,
    this.min = 0,
    super.key,
  });

  final int seats;
  final int min;
  final int max;
  final ValueChanged<int> onChanged;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    Widget btn(IconData icon, bool enabled, int to, String key, String label) =>
        Semantics(
          button: true,
          enabled: enabled,
          label: label,
          child: AppPressable(
            key: ValueKey(key),
            onTap: enabled ? () => onChanged(to) : null,
            child: SizedBox(
              width: AppSizes.touchTarget,
              height: AppSizes.touchTarget,
              child: Center(
                child: AnimatedOpacity(
                  duration: AppMotion.stateChange,
                  opacity: enabled ? 1 : 0.35,
                  child: Container(
                    width: 34,
                    height: 34,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      border: Border.all(color: colors.gold),
                    ),
                    child: Icon(icon, size: 18, color: colors.text),
                  ),
                ),
              ),
            ),
          ),
        );
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        btn(Icons.remove_rounded, seats > min, seats - 1, 'seats-minus', '−'),
        SizedBox(
          width: 28,
          child: Text(
            '$seats',
            key: const ValueKey('seats-value'),
            textAlign: TextAlign.center,
            style: typography.titleMedium.copyWith(color: colors.text),
          ),
        ),
        btn(Icons.add_rounded, seats < max, seats + 1, 'seats-plus', '+'),
      ],
    );
  }
}

class _PhonesSection extends StatelessWidget {
  const _PhonesSection({
    required this.t,
    required this.controllers,
    required this.limit,
    required this.errorOf,
    required this.onAdd,
    required this.onRemove,
  });

  final Translator t;
  final List<TextEditingController> controllers;
  final int limit;
  final String? Function(TextEditingController) errorOf;
  final VoidCallback onAdd;
  final ValueChanged<int> onRemove;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(
          t.t('plans.phones'),
          style: typography.body.copyWith(
            color: colors.text,
            fontWeight: FontWeight.w600,
          ),
        ),
        const SizedBox(height: AppSpacing.xs),
        Text(
          t.t('plans.phones.hint'),
          style: typography.caption.copyWith(color: colors.textSecondary),
        ),
        for (final (i, c) in controllers.indexed) ...[
          const SizedBox(height: AppSpacing.sm),
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: AppTextField(
                  key: ValueKey('plan-phone-$i'),
                  controller: c,
                  hintText: '+13125550123',
                  keyboardType: TextInputType.phone,
                  errorText: errorOf(c),
                  inputFormatters: [
                    FilteringTextInputFormatter.allow(RegExp('[+0-9]')),
                  ],
                  leading: const Icon(Icons.phone_outlined),
                ),
              ),
              AppIconButton(
                icon: const Icon(Icons.close_rounded),
                semanticLabel: t.t('common.delete'),
                onPressed: () => onRemove(i),
              ),
            ],
          ),
        ],
        if (controllers.length < limit) ...[
          const SizedBox(height: AppSpacing.xs),
          Align(
            alignment: Alignment.centerLeft,
            child: TextButton.icon(
              key: const ValueKey('plan-phone-add'),
              onPressed: onAdd,
              icon: const Icon(Icons.add_rounded),
              label: Text(t.t('plans.phones.add')),
            ),
          ),
        ],
      ],
    );
  }
}

/// AnimatedSize, or the child as is under reduce-motion (a zero-length
/// AnimatedSize re-dirties itself during layout).
class _Grow extends StatelessWidget {
  const _Grow({
    required this.duration,
    required this.child,
    this.curve = Curves.linear,
    this.alignment = Alignment.center,
  });

  final Duration duration;
  final Curve curve;
  final AlignmentGeometry alignment;
  final Widget child;

  @override
  Widget build(BuildContext context) => duration == Duration.zero
      ? child
      : AnimatedSize(
          duration: duration,
          curve: curve,
          alignment: alignment,
          child: child,
        );
}
