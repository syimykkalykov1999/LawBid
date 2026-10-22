import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/api_error_text.dart';
import 'package:lawbid/core/l10n/l10n_formats.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid/features/subscription/application/subscription_providers.dart';
import 'package:lawbid/features/subscription/data/card_collector.dart';
import 'package:lawbid/features/subscription/domain/subscription_models.dart';
import 'package:lawbid/features/subscription/presentation/subscription_screen.dart'
    show subscriptionPrice;
import 'package:lawbid/features/subscription/subscription_routes.dart';
import 'package:lawbid/features/team/application/team_providers.dart';

/// Owner 2026-10-22 — buying assistant seats, like Slack: the attorney
/// picks how many, sees «К оплате сейчас: $X (до {date}), затем +$Y/мес»
/// (the server asks Stripe for the exact prorated amount), pays with the
/// card the subscription already uses, and the bank's 3-D Secure check
/// opens when it is needed. Without a paid subscription the plan picker
/// opens instead; during a trial seats wait for the first payment.
///
/// [target] = the wanted EXTRA seats (default: one more). Returns true
/// when seats were bought (or are being confirmed).
Future<bool> buyAssistantSeats(
  BuildContext context,
  WidgetRef ref, {
  int? target,
}) async {
  final t = ref.read(translatorProvider);
  final SubscriptionOverview o;
  try {
    o = await ref.read(subscriptionOverviewProvider.future);
  } on Object catch (e) {
    if (context.mounted) showAppSnackBar(context, errorText(t, e));
    return false;
  }
  if (!context.mounted) return false;
  final s = o.subscription;
  // No paid subscription of their own (none, ended, or free under a
  // contract): seats come with a plan — the plan picker.
  if (s == null || !s.isActive || o.contractGrant != null) {
    unawaited(context.push(SubscriptionRoutes.subscription));
    return false;
  }
  if (s.status == SubscriptionStatus.trialing) {
    await showDialog<void>(
      context: context,
      builder: (ctx) => AppAlertDialog(
        title: Text(t.t('seats.buy.title')),
        content: Text(t.t('seats.buy.trial')),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(),
            child: Text(t.t('common.close')),
          ),
        ],
      ),
    );
    return false;
  }
  final included = o.seats?.included ?? 0;
  final current = o.seats?.extra ?? s.assistantSeats;
  final max = (o.seats?.max ?? o.prices.maxSeats) - included;
  if (max <= 0) {
    showAppSnackBar(context, t.t('error.api.SUBSCRIPTION_PLAN_INCLUDES_SEATS'));
    return false;
  }
  if (current >= max) {
    showAppSnackBar(context, t.t('seats.buy.limit'));
    return false;
  }
  final bought = await showAppBottomSheet<bool>(
    context: context,
    isScrollControlled: true,
    builder: (_) => SeatPurchaseSheet(
      current: current,
      max: max,
      initial: (target ?? current + 1).clamp(current + 1, max),
    ),
  );
  return bought ?? false;
}

/// The stepper, the price and the pay button (owner 2026-10-22).
class SeatPurchaseSheet extends ConsumerStatefulWidget {
  const SeatPurchaseSheet({
    required this.current,
    required this.max,
    required this.initial,
    super.key,
  });

  /// Extra seats the attorney has now / may have at most.
  final int current;
  final int max;
  final int initial;

  @override
  ConsumerState<SeatPurchaseSheet> createState() => _SeatPurchaseSheetState();
}

class _SeatPurchaseSheetState extends ConsumerState<SeatPurchaseSheet> {
  late int _seats = widget.initial;
  SeatPreview? _preview;
  String? _error;
  bool _paying = false;
  int _seq = 0;

  @override
  void initState() {
    super.initState();
    unawaited(_load());
  }

  /// The price of [_seats] now; a stale answer (the stepper moved on) is
  /// dropped.
  Future<void> _load() async {
    final seq = ++_seq;
    setState(() {
      _preview = null;
      _error = null;
    });
    try {
      final p =
          await ref.read(subscriptionRepositoryProvider).previewSeats(_seats);
      if (mounted && seq == _seq) setState(() => _preview = p);
    } on Object catch (e) {
      if (mounted && seq == _seq) {
        setState(() => _error = errorText(ref.read(translatorProvider), e));
      }
    }
  }

  void _step(int delta) {
    final next = (_seats + delta).clamp(widget.current + 1, widget.max);
    if (next == _seats) return;
    _seats = next;
    unawaited(_load());
  }

