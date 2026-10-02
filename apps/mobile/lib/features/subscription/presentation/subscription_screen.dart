import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/api_error_text.dart';
import 'package:lawbid/core/l10n/l10n_formats.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/core/navigation/app_routes.dart';
import 'package:lawbid/features/cases/presentation/widgets/async_views.dart';
import 'package:lawbid/features/cases/presentation/widgets/case_status.dart';
import 'package:lawbid/features/onboarding/application/current_user_controller.dart';
import 'package:lawbid/features/subscription/application/subscription_providers.dart';
import 'package:lawbid/features/subscription/data/card_collector.dart';
import 'package:lawbid/features/subscription/domain/subscription_models.dart';
import 'package:lawbid/features/subscription/presentation/plan_picker.dart';
import 'package:lawbid/features/subscription/subscription_routes.dart';
import 'package:lawbid/features/team/team_routes.dart';
import 'package:url_launcher/url_launcher.dart';

/// docs/06 §1.7 п.1–2, 5 — Settings → «Подписка»: the $399/мес plan card,
/// the current status with «Управление» / «Отменить», the trial /
/// subscribe call-to-action (disabled until verification is approved),
/// the payment-failed notice with «Обновить карту», and the way to the
/// payment history. States: loading / error / offline via
/// [AsyncDetailBody]; "empty" is the plan card without a status card.
class SubscriptionScreen extends ConsumerStatefulWidget {
  const SubscriptionScreen({super.key});

  @override
  ConsumerState<SubscriptionScreen> createState() => _SubscriptionScreenState();
}

