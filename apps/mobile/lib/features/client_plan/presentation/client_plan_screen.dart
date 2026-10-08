import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/api_error_text.dart';
import 'package:lawbid/core/l10n/l10n_formats.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/features/cases/presentation/widgets/async_views.dart';
import 'package:lawbid/features/cases/presentation/widgets/case_status.dart';
import 'package:lawbid/features/client_plan/application/client_plan_providers.dart';
import 'package:lawbid/features/client_plan/domain/client_plan_models.dart';
import 'package:lawbid/features/client_plan/presentation/client_payment_portal.dart';
import 'package:lawbid/features/plans/domain/plan_models.dart';
import 'package:lawbid/features/plans/presentation/plan_features.dart';
import 'package:lawbid/features/subscription/application/subscription_providers.dart';
import 'package:lawbid/features/subscription/domain/subscription_models.dart';
import 'package:lawbid/features/subscription/presentation/plan_tier_card.dart';
import 'package:lawbid/features/subscription/presentation/subscription_screen.dart';

/// Owner 2026-10-05 (plan builder) — Settings → «Подписка клиента»: the
/// client plans for sale as cards (the current one marked «Ваш план»),
/// the subscription status with «Отменить» / «Возобновить», and
/// «Оформить» that opens Stripe's page and applies the paid session on
/// return — the same flow as the attorney's checkout.
class ClientPlanScreen extends ConsumerStatefulWidget {
  const ClientPlanScreen({super.key});

  @override
  ConsumerState<ClientPlanScreen> createState() => _ClientPlanScreenState();
}

