import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/l10n_formats.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/features/subscription/application/subscription_providers.dart';
import 'package:lawbid/features/subscription/domain/subscription_models.dart';
import 'package:lawbid/features/subscription/presentation/plan_tier_card.dart';
import 'package:lawbid/features/subscription/presentation/subscription_screen.dart';

final phoneE164 = RegExp(r'^\+[1-9][0-9]{7,14}$');

/// What the monthly plan includes (owner 2026-10-01: listed on the card).
List<String> monthlyFeatures(Translator t, String seatPrice) => [
      t.t('subscription.plan.feature.bids'),
      t.t('subscription.plan.feature.chat'),
      t.t('subscription.plan.feature.contacts'),
      t.t('plans.f.profile'),
      t.t('plans.f.planner'),
      t.t('subscription.plan.feature.noFees'),
      t.t('plans.f.seats', {'price': seatPrice}),
    ];

/// What yearly Prime includes.
List<String> yearlyFeatures(Translator t, String save) => [
      t.t('plans.f.everything'),
      t.t('plans.seats.included'),
      t.t('plans.f.save', {'save': save}),
    ];

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
        // Owner 2026-10-01: two plan cards, one under the other; the
        // chosen one is marked at the top right, assistants inside.
        PlanTierCard(
          key: const ValueKey('plan-monthly'),
          title: t.t('plans.monthly'),
          price: _price(_p.monthlyCents),
          period: t.t('plans.perMonth'),
          features: monthlyFeatures(t, _price(_p.seatCents)),
          status: yearly ? null : t.t('plans.status.selected'),
          highlighted: !yearly,
          onTap: () => _setPlan(SubscriptionPlan.monthly),
          child: yearly
              ? null
              : AssistantSeatsControl(
                  t: t,
                  seats: _seats,
                  max: _p.maxSeats,
                  seatPrice: _price(_p.seatCents),
                  total: t.t(
                    'plans.total.month',
                    {'price': _price(_p.monthlyTotal(_seats))},
                  ),
                  onChanged: _setSeats,
                ),
        ),
        const SizedBox(height: AppSpacing.md),
        PlanTierCard(
          key: const ValueKey('plan-yearly'),
          icon: AppIcons.diamondOutlined,
          title: t.t('plans.yearly'),
          price: _price(_p.yearlyCents),
          period: t.t('plans.perYear'),
          features: yearlyFeatures(t, _price(_p.yearlySavingsCents)),
          status:
              yearly ? t.t('plans.status.selected') : t.t('plans.yearly.badge'),
          highlighted: yearly,
          onTap: () => _setPlan(SubscriptionPlan.yearly),
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
        AppButton(
          key: const ValueKey('subscribe-cta'),
          label: '${t.t(trial ? 'plans.pay.trial' : 'plans.pay')} · '
              '${t.t(yearly ? 'plans.total.year' : 'plans.total.month', {
                'price': _price(total),
              })}',
          icon: AppIcons.lockOutlineRounded,
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
            AppIcon(
              AppIcons.verifiedUserOutlined,
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
                  leading: const AppIcon(AppIcons.phoneOutlined),
                ),
              ),
              AppIconButton(
                icon: const AppIcon(AppIcons.closeRounded),
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
              icon: const AppIcon(AppIcons.addRounded),
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

/// Owner 2026-10-01: an existing subscription — the same two plan cards.
/// "Active" sits at the top right of the current plan. Monthly: add /
/// remove assistant seats right in the card (+$100 a month each, saved
/// with one button) and the Assistant team. Prime: the Assistant team, or
/// "Switch to Prime" from a monthly plan.
class ActivePlans extends StatefulWidget {
  const ActivePlans({
    required this.t,
    required this.formats,
    required this.overview,
    required this.onSaveSeats,
    required this.onSwitchToPrime,
    required this.onTeam,
    this.primeBusy = false,
    super.key,
  });

  final Translator t;
  final L10nFormats formats;
  final SubscriptionOverview overview;
  final Future<void> Function(int seats) onSaveSeats;
  final VoidCallback onSwitchToPrime;
  final VoidCallback onTeam;
  final bool primeBusy;

  @override
  State<ActivePlans> createState() => _ActivePlansState();
}

class _ActivePlansState extends State<ActivePlans> {
  int? _draft;
  bool _saving = false;

  SubscriptionInfo get _s => widget.overview.subscription!;
  PlanPrices get _p => widget.overview.prices;
  String _price(int cents) => subscriptionPrice(widget.formats, cents);

  @override
  void didUpdateWidget(ActivePlans old) {
    super.didUpdateWidget(old);
    // The server's answer arrived: the draft is the saved value now.
    if (old.overview.subscription?.assistantSeats != _s.assistantSeats) {
      _draft = null;
    }
  }

  Future<void> _save(int seats) async {
    setState(() => _saving = true);
    try {
      await widget.onSaveSeats(seats);
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = widget.t;
    final active = widget.overview.isActive;
    final monthly = _s.plan == SubscriptionPlan.monthly;
    final seats = _draft ?? _s.assistantSeats;
    final changed = seats != _s.assistantSeats;
    final teamButton = AppButton(
      key: const ValueKey('team-row'),
      label: t.t('plans.team'),
      icon: AppIcons.groups2Outlined,
      variant: AppButtonVariant.secondary,
      onPressed: widget.onTeam,
    );
    final activeLabel = t.t('plans.status.active');
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        PlanTierCard(
          key: const ValueKey('plan-monthly'),
          title: t.t('plans.monthly'),
          price: _price(_p.monthlyCents),
          period: t.t('plans.perMonth'),
          features: monthlyFeatures(t, _price(_p.seatCents)),
          status: monthly && active ? activeLabel : null,
          statusFilled: true,
          highlighted: monthly && active,
          child: !monthly || !active
              ? null
              : Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    AssistantSeatsControl(
                      t: t,
                      seats: seats,
                      max: _p.maxSeats,
                      seatPrice: _price(_p.seatCents),
                      total: t.t(
                        'plans.total.month',
                        {'price': _price(_p.monthlyTotal(seats))},
                      ),
                      onChanged: (v) => setState(() => _draft = v),
                    ),
                    if (changed) ...[
                      const SizedBox(height: AppSpacing.md),
                      AppButton(
                        key: const ValueKey('seats-save'),
                        label: t.t('plans.seats.saveCta', {
                          'price': _price(_p.monthlyTotal(seats)),
                        }),
                        icon: AppIcons.checkRounded,
                        isLoading: _saving,
                        onPressed: () => _save(seats),
                      ),
                    ],
                    const SizedBox(height: AppSpacing.sm),
                    teamButton,
                  ],
                ),
        ),
        const SizedBox(height: AppSpacing.md),
        PlanTierCard(
          key: const ValueKey('plan-yearly'),
          icon: AppIcons.diamondOutlined,
          title: t.t('plans.yearly'),
          price: _price(_p.yearlyCents),
          period: t.t('plans.perYear'),
          features: yearlyFeatures(t, _price(_p.yearlySavingsCents)),
          status: !monthly && active ? activeLabel : t.t('plans.yearly.badge'),
          statusFilled: !monthly && active,
          highlighted: !monthly && active,
          child: !active
              ? null
              : !monthly
                  ? teamButton
                  : AppButton(
                      key: const ValueKey('prime-switch'),
                      label: t.t('prime.cta'),
                      icon: AppIcons.diamondOutlined,
                      isLoading: widget.primeBusy,
                      onPressed: widget.onSwitchToPrime,
                    ),
        ),
      ],
    );
  }
}