class _SubscriptionScreenState extends ConsumerState<SubscriptionScreen>
    with WidgetsBindingObserver {
  bool _portalBusy = false;
  bool _primeBusy = false;

  Future<void> _switchToPrime(SubscriptionOverview o) async {
    final formats = ref.read(l10nFormatsProvider);
    final ok = await _confirm(
      title: _t.t('prime.confirm.title'),
      body: _t.t('prime.confirm.body', {
        'price': subscriptionPrice(formats, o.prices.yearlyCents),
      }),
      action: _t.t('prime.cta'),
    );
    if (!ok) return;
    setState(() => _primeBusy = true);
    try {
      final next =
          await ref.read(subscriptionRepositoryProvider).switchToYearly();
      ref.read(subscriptionOverviewProvider.notifier).apply(next);
      if (mounted) showAppSnackBar(context, _t.t('prime.done'));
    } on Object catch (e) {
      if (mounted) showAppSnackBar(context, errorText(_t, e));
    } finally {
      if (mounted) setState(() => _primeBusy = false);
    }
  }

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

  /// Back from the Customer Portal (in-app browser) or the card sheet:
  /// the webhook may have changed the status meanwhile.
  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) unawaited(_refreshQuietly());
  }

  Future<void> _refreshQuietly() async {
    try {
      await ref.read(subscriptionOverviewProvider.notifier).refresh();
    } on Object {
      // Offline: the screen keeps what it has.
    }
  }

  Future<void> _refresh() async {
    try {
      await ref.read(subscriptionOverviewProvider.notifier).refresh();
    } on Object catch (e) {
      if (mounted) showAppSnackBar(context, errorText(_t, e));
    }
  }

  Translator get _t => ref.read(translatorProvider);

  Future<bool> _confirm({
    required String title,
    required String body,
    required String action,
    bool destructive = false,
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
            child: Text(
              action,
              style: destructive ? TextStyle(color: colors.dangerText) : null,
            ),
          ),
        ],
      ),
    );
    return (ok ?? false) && mounted;
  }

  /// OQ-048: the chosen plan is paid on Stripe's page in the browser.
  Future<void> _subscribeWeb(PlanChoice c) async {
    final outcome =
        await ref.read(subscribeControllerProvider.notifier).subscribeWeb(
              plan: c.plan,
              assistantSeats: c.seats,
              assistantPhones: c.phones,
              promoCode: c.promoCode,
            );
    if (!mounted) return;
    switch (outcome) {
      case SubscribeOutcome.trialStarted:
        showAppSnackBar(context, _t.t('subscription.done.trial'));
      case SubscribeOutcome.activated:
        showAppSnackBar(context, _t.t('subscription.done.active'));
      case SubscribeOutcome.pendingConfirmation:
        showAppSnackBar(context, _t.t('subscription.done.pending'));
      case SubscribeOutcome.cancelled:
        unawaited(_refreshQuietly());
      case SubscribeOutcome.failed:
        showAppSnackBar(
          context,
          _errorText(ref.read(subscribeControllerProvider).error),
        );
    }
  }

  /// OQ-048: monthly plan — more or fewer assistant seats (changed in
  /// the monthly card, owner 2026-10-01).
  Future<void> _saveSeats(int next) async {
    try {
      final o2 = await ref.read(subscriptionRepositoryProvider).setSeats(next);
      ref.read(subscriptionOverviewProvider.notifier).apply(o2);
      if (mounted) {
        showAppSnackBar(context, _t.t('plans.seats.saved', {'seats': '$next'}));
      }
    } on Object catch (e) {
      if (mounted) showAppSnackBar(context, errorText(_t, e));
    }
  }

  String _errorText(Object? error) => switch (error) {
        CheckoutNotOpened() => _t.t('plans.cantOpen'),
        CardCollectionFailed(:final reason) =>
          _t.t('subscription.card.failed', {'reason': reason}),
        CardCollectorUnavailable() => _t.t('subscription.card.unavailable'),
        final Object e => errorText(_t, e),
        null => _t.t('error.default.message'),
      };

  Future<void> _cancel(SubscriptionInfo s) async {
    final formats = ref.read(l10nFormatsProvider);
    final end = s.periodEnd;
    final ok = await _confirm(
      title: _t.t('subscription.cancel.title'),
      body: end == null
          ? _t.t('subscription.cancel.bodyNoDate')
          : _t.t('subscription.cancel.body', {'date': formats.date(end)}),
      action: _t.t('subscription.cancel.confirm'),
      destructive: true,
    );
    if (!ok) return;
    try {
      final next =
          await ref.read(subscriptionOverviewProvider.notifier).cancel();
      if (!mounted) return;
      final until = next.subscription?.periodEnd;
      showAppSnackBar(
        context,
        until == null
            ? _t.t('subscription.cancel.doneNoDate')
            : _t.t('subscription.cancel.done', {'date': formats.date(until)}),
      );
    } on Object catch (e) {
      if (mounted) showAppSnackBar(context, errorText(_t, e));
    }
  }

  Future<void> _resume() async {
    try {
      await ref.read(subscriptionOverviewProvider.notifier).resume();
      if (mounted) showAppSnackBar(context, _t.t('subscription.resume.done'));
    } on Object catch (e) {
      if (mounted) showAppSnackBar(context, errorText(_t, e));
    }
  }

  /// Stripe Customer Portal in the in-app browser (docs/06 §1.4
  /// "Управление"): card, invoices, cancellation.
  Future<void> _openPortal() async {
    if (_portalBusy) return;
    setState(() => _portalBusy = true);
    try {
      final url = await ref.read(subscriptionRepositoryProvider).portalUrl();
      if (!mounted) return;
      // Only https (security review): the portal URL comes from the server.
      final opened = url.scheme == 'https' &&
          await launchUrl(url, mode: LaunchMode.inAppBrowserView);
      if (!opened && mounted) {
        showAppSnackBar(context, _t.t('subscription.portal.cantOpen'));
      }
    } on Object catch (e) {
      if (mounted) showAppSnackBar(context, errorText(_t, e));
    } finally {
      if (mounted) setState(() => _portalBusy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = ref.watch(translatorProvider);
    final formats = ref.watch(l10nFormatsProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final overview = ref.watch(subscriptionOverviewProvider);
    final subscribing = ref.watch(subscribeControllerProvider);
    final verified = ref.watch(
          currentUserControllerProvider.select(
            (s) => s.user?.attorneyProfile?.verificationStatus,
          ),
        ) ==
        'verified';
    return Scaffold(
      backgroundColor: colors.bg,
      appBar: AppTopBar(
        leading: AppBackButton(
          semanticLabel: t.t('common.back'),
          onPressed: () => Navigator.of(context).maybePop(),
        ),
        title: Text(t.t('subscription.title')),
      ),
      body: AsyncDetailBody<SubscriptionOverview>(
        value: overview,
        t: t,
        onRetry: () => ref.invalidate(subscriptionOverviewProvider),
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
            children: _sections(
              o,
              t: t,
              formats: formats,
              subscribing: subscribing,
              verified: verified,
            ),
          ),
        ),
      ),
    );
  }

  List<Widget> _sections(
    SubscriptionOverview o, {
    required Translator t,
    required L10nFormats formats,
    required SubscribeState subscribing,
    required bool verified,
  }) {
    final s = o.subscription;
    final showCta = !o.isActive &&
        s?.status != SubscriptionStatus.pastDue &&
        !(s?.pendingConfirmation ?? false);
    var index = 0;
    Widget section(Widget child) => AppEntrance(
          index: index++,
          child: Padding(
            padding: const EdgeInsets.only(bottom: AppSpacing.lg),
            child: child,
          ),
        );
    final statusFirst = s != null &&
        (!o.isActive ||
            s.paymentFailed ||
            s.status == SubscriptionStatus.pastDue ||
            (s.pendingConfirmation));
    Widget statusCard(SubscriptionInfo s) => section(
          SubscriptionStatusCard(
            subscription: s,
            t: t,
            formats: formats,
            portalBusy: _portalBusy,
            onManage: _openPortal,
            onCancel: () => _cancel(s),
            onResume: _resume,
            onRefresh: _refresh,
          ),
        );
    return [
      if (s != null && s.paymentFailed)
        section(
          PaymentFailedCard(
            t: t,
            busy: _portalBusy,
            onUpdateCard: _openPortal,
          ),
        ),
      // A problem (payment failed, pending, ended) leads; otherwise the
      // two plan cards come first ("Active" at the top right of the
      // current one), then the billing details (owner 2026-10-01).
      if (s != null && statusFirst) statusCard(s),
      if (s != null && !showCta)
        section(
          ActivePlans(
            t: t,
            formats: formats,
            overview: o,
            primeBusy: _primeBusy,
            onSaveSeats: _saveSeats,
            onSwitchToPrime: () => _switchToPrime(o),
            onTeam: () => context.push(TeamRoutes.team),
          ),
        ),
      if (s != null && !statusFirst) statusCard(s),
      if (showCta)
        section(
          PlanPicker(
            t: t,
            formats: formats,
            overview: o,
            verified: verified,
            state: subscribing,
            onPay: _subscribeWeb,
            onValidatePromo: (code, plan) => ref
                .read(subscriptionRepositoryProvider)
                .validatePromo(code, plan),
            onStopWaiting: () =>
                ref.read(subscribeControllerProvider.notifier).stopWaiting(),
            onGoVerify: () => context.push(AppRoutes.verification),
          ),
        ),
      section(
        AppListSection(
          children: [
            AppListRow(
              icon: AppIcons.receiptLongOutlined,
              label: t.t('subscription.action.payments'),
              onTap: () => context.push(SubscriptionRoutes.payments),
            ),
          ],
        ),
      ),
    ];
  }
}