class _ClientPlanScreenState extends ConsumerState<ClientPlanScreen>
    with WidgetsBindingObserver {
  String? _selectedCode;
  bool _portalBusy = false;

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

  /// Back from the browser: the webhook may have changed the status.
  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      unawaited(ref.read(clientCheckoutControllerProvider.notifier).checkNow());
      unawaited(_refreshQuietly());
    }
  }

  Translator get _t => ref.read(translatorProvider);

  Future<void> _openPortal() async {
    if (_portalBusy) return;
    setState(() => _portalBusy = true);
    try {
      await openClientPaymentPortal(context, ref);
    } finally {
      if (mounted) setState(() => _portalBusy = false);
    }
  }

  Future<void> _refreshQuietly() async {
    try {
      await ref.read(clientPlanProvider.notifier).refresh();
    } on Object {
      // Offline: the screen keeps what it has.
    }
  }

  Future<void> _refresh() async {
    try {
      await ref.read(clientPlanProvider.notifier).refresh();
    } on Object catch (e) {
      if (mounted) showAppSnackBar(context, errorText(_t, e));
    }
  }

  Future<bool> _confirm({
    required String title,
    required String body,
    required String action,
  }) async {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: colors.surface,
        title: Text(title),
        content: Text(body),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(false),
            child: Text(_t.t('common.cancel')),
          ),
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(true),
            child: Text(action, style: TextStyle(color: colors.dangerText)),
          ),
        ],
      ),
    );
    return (ok ?? false) && mounted;
  }

  Future<void> _subscribe(PlanOffer plan) async {
    final outcome = await ref
        .read(clientCheckoutControllerProvider.notifier)
        .subscribe(planCode: plan.code);
    if (!mounted) return;
    switch (outcome) {
      case ClientCheckoutOutcome.trialStarted:
        showAppSnackBar(context, _t.t('plan.client.done.trial'));
      case ClientCheckoutOutcome.activated:
        showAppSnackBar(context, _t.t('plan.client.done.active'));
      case ClientCheckoutOutcome.cancelled:
        unawaited(_refreshQuietly());
      case ClientCheckoutOutcome.failed:
        final error = ref.read(clientCheckoutControllerProvider).error;
        showAppSnackBar(
          context,
          switch (error) {
            CheckoutNotOpened() => _t.t('plans.cantOpen'),
            final Object e => errorText(_t, e),
            null => _t.t('error.default.message'),
          },
        );
    }
  }

  Future<void> _cancel(ClientSubscriptionInfo s) async {
    final formats = ref.read(l10nFormatsProvider);
    final end = s.periodEnd;
    final ok = await _confirm(
      title: _t.t('plan.client.cancel.title'),
      body: end == null
          ? _t.t('plan.client.cancel.bodyNoDate')
          : _t.t('plan.client.cancel.body', {'date': formats.date(end)}),
      action: _t.t('plan.client.cancel'),
    );
    if (!ok) return;
    try {
      await ref.read(clientPlanProvider.notifier).cancel();
      if (mounted) showAppSnackBar(context, _t.t('plan.client.cancel.done'));
    } on Object catch (e) {
      if (mounted) showAppSnackBar(context, errorText(_t, e));
    }
  }

  Future<void> _resume() async {
    try {
      await ref.read(clientPlanProvider.notifier).resume();
      if (mounted) showAppSnackBar(context, _t.t('plan.client.resume.done'));
    } on Object catch (e) {
      if (mounted) showAppSnackBar(context, errorText(_t, e));
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = ref.watch(translatorProvider);
    final formats = ref.watch(l10nFormatsProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final overview = ref.watch(clientPlanProvider);
    final checkout = ref.watch(clientCheckoutControllerProvider);
    return Scaffold(
      backgroundColor: colors.bg,
      appBar: AppTopBar(
        leading: AppBackButton(
          semanticLabel: t.t('common.back'),
          onPressed: () => Navigator.of(context).maybePop(),
        ),
        title: Text(t.t('plan.client.title')),
      ),
      body: AsyncDetailBody<ClientPlanOverview>(
        value: overview,
        t: t,
        onRetry: () => ref.invalidate(clientPlanProvider),
        builder: (o) => RefreshIndicator(
          color: colors.gold,
          backgroundColor: colors.surface,
          onRefresh: _refresh,
          child: ListView(
            physics: const AlwaysScrollableScrollPhysics(),
            padding: const EdgeInsets.fromLTRB(
              AppSpacing.screenSide,
              AppSpacing.lg,
              AppSpacing.screenSide,
              AppSpacing.xxl,
            ),
            children: _sections(o, t: t, formats: formats, checkout: checkout),
          ),
        ),
      ),
    );
  }

  List<Widget> _sections(
    ClientPlanOverview o, {
    required Translator t,
    required L10nFormats formats,
    required ClientCheckoutState checkout,
  }) {
    var index = 0;
    Widget section(Widget child) => AppEntrance(
          index: index++,
          child: Padding(
            padding: const EdgeInsets.only(bottom: AppSpacing.lg),
            child: child,
          ),
        );
    final s = o.subscription;
    return [
      if (s != null)
        section(
          ClientPlanStatusCard(
            subscription: s,
            t: t,
            formats: formats,
            onCancel: () => _cancel(s),
            onResume: _resume,
            portalBusy: _portalBusy,
            onUpdateCard: _openPortal,
          ),
        ),
      section(
        ClientPlanPicker(
          t: t,
          formats: formats,
          overview: o,
          selectedCode: _selectedCode,
          state: checkout,
          onSelect: (code) => setState(() => _selectedCode = code),
          onSubscribe: _subscribe,
          onStopWaiting: () =>
              ref.read(clientCheckoutControllerProvider.notifier).stopWaiting(),
        ),
      ),
    ];
  }
}

/// The one-line explanation under the client's status pill.
String clientPlanStatusLine(
  Translator t,
  L10nFormats formats,
  ClientSubscriptionInfo s,
) {
  final price = PlanFeatures.price(formats, s.priceCents);
  String? date(DateTime? d) => d == null ? null : formats.date(d);
  switch (s.status) {
    case SubscriptionStatus.trialing:
      final end = date(s.trialEndsAt);
      if (end == null) return '';
      return s.cancelAtPeriodEnd
          ? t.t('plan.client.line.cancelScheduled', {'date': end})
          : t.t('plan.client.line.trialEnds', {'date': end, 'price': price});
    case SubscriptionStatus.active:
      final end = date(s.currentPeriodEnd);
      if (end == null) return '';
      return s.cancelAtPeriodEnd
          ? t.t('plan.client.line.cancelScheduled', {'date': end})
          : t.t('plan.client.line.nextCharge', {'date': end, 'price': price});
    case SubscriptionStatus.pastDue:
      return t.t('plan.client.line.pastDue');
    case SubscriptionStatus.canceled:
    case SubscriptionStatus.expired:
      final end = date(s.periodEnd ?? s.canceledAt);
      return end == null
          ? t.t('plan.client.line.ended')
          : t.t('subscription.line.endedAt', {'date': end});
    case SubscriptionStatus.incomplete:
      return t.t('subscription.line.incomplete');
    case SubscriptionStatus.unknown:
      return '';
  }
}

/// «Текущий статус»: pill (trialing / active / past_due / canceled), the
/// period end, and «Отменить» / «Возобновить».
class ClientPlanStatusCard extends StatelessWidget {
  const ClientPlanStatusCard({
    required this.subscription,
    required this.t,
    required this.formats,
    required this.onCancel,
    required this.onResume,
    this.onUpdateCard,
    this.portalBusy = false,
    super.key,
  });

  final ClientSubscriptionInfo subscription;
  final Translator t;
  final L10nFormats formats;
  final VoidCallback onCancel;
  final VoidCallback onResume;

  /// Owner 2026-10-06: «Обновить карту» — the Stripe portal (card,
  /// invoices). Hidden once the subscription has ended.
  final VoidCallback? onUpdateCard;
  final bool portalBusy;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    final s = subscription;
    final line = clientPlanStatusLine(t, formats, s);
    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  t.t('subscription.status.title'),
                  style: typography.titleMedium.copyWith(color: colors.text),
                ),
              ),
              const SizedBox(width: AppSpacing.sm),
              StatusPill(
                key: const ValueKey('client-plan-status'),
                label: subscriptionStatusLabel(t, s.status),
                tone: subscriptionTone(s.status),
              ),
            ],
          ),
          if (line.isNotEmpty) ...[
            const SizedBox(height: AppSpacing.md),
            Text(
              line,
              style: typography.body.copyWith(color: colors.textSecondary),
            ),
          ],
          if (s.isActive && !s.cancelAtPeriodEnd) ...[
            const SizedBox(height: AppSpacing.lg),
            AppButton(
              key: const ValueKey('client-plan-cancel'),
              label: t.t('plan.client.cancel'),
              variant: AppButtonVariant.secondary,
              height: AppSizes.touchTarget,
              onPressed: onCancel,
            ),
          ],
          if (s.isActive && s.cancelAtPeriodEnd) ...[
            const SizedBox(height: AppSpacing.lg),
            AppButton(
              key: const ValueKey('client-plan-resume'),
              label: t.t('plan.client.resume'),
              icon: AppIcons.replayRounded,
              height: AppSizes.touchTarget,
              onPressed: onResume,
            ),
          ],
          if (onUpdateCard != null &&
              s.status != SubscriptionStatus.canceled) ...[
            const SizedBox(height: AppSpacing.md),
            AppButton(
              key: const ValueKey('client-plan-update-card'),
              label: t.t('subscription.action.updateCard'),
              icon: AppIcons.openInNewRounded,
              variant: s.status == SubscriptionStatus.pastDue
                  ? AppButtonVariant.primary
                  : AppButtonVariant.secondary,
              height: AppSizes.touchTarget,
              isLoading: portalBusy,
              onPressed: onUpdateCard,
            ),
          ],
        ],
      ),
    );
  }
}

