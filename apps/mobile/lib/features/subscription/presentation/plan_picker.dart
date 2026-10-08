import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/l10n_formats.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/features/plans/domain/plan_models.dart';
import 'package:lawbid/features/plans/presentation/plan_features.dart';
import 'package:lawbid/features/subscription/application/subscription_providers.dart';
import 'package:lawbid/features/subscription/domain/subscription_models.dart';
import 'package:lawbid/features/subscription/presentation/plan_tier_card.dart';
import 'package:lawbid/features/subscription/presentation/promo_code_field.dart';
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
  String? promoCode,

  /// Owner 2026-10-05: a plan of the plan builder (null = legacy tiers);
  /// [seats] are then the EXTRA seats beyond the included ones.
  String? planCode,
});

/// Legacy monthly / yearly: what [SubscriptionPlan] a plan builder plan
/// maps to (the server takes the interval from the code anyway).
SubscriptionPlan legacyPlanOf(PlanOffer plan) =>
    plan.yearly ? SubscriptionPlan.yearly : SubscriptionPlan.monthly;

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
    required this.onValidatePromo,
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

  /// Owner 2026-10-02: checks a promo code for the chosen plan.
  final Future<PromoCheck> Function(String code, SubscriptionPlan plan)
      onValidatePromo;
  final VoidCallback onStopWaiting;
  final VoidCallback onGoVerify;

  @override
  State<PlanPicker> createState() => _PlanPickerState();
}

class _PlanPickerState extends State<PlanPicker> {
  SubscriptionPlan _plan = SubscriptionPlan.monthly;
  int _seats = 0;

  /// Owner 2026-10-02: a validated promo code (null = none).
  String? _promo;

  /// Owner 2026-10-05: the chosen plan of the plan builder (code).
  String? _planCode;

  PlanPrices get _p => widget.overview.prices;

  /// Plans of the plan builder that can be bought; empty → legacy tiers.
  List<PlanOffer> get _offers => [
        for (final p in widget.overview.plans)
          if (p.purchasable) p,
      ];
  bool get _dynamic => _offers.isNotEmpty;

  PlanOffer? get _offer {
    final offers = _offers;
    if (offers.isEmpty) return null;
    for (final p in offers) {
      if (p.code == _planCode) return p;
    }
    final current = widget.overview.currentPlan?.code;
    for (final p in offers) {
      if (p.code == current) return p;
    }
    for (final p in offers) {
      if (p.isDefault) return p;
    }
    return offers.first;
  }

  /// Phone rows allowed: every seat (included + extra) of a plan builder
  /// plan; the legacy rule otherwise.
  int get _seatLimit {
    final o = _offer;
    if (o != null) return o.includedSeats + _seats;
    return _plan == SubscriptionPlan.yearly ? _p.maxSeats : _seats;
  }

  void _setOffer(PlanOffer plan) {
    if (plan.code == _offer?.code && _planCode != null) return;
    HapticFeedback.selectionClick();
    setState(() {
      _planCode = plan.code;
      _plan = legacyPlanOf(plan);
      _seats = _seats.clamp(0, plan.extraSeatsAllowed);
    });
  }

  void _setExtraSeats(int seats) {
    HapticFeedback.selectionClick();
    setState(() {
      _seats = seats.clamp(0, _offer?.extraSeatsAllowed ?? 0);
    });
  }

  String _price(int cents) => subscriptionPrice(widget.formats, cents);

  void _setPlan(SubscriptionPlan plan) {
    if (plan == _plan) return;
    HapticFeedback.selectionClick();
    setState(() => _plan = plan);
  }

  void _setSeats(int seats) {
    HapticFeedback.selectionClick();
    setState(() => _seats = seats.clamp(0, _p.maxSeats));
  }

  /// Owner 2026-10-04: no assistant phones at checkout — each seat gets a
  /// one-time code in Subscription → "Your assistants" after payment.
  void _pay() {
    final offer = _offer;
    if (offer != null) {
      widget.onPay(
        (
          plan: legacyPlanOf(offer),
          seats: _seats,
          phones: const [],
          promoCode: _promo,
          planCode: offer.code,
        ),
      );
      return;
    }
    widget.onPay(
      (
        plan: _plan,
        seats: _plan == SubscriptionPlan.yearly ? _p.maxSeats : _seats,
        phones: const [],
        promoCode: _promo,
        planCode: null,
      ),
    );
  }