StatusTone subscriptionTone(SubscriptionStatus status) => switch (status) {
      SubscriptionStatus.trialing => StatusTone.info,
      SubscriptionStatus.active => StatusTone.success,
      SubscriptionStatus.pastDue => StatusTone.danger,
      SubscriptionStatus.incomplete => StatusTone.warning,
      SubscriptionStatus.canceled ||
      SubscriptionStatus.expired ||
      SubscriptionStatus.unknown =>
        StatusTone.neutral,
    };

String subscriptionStatusLabel(Translator t, SubscriptionStatus status) => t.t(
      switch (status) {
        SubscriptionStatus.trialing => 'subscription.status.trialing',
        SubscriptionStatus.active => 'subscription.status.active',
        SubscriptionStatus.pastDue => 'subscription.status.past_due',
        SubscriptionStatus.canceled => 'subscription.status.canceled',
        SubscriptionStatus.expired => 'subscription.status.expired',
        SubscriptionStatus.incomplete => 'subscription.status.incomplete',
        SubscriptionStatus.unknown => 'subscription.status.unknown',
      },
    );

/// The one-line explanation under the status (docs/06 §1.7 п.2: trial end
/// / next charge, cancellation, grace period).
String subscriptionStatusLine(
  Translator t,
  L10nFormats formats,
  SubscriptionInfo s, {
  DateTime? now,
}) {
  final price = subscriptionPrice(formats, s.priceCents);
  String? date(DateTime? d) => d == null ? null : formats.date(d);
  switch (s.status) {
    case SubscriptionStatus.trialing:
      final end = date(s.trialEndsAt);
      if (end == null) return '';
      return s.cancelAtPeriodEnd
          ? t.t('subscription.line.cancelScheduled', {'date': end})
          : t.t('subscription.line.trialEnds', {'date': end, 'price': price});
    case SubscriptionStatus.active:
      final end = date(s.currentPeriodEnd);
      if (end == null) return '';
      return s.cancelAtPeriodEnd
          ? t.t('subscription.line.cancelScheduled', {'date': end})
          : t.t('subscription.line.nextCharge', {'date': end, 'price': price});
    case SubscriptionStatus.pastDue:
      final grace = s.graceEndsAt;
      final inGrace = grace != null && (now ?? DateTime.now()).isBefore(grace);
      return inGrace
          ? t.t('subscription.line.graceUntil', {'date': formats.date(grace)})
          : t.t('subscription.line.graceOver');
    case SubscriptionStatus.canceled:
    case SubscriptionStatus.expired:
      final end = date(s.periodEnd ?? s.canceledAt);
      return end == null
          ? t.t('subscription.line.ended')
          : t.t('subscription.line.endedAt', {'date': end});
    case SubscriptionStatus.incomplete:
      return t.t('subscription.line.incomplete');
    case SubscriptionStatus.unknown:
      return '';
  }
}