  Future<void> _pay() async {
    final p = _preview;
    if (p == null || _paying) return;
    final t = ref.read(translatorProvider);
    setState(() {
      _paying = true;
      _error = null;
    });
    try {
      final r = await ref
          .read(subscriptionRepositoryProvider)
          .setSeats(_seats, prorationDate: p.prorationDate);
      if (!mounted) return;
      ref.read(subscriptionOverviewProvider.notifier).apply(r.overview);
      switch (r.status) {
        case SeatChangeStatus.applied:
        case SeatChangeStatus.scheduled:
          _finish(t.t('seats.buy.done'));
        case SeatChangeStatus.requiresAction:
          final secret = r.clientSecret;
          if (secret == null) {
            setState(() => _error = t.t('seats.buy.failed'));
            return;
          }
          await ref.read(paymentConfirmerProvider).confirm(secret);
          // The webhook adds the seats once Stripe has the payment.
          unawaited(_refreshSoon());
          if (mounted) _finish(t.t('seats.buy.pending'));
        case SeatChangeStatus.failed:
          setState(() => _error = t.t('seats.buy.failed'));
      }
    } on CardCollectionCancelled {
      // The attorney closed the bank's check: nothing is charged.
    } on CardCollectionFailed catch (e) {
      if (mounted) {
        setState(
          () => _error = t.t('subscription.card.failed', {'reason': e.reason}),
        );
      }
    } on CardCollectorUnavailable {
      if (mounted) {
        setState(() => _error = t.t('subscription.card.unavailable'));
      }
    } on ApiException catch (e) {
      if (!mounted) return;
      if (e.code == ApiErrorCodes.seatsPreviewStale) {
        // The price moved on: show the new one, the attorney pays again.
        await _load();
        return;
      }
      setState(() => _error = errorText(t, e));
    } on Object catch (e) {
      if (mounted) setState(() => _error = errorText(t, e));
    } finally {
      if (mounted) setState(() => _paying = false);
    }
  }

  void _finish(String message) {
    ref.invalidate(teamProvider);
    showAppSnackBar(context, message);
    Navigator.of(context).pop(true);
  }

  /// After 3-D Secure the seats arrive by webhook — re-read twice.
  Future<void> _refreshSoon() async {
    final overview = ref.read(subscriptionOverviewProvider.notifier);
    final team = ref.read(teamProvider.notifier);
    for (final wait in const [Duration(seconds: 2), Duration(seconds: 6)]) {
      await Future<void>.delayed(wait);
      try {
        await overview.refresh();
        await team.refresh();
      } on Object {
        // Offline: the screens re-read on their own later.
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = ref.watch(translatorProvider);
    final formats = ref.watch(l10nFormatsProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    final p = _preview;
    String price(int cents) => subscriptionPrice(formats, cents);
    return SafeArea(
      top: false,
      child: Padding(
        padding: EdgeInsets.fromLTRB(
          AppSpacing.screenSide,
          0,
          AppSpacing.screenSide,
          AppSpacing.xl + MediaQuery.viewInsetsOf(context).bottom,
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              t.t('seats.buy.title'),
              style: typography.titleMedium.copyWith(color: colors.text),
            ),
            const SizedBox(height: AppSpacing.lg),
            Row(
              children: [
                Expanded(
                  child: Text(
                    t.t('seats.buy.count'),
                    style: typography.body.copyWith(color: colors.text),
                  ),
                ),
                AppIconButton(
                  key: const ValueKey('seats-buy-minus'),
                  icon: AppIcon(AppIcons.removeRounded, color: colors.text),
                  semanticLabel: '−',
                  onPressed: _seats > widget.current + 1 && !_paying
                      ? () => _step(-1)
                      : null,
                ),
                SizedBox(
                  width: 40,
                  child: Text(
                    formats.digits('$_seats'),
                    key: const ValueKey('seats-buy-count'),
                    textAlign: TextAlign.center,
                    style: typography.titleMedium.copyWith(color: colors.text),
                  ),
                ),
                AppIconButton(
                  key: const ValueKey('seats-buy-plus'),
                  icon: AppIcon(AppIcons.addRounded, color: colors.text),
                  semanticLabel: '+',
                  onPressed:
                      _seats < widget.max && !_paying ? () => _step(1) : null,
                ),
              ],
            ),
            const SizedBox(height: AppSpacing.md),
            Container(
              padding: const EdgeInsets.all(AppSpacing.md),
              decoration: BoxDecoration(
                color: colors.goldTint,
                borderRadius: BorderRadius.circular(AppRadii.field),
                border: Border.all(color: colors.goldStroke),
              ),
              child: p == null && _error == null
                  ? const Center(
                      child: SizedBox.square(
                        dimension: 20,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      ),
                    )
                  : p == null
                      ? const SizedBox.shrink()
                      : Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              p.periodEnd == null
                                  ? t.t('seats.buy.nowNoDate', {
                                      'price': price(p.amountNowCents),
                                    })
                                  : t.t('seats.buy.now', {
                                      'price': price(p.amountNowCents),
                                      'date': formats.date(p.periodEnd!),
                                    }),
                              key: const ValueKey('seats-buy-now'),
                              style: typography.body.copyWith(
                                color: colors.text,
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                            const SizedBox(height: AppSpacing.xs),
                            Text(
                              t.t('seats.buy.then', {
                                'price': price(p.monthlyIncreaseCents),
                              }),
                              key: const ValueKey('seats-buy-then'),
                              style: typography.bodySmall
                                  .copyWith(color: colors.textSecondary),
                            ),
                          ],
                        ),
            ),
            if (_error != null) ...[
              const SizedBox(height: AppSpacing.sm),
              Text(
                _error!,
                key: const ValueKey('seats-buy-error'),
                style: typography.bodySmall.copyWith(color: colors.dangerText),
              ),
            ],
            const SizedBox(height: AppSpacing.lg),
            AppButton(
              key: const ValueKey('seats-buy-pay'),
              label: p == null
                  ? t.t('seats.buy.title')
                  : t.t('seats.buy.pay', {'price': price(p.amountNowCents)}),
              icon: AppIcons.creditCardRounded,
              isLoading: _paying,
              isEnabled: p != null && !_paying,
              onPressed: _pay,
            ),
          ],
        ),
      ),
    );
  }
}