/// The client plans as cards (the same style as the attorney's picker):
/// the current one is «Ваш план», a tapped paid plan is «Выбран», and
/// «Оформить» below opens the payment page. The trial hint shows while a
/// first purchase would get the trial days.
class ClientPlanPicker extends StatelessWidget {
  const ClientPlanPicker({
    required this.t,
    required this.formats,
    required this.overview,
    required this.selectedCode,
    required this.state,
    required this.onSelect,
    required this.onSubscribe,
    required this.onStopWaiting,
    super.key,
  });

  final Translator t;
  final L10nFormats formats;
  final ClientPlanOverview overview;
  final String? selectedCode;
  final ClientCheckoutState state;
  final ValueChanged<String> onSelect;
  final ValueChanged<PlanOffer> onSubscribe;
  final VoidCallback onStopWaiting;

  PlanOffer? _selected(List<PlanOffer> offers, String? currentCode) {
    for (final p in offers) {
      if (p.code == selectedCode) return p;
    }
    for (final p in offers) {
      if (p.isDefault && p.code != currentCode) return p;
    }
    for (final p in offers) {
      if (p.code != currentCode) return p;
    }
    return null;
  }

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    final o = overview;
    final current = o.paidPlan ?? (o.isActive ? null : o.plan);
    final plans = <PlanOffer>[
      if (o.plan != null && !o.plans.any((p) => p.code == o.plan!.code))
        o.plan!,
      ...o.plans,
    ];
    final offers = [
      for (final p in plans)
        if (p.purchasable) p,
    ];
    final selected = _selected(offers, current?.code);
    final waiting = state.phase == ClientCheckoutPhase.awaitingPayment;
    final trial = selected != null && o.trialEligible && selected.trialDays > 0;
    final dur = context.reduceMotion ? Duration.zero : AppMotion.stateChange;
    if (plans.isEmpty) {
      return Text(
        t.t('plan.client.noPlans'),
        textAlign: TextAlign.center,
        style: typography.body.copyWith(color: colors.textSecondary),
      );
    }
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(
          t.t('plan.client.choose'),
          style: typography.titleMedium.copyWith(color: colors.text),
        ),
        const SizedBox(height: AppSpacing.md),
        for (final (i, p) in plans.indexed) ...[
          if (i > 0) const SizedBox(height: AppSpacing.md),
          _card(context, p, current: current, selected: selected),
        ],
        if (o.trialEligible && offers.any((p) => p.trialDays > 0)) ...[
          const SizedBox(height: AppSpacing.md),
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              AppIcon(
                AppIcons.giftOutlined,
                size: AppSizes.iconSm,
                color: colors.goldDark,
              ),
              const SizedBox(width: AppSpacing.sm),
              Expanded(
                child: Text(
                  t.t('plan.client.trialHint'),
                  key: const ValueKey('client-plan-trial-hint'),
                  style:
                      typography.caption.copyWith(color: colors.textSecondary),
                ),
              ),
            ],
          ),
        ],
        if (selected != null && selected.code != current?.code) ...[
          const SizedBox(height: AppSpacing.lg),
          AppButton(
            key: const ValueKey('client-plan-subscribe'),
            label: trial
                ? t.t('plan.client.subscribeTrial', {
                    'n': formats.number(selected.trialDays),
                  })
                : '${t.t('plan.client.subscribe')} · '
                    '${PlanFeatures.total(
                    t,
                    formats,
                    selected,
                    selected.amountCents ?? 0,
                  )}',
            icon: AppIcons.lockOutlineRounded,
            isLoading: state.busy,
            onPressed: () => onSubscribe(selected),
          ),
        ],
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
                        onPressed: onStopWaiting,
                        child: Text(t.t('plans.waiting.stop')),
                      ),
                    ],
                  ),
                )
              : const SizedBox.shrink(),
        ),
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
      ],
    );
  }

  Widget _card(
    BuildContext context,
    PlanOffer p, {
    required PlanOffer? current,
    required PlanOffer? selected,
  }) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    final mine = p.code == current?.code;
    final isSelected = !mine && p.code == selected?.code;
    final tagline = p.tagline.resolve(formats.locale);
    return PlanTierCard(
      key: ValueKey('plan-${p.code}'),
      icon: p.isBaseline
          ? AppIcons.personOutlineRounded
          : p.yearly
              ? AppIcons.diamondOutlined
              : AppIcons.workspacePremiumOutlined,
      title: p.name.resolve(formats.locale),
      price: PlanFeatures.amount(t, formats, p),
      period: PlanFeatures.period(t, p),
      discount: p.discount,
      formatCents: (c) => PlanFeatures.price(formats, c, currency: p.currency),
      translator: t,
      yearly: p.yearly,
      features: PlanFeatures.lines(t, formats, p, language: formats.locale),
      status: mine
          ? t.t('plan.status.yours')
          : isSelected
              ? t.t('plans.status.selected')
              : null,
      statusFilled: mine,
      highlighted: mine || isSelected,
      onTap: p.purchasable && !mine
          ? () {
              HapticFeedback.selectionClick();
              onSelect(p.code);
            }
          : null,
      child: tagline.isEmpty
          ? null
          : Text(
              tagline,
              style: typography.bodySmall.copyWith(color: colors.textSecondary),
            ),
    );
  }
}