/// docs/06 §1.7 п.2 — «Текущий статус»: pill, the explanation line and
/// the actions that make sense for the status.
class SubscriptionStatusCard extends StatelessWidget {
  const SubscriptionStatusCard({
    required this.subscription,
    required this.t,
    required this.formats,
    required this.portalBusy,
    required this.onManage,
    required this.onCancel,
    required this.onRefresh,
    this.onResume,
    super.key,
  });

  final SubscriptionInfo subscription;
  final Translator t;
  final L10nFormats formats;
  final bool portalBusy;
  final VoidCallback onManage;
  final VoidCallback onCancel;
  final Future<void> Function() onRefresh;

  /// Shown while a cancel is scheduled: keep the subscription.
  final VoidCallback? onResume;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    final s = subscription;
    final line = subscriptionStatusLine(t, formats, s);
    final manage = AppButton(
      key: const ValueKey('subscription-manage'),
      label: t.t('subscription.action.manage'),
      icon: AppIcons.openInNewRounded,
      variant: AppButtonVariant.secondary,
      height: AppSizes.touchTarget,
      isLoading: portalBusy,
      onPressed: onManage,
    );
    final actions = <Widget>[
      if (s.paymentFailed) ...[
        AppButton(
          key: const ValueKey('subscription-update-card'),
          label: t.t('subscription.action.updateCard'),
          icon: AppIcons.creditCardRounded,
          height: AppSizes.touchTarget,
          isLoading: portalBusy,
          onPressed: onManage,
        ),
      ] else if (s.pendingConfirmation) ...[
        AppButton(
          key: const ValueKey('subscription-refresh'),
          label: t.t('subscription.action.refresh'),
          icon: AppIcons.refreshRounded,
          variant: AppButtonVariant.secondary,
          height: AppSizes.touchTarget,
          onPressed: onRefresh,
        ),
      ] else ...[
        manage,
        if (s.isActive && !s.cancelAtPeriodEnd)
          AppButton(
            key: const ValueKey('subscription-cancel'),
            label: t.t('subscription.action.cancel'),
            variant: AppButtonVariant.secondary,
            height: AppSizes.touchTarget,
            onPressed: onCancel,
          ),
        if (s.isActive && s.cancelAtPeriodEnd && onResume != null)
          AppButton(
            key: const ValueKey('subscription-resume'),
            label: t.t('subscription.action.resume'),
            icon: AppIcons.replayRounded,
            height: AppSizes.touchTarget,
            onPressed: onResume,
          ),
      ],
    ];
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
                key: const ValueKey('subscription-status'),
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
          if (actions.isNotEmpty) const SizedBox(height: AppSpacing.lg),
          for (final (i, action) in actions.indexed) ...[
            if (i > 0) const SizedBox(height: AppSpacing.sm),
            action,
          ],
        ],
      ),
    );
  }
}

/// docs/06 §1.7 п.5 — "ошибка оплаты с понятным текстом и действием
/// «Обновить карту»".
class PaymentFailedCard extends StatelessWidget {
  const PaymentFailedCard({
    required this.t,
    required this.busy,
    required this.onUpdateCard,
    super.key,
  });