  /// Owner 2026-10-05: one card per plan of the plan builder — the name,
  /// tagline, price per interval, highlights and the entitlement lines;
  /// the extra-seat stepper inside the chosen card when the plan allows
  /// seats beyond the included ones.
  List<Widget> _planCards(BuildContext context) {
    final t = widget.t;
    final f = widget.formats;
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    final chosen = _offer;
    final current = widget.overview.currentPlan?.code;
    final cards = <Widget>[];
    for (final (i, p) in _offers.indexed) {
      final selected = p.code == chosen?.code;
      final seatCents = p.extraSeatCents ?? _p.seatCents;
      final canAddSeats = selected && p.extraSeatsAllowed > 0 && seatCents > 0;
      final tagline = p.tagline.resolve(f.locale);
      final seatPrice = PlanFeatures.price(f, seatCents, currency: p.currency);
      final inside = <Widget>[
        if (tagline.isNotEmpty)
          Text(
            tagline,
            style: typography.bodySmall.copyWith(color: colors.textSecondary),
          ),
        if (canAddSeats) ...[
          if (tagline.isNotEmpty) const SizedBox(height: AppSpacing.md),
          AssistantSeatsControl(
            t: t,
            seats: _seats,
            max: p.extraSeatsAllowed,
            seatPrice: seatPrice,
            eachText: t.t('plan.seats.each', {'price': seatPrice}),
            total: PlanFeatures.total(
              t,
              f,
              p,
              p.totalCents(_seats, fallbackSeatCents: _p.seatCents),
            ),
            onChanged: _setExtraSeats,
          ),
        ],
      ];
      if (i > 0) cards.add(const SizedBox(height: AppSpacing.md));
      cards.add(
        PlanTierCard(
          key: ValueKey('plan-${p.code}'),
          icon: p.yearly
              ? AppIcons.diamondOutlined
              : AppIcons.workspacePremiumOutlined,
          title: p.name.resolve(f.locale),
          price: PlanFeatures.amount(t, f, p),
          period: PlanFeatures.period(t, p),
          discount: p.discount,
          formatCents: (c) => PlanFeatures.price(f, c, currency: p.currency),
          translator: t,
          yearly: p.yearly,
          features: PlanFeatures.lines(
            t,
            f,
            p,
            language: f.locale,
            fallbackSeatCents: _p.seatCents,
          ),
          status: p.code == current
              ? t.t('plan.status.yours')
              : selected
                  ? t.t('plans.status.selected')
                  : null,
          statusFilled: p.code == current,
          highlighted: selected,
          onTap: () => _setOffer(p),
          child: inside.isEmpty
              ? null
              : Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: inside,
                ),
        ),
      );
    }
    return cards;
  }

  @override
  Widget build(BuildContext context) {
    final t = widget.t;
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    final o = widget.overview;
    final offer = _offer;
    final yearly = offer?.yearly ?? (_plan == SubscriptionPlan.yearly);
    final total = offer != null
        ? offer.totalCents(_seats, fallbackSeatCents: _p.seatCents)
        : yearly
            ? _p.yearlyCents
            : _p.monthlyTotal(_seats);
    final waiting = widget.state.phase == SubscribePhase.awaitingPayment;
    final ended = o.subscription?.ended ?? false;
    final trial = o.trialEligible && !ended && (offer?.trialDays ?? 1) > 0;
    final payLabel = !trial
        ? t.t('plans.pay')
        : offer != null
            ? t.t('plan.pay.trialDays', {
                'n': widget.formats.number(offer.trialDays),
              })
            : t.t('plans.pay.trial', {
                'days': t.plural('subscription.trial.days', _p.trialDays),
              });
    final dur = context.reduceMotion ? Duration.zero : AppMotion.stateChange;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(
          t.t('plans.title'),
          style: typography.titleMedium.copyWith(color: colors.text),
        ),
        const SizedBox(height: AppSpacing.md),
        // Owner 2026-10-05: the plans the admin built, when the server
        // has them; the two legacy tiers otherwise.
        if (_dynamic)
          ..._planCards(context)
        else ...[
          // Owner 2026-10-01: two plan cards, one under the other; the
          // chosen one is marked at the top right, assistants inside.
          PlanTierCard(
            key: const ValueKey('plan-monthly'),
            title: t.t('plans.monthly'),
            price: _price(_p.monthlyCents),
            period: t.t('plans.perMonth'),
            discount: _p.monthlyDiscount,
            formatCents: _price,
            translator: t,
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
            discount: _p.yearlyDiscount,
            formatCents: _price,
            translator: t,
            yearly: true,
            features: yearlyFeatures(t, _price(_p.yearlySavingsCents)),
            status: yearly
                ? t.t('plans.status.selected')
                : t.t('plans.yearly.badge'),
            highlighted: yearly,
            onTap: () => _setPlan(SubscriptionPlan.yearly),
          ),
        ],
        _Grow(
          duration: dur,
          curve: Curves.easeOutCubic,
          alignment: Alignment.topCenter,
          child: _seatLimit > 0
              ? Padding(
                  padding: const EdgeInsets.only(top: AppSpacing.lg),
                  child: Text(
                    t.t('plans.seatCodes.hint'),
                    key: const ValueKey('plan-seat-codes'),
                    style: Theme.of(context)
                        .extension<AppTypographyTokens>()!
                        .caption
                        .copyWith(
                          color: Theme.of(context)
                              .extension<AppColorTokens>()!
                              .textSecondary,
                        ),
                  ),
                )
              : const SizedBox(width: double.infinity),
        ),
        const SizedBox(height: AppSpacing.lg),
        PromoCodeField(
          t: t,
          formats: widget.formats,
          plan: offer == null ? _plan : legacyPlanOf(offer),
          validate: widget.onValidatePromo,
          onChanged: (code) => _promo = code,
        ),
        const SizedBox(height: AppSpacing.lg),
        AppButton(
          key: const ValueKey('subscribe-cta'),
          label: '$payLabel · '
              '${t.t(yearly ? 'plans.total.year' : 'plans.total.month', {
                'price': offer == null
                    ? _price(total)
                    : PlanFeatures.price(
                        widget.formats,
                        total,
                        currency: offer.currency,
                      ),
              })}',
          icon: AppIcons.lockOutlineRounded,
          isLoading: widget.state.busy,
          isEnabled: o.canStart,
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
    if (old.overview.subscription?.assistantSeats != _s.assistantSeats ||
        old.overview.seats?.extra != widget.overview.seats?.extra) {
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

  /// Owner 2026-10-05: the plan builder's cards — "Your plan" on the
  /// current one with the extra-seat stepper (saved with one button) and
  /// the Assistant team inside it; the other plans listed for reference.
  List<Widget> _planCards(BuildContext context, Widget teamButton) {
    final t = widget.t;
    final f = widget.formats;
    final o = widget.overview;
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    final current = o.currentPlan;
    final plans = <PlanOffer>[
      // Owner 2026-10-07: never the «Без подписки» baseline card.
      if (current != null &&
          !current.isBaseline &&
          !o.plans.any((p) => p.code == current.code))
        current,
      for (final p in o.plans)
        if (p.purchasable || p.code == current?.code) p,
    ];
    final extra = _draft ?? o.seats?.extra ?? _s.assistantSeats;
    final savedExtra = o.seats?.extra ?? _s.assistantSeats;
    final changed = extra != savedExtra;
    final cards = <Widget>[];
    var anyMine = false;
    for (final (i, p) in plans.indexed) {
      final mine = p.code == current?.code && o.isActive;
      anyMine = anyMine || mine;
      final seatCents = p.extraSeatCents ?? _p.seatCents;
      final canAddSeats = mine && p.extraSeatsAllowed > 0 && seatCents > 0;
      final seatPrice = PlanFeatures.price(f, seatCents, currency: p.currency);
      final totalCents = p.totalCents(extra, fallbackSeatCents: _p.seatCents);
      final tagline = p.tagline.resolve(f.locale);
      if (i > 0) cards.add(const SizedBox(height: AppSpacing.md));
      cards.add(
        PlanTierCard(
          key: ValueKey('plan-${p.code}'),
          icon: p.yearly
              ? AppIcons.diamondOutlined
              : AppIcons.workspacePremiumOutlined,
          title: p.name.resolve(f.locale),
          price: PlanFeatures.amount(t, f, p),
          period: PlanFeatures.period(t, p),
          discount: p.discount,
          formatCents: (c) => PlanFeatures.price(f, c, currency: p.currency),
          translator: t,
          yearly: p.yearly,
          features: PlanFeatures.lines(
            t,
            f,
            p,
            language: f.locale,
            fallbackSeatCents: _p.seatCents,
          ),
          status: mine ? t.t('plan.status.yours') : null,
          statusFilled: true,
          highlighted: mine,
          child: !mine
              ? (tagline.isEmpty
                  ? null
                  : Text(
                      tagline,
                      style: typography.bodySmall
                          .copyWith(color: colors.textSecondary),
                    ))
              : Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    if (canAddSeats) ...[
                      AssistantSeatsControl(
                        t: t,
                        seats: extra,
                        max: p.extraSeatsAllowed,
                        seatPrice: seatPrice,
                        eachText: t.t('plan.seats.each', {'price': seatPrice}),
                        total: PlanFeatures.total(t, f, p, totalCents),
                        onChanged: (v) => setState(() => _draft = v),
                      ),
                      if (changed) ...[
                        const SizedBox(height: AppSpacing.md),
                        AppButton(
                          key: const ValueKey('seats-save'),
                          label: t.t('plans.seats.saveCta', {
                            'price': PlanFeatures.price(
                              f,
                              totalCents,
                              currency: p.currency,
                            ),
                          }),
                          icon: AppIcons.checkRounded,
                          isLoading: _saving,
                          onPressed: () => _save(extra),
                        ),
                      ],
                      const SizedBox(height: AppSpacing.sm),
                    ],
                    teamButton,
                  ],
                ),
        ),
      );
    }
    // A legacy subscription without a plan: the team is still reachable.
    if (!anyMine && o.isActive) {
      cards
        ..add(const SizedBox(height: AppSpacing.md))
        ..add(teamButton);
    }
    return cards;
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
    if (widget.overview.plans.isNotEmpty ||
        widget.overview.currentPlan != null) {
      return Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: _planCards(context, teamButton),
      );
    }
    final activeLabel = t.t('plans.status.active');
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        PlanTierCard(
          key: const ValueKey('plan-monthly'),
          title: t.t('plans.monthly'),
          price: _price(_p.monthlyCents),
          period: t.t('plans.perMonth'),
          discount: _p.monthlyDiscount,
          formatCents: _price,
          translator: t,
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
          discount: _p.yearlyDiscount,
          formatCents: _price,
          translator: t,
          yearly: true,
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