  final Translator t;
  final bool busy;
  final VoidCallback onUpdateCard;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    return Semantics(
      container: true,
      liveRegion: true,
      child: Container(
        key: const ValueKey('payment-failed'),
        padding: const EdgeInsets.all(AppSpacing.lg),
        decoration: BoxDecoration(
          color: colors.dangerTint,
          borderRadius: BorderRadius.circular(AppRadii.card),
          border: Border.all(color: colors.danger.withValues(alpha: 0.4)),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                ExcludeSemantics(
                  child: AppIcon(
                    AppIcons.errorOutlineRounded,
                    color: colors.dangerText,
                    size: AppSizes.iconMd,
                  ),
                ),
                const SizedBox(width: AppSpacing.sm),
                Expanded(
                  child: Text(
                    t.t('subscription.paymentFailed.title'),
                    style: typography.titleMedium
                        .copyWith(color: colors.dangerText),
                  ),
                ),
              ],
            ),
            const SizedBox(height: AppSpacing.sm),
            Text(
              t.t('subscription.paymentFailed.body'),
              style: typography.body.copyWith(color: colors.text),
            ),
            const SizedBox(height: AppSpacing.lg),
            AppButton(
              key: const ValueKey('payment-failed-update-card'),
              label: t.t('subscription.action.updateCard'),
              icon: AppIcons.creditCardRounded,
              height: AppSizes.touchTarget,
              isLoading: busy,
              onPressed: onUpdateCard,
            ),
          ],
        ),
      ),
    );
  }
}

/// docs/06 §1.7 п.1 — «Начать бесплатный период» (or «Оформить подписку»
/// when no trial is left): disabled with an explanation until the
/// verification is approved; shows the flow's progress while running.
class SubscribeCta extends StatelessWidget {
  const SubscribeCta({
    required this.t,
    required this.overview,
    required this.verified,
    required this.state,
    required this.onSubscribe,
    required this.onGoVerify,
    super.key,
  });

  final Translator t;
  final SubscriptionOverview overview;
  final bool verified;
  final SubscribeState state;
  final VoidCallback onSubscribe;
  final VoidCallback onGoVerify;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    final o = overview;
    final ended = o.subscription?.ended ?? false;
    final label = t.t(
      ended
          ? 'subscription.cta.resubscribe'
          : o.trialEligible
              ? 'subscription.cta.startTrial'
              : 'subscription.cta.subscribe',
    );
    final progress = switch (state.phase) {
      SubscribePhase.idle => null,
      SubscribePhase.starting => t.t('subscription.progress.starting'),
      SubscribePhase.collectingCard =>
        t.t('subscription.progress.collectingCard'),
      SubscribePhase.confirming => t.t('subscription.progress.confirming'),
      SubscribePhase.syncing => t.t('subscription.progress.syncing'),
      SubscribePhase.awaitingPayment => t.t('plans.waiting'),
    };
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        AppButton(
          key: const ValueKey('subscribe-cta'),
          label: label,
          icon: AppIcons.workspacePremiumOutlined,
          isLoading: state.busy,
          isEnabled: o.canStart,
          dimWhenDisabled: true,
          onPressed: o.canStart ? onSubscribe : null,
        ),
        AnimatedSwitcher(
          duration:
              context.reduceMotion ? Duration.zero : AppMotion.stateChange,
          child: progress == null
              ? const SizedBox.shrink()
              : Padding(
                  key: ValueKey(state.phase),
                  padding: const EdgeInsets.only(top: AppSpacing.sm),
                  child: Text(
                    progress,
                    textAlign: TextAlign.center,
                    style: typography.caption
                        .copyWith(color: colors.textSecondary),
                  ),
                ),
        ),
        if (!o.canStart && !verified) ...[
          const SizedBox(height: AppSpacing.sm),
          Text(
            t.t('subscription.cta.verifyFirst'),
            key: const ValueKey('verify-first'),
            textAlign: TextAlign.center,
            style: typography.caption.copyWith(color: colors.textSecondary),
          ),
          TextButton(
            onPressed: onGoVerify,
            child: Text(t.t('subscription.cta.goVerify')),
          ),
        ],
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

/// docs/06 §1.1 shows the tariff as "$399" — whole dollars when there are
/// no cents (the payment history keeps the exact amounts).
String subscriptionPrice(L10nFormats formats, int cents) => cents % 100 == 0
    ? NumberFormat.simpleCurrency(
        locale: formats.locale,
        name: 'USD',
        decimalDigits: 0,
      ).format(cents ~/ 100)
    : NumberFormat.simpleCurrency(
        locale: formats.locale,
        name: 'USD',
      ).format(cents / 100);
