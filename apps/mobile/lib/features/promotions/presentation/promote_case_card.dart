import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/api_error_text.dart';
import 'package:lawbid/core/l10n/l10n_formats.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/core/navigation/app_routes.dart';
import 'package:lawbid/features/cases/presentation/widgets/detail_widgets.dart';
import 'package:lawbid/features/onboarding/domain/us_states.dart';
import 'package:lawbid/features/onboarding/presentation/widgets/option_picker_sheet.dart';
import 'package:lawbid/features/practice/practice_options.dart';
import 'package:lawbid/features/promotions/application/promotions_providers.dart';
import 'package:lawbid/features/promotions/domain/promotion_models.dart';
import 'package:lawbid/features/referrals/domain/referral_models.dart';
import 'package:lawbid/features/subscription/domain/subscription_models.dart';
import 'package:lawbid/features/subscription/presentation/promo_code_field.dart';
import 'package:url_launcher/url_launcher.dart';

/// The promotion state provider of one post / case.
FutureProvider<CasePromotionState> promotionStateProvider(
  PromotionTarget target,
  String id,
) =>
    target == PromotionTarget.post
        ? postPromotionProvider(id)
        : casePromotionProvider(id);

/// The own-post menu's "Promote": the sheet, or "My promotions" when one
/// already runs.
Future<void> openPostPromotion(
  BuildContext context,
  WidgetRef ref,
  String postId,
) async {
  final t = ref.read(translatorProvider);
  try {
    final state = await ref.read(postPromotionProvider(postId).future);
    if (!context.mounted) return;
    final p = state.promotion;
    if (p != null && p.isRunning) {
      await context.push(AppRoutes.myPromotions);
    } else if (state.quote.enabled && state.canPromote) {
      await PromoteSheet.show(
        context,
        target: PromotionTarget.post,
        id: postId,
        state: state,
      );
    } else {
      showAppSnackBar(context, t.t('promote.unavailable'));
    }
  } on Object catch (e) {
    if (context.mounted) showAppSnackBar(context, errorText(t, e));
  }
}

/// Owner 2026-10-05 — Instagram-style "Promote" under my post or case:
/// the running promotion (progress, impressions, reach, clicks, Stop) or
/// a button that opens the budget / duration / audience sheet. No
/// subscription needed.
class PromoteCard extends ConsumerStatefulWidget {
  const PromoteCard({required this.target, required this.id, super.key});

  final PromotionTarget target;
  final String id;

  @override
  ConsumerState<PromoteCard> createState() => _PromoteCardState();
}

class _PromoteCardState extends ConsumerState<PromoteCard>
    with WidgetsBindingObserver {
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

  // Back from Stripe's page: show the new state.
  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      ref
        ..invalidate(promotionStateProvider(widget.target, widget.id))
        ..invalidate(myPromotionsProvider);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = ref.watch(translatorProvider);
    final f = ref.watch(l10nFormatsProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final state =
        ref.watch(promotionStateProvider(widget.target, widget.id)).value;
    // Nothing until the server says promotions exist for this target.
    if (state == null || !state.quote.enabled) return const SizedBox.shrink();
    final p = state.promotion;
    final pending = p?.status == PromotionStatus.pendingPayment;
    final live = p != null && p.isRunning;
    if (!live && !pending && !state.canPromote) return const SizedBox.shrink();
    final isPost = widget.target == PromotionTarget.post;

    String line() {
      if (p == null || !(live || pending)) {
        return t.t(isPost ? 'promote.post.sub' : 'promote.sub');
      }
      if (pending) return t.t('promote.pending');
      if (p.status == PromotionStatus.pendingReview) {
        return t.t('promote.review');
      }
      final end = p.endsAt;
      return t.t('promote.until', {'date': end == null ? '' : f.date(end)});
    }

    return Container(
      margin: const EdgeInsets.only(top: AppSpacing.lg),
      padding: const EdgeInsets.all(AppSpacing.lg),
      decoration: BoxDecoration(
        color: colors.goldTint,
        borderRadius: BorderRadius.circular(AppRadii.card),
        border: Border.all(color: colors.goldStroke),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              AppIcon(AppIcons.campaignRounded, color: colors.goldDark),
              const SizedBox(width: AppSpacing.sm),
              Expanded(
                child: Text(
                  t.t(isPost ? 'promote.post.title' : 'promote.title'),
                  style: type.titleMedium.copyWith(
                    color: colors.text,
                    fontFamily: type.body.fontFamily,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: AppSpacing.xs),
          Text(
            line(),
            style: type.bodySmall.copyWith(color: colors.textSecondary),
          ),
          if (live) ...[
            const SizedBox(height: AppSpacing.md),
            PromotionStatsBlock(promotion: p),
          ],
          const SizedBox(height: AppSpacing.md),
          if (live)
            PromotionActions(
              promotion: p,
              onChanged: () => ref
                  .invalidate(promotionStateProvider(widget.target, widget.id)),
            )
          else
            AppButton(
              label:
                  pending ? t.t('promote.completePayment') : t.t('promote.cta'),
              icon: AppIcons.campaignOutlined,
              onPressed: () => PromoteSheet.show(
                context,
                target: widget.target,
                id: widget.id,
                state: state,
              ),
            ),
        ],
      ),
    );
  }
}

/// "Stop" + "All promotions" under a running promotion.
class PromotionActions extends ConsumerWidget {
  const PromotionActions({
    required this.promotion,
    this.onChanged,
    this.showAll = true,
    super.key,
  });

  final CasePromotion promotion;
  final VoidCallback? onChanged;
  final bool showAll;

  Future<void> _stop(BuildContext context, WidgetRef ref) async {
    final t = ref.read(translatorProvider);
    final ok = await showConfirmSheet(
      context,
      t: t,
      title: t.t('promote.stop.title'),
      message: t.t('promote.stop.message'),
      confirmLabel: t.t('promote.stop'),
      destructive: true,
    );
    if (!ok || !context.mounted) return;
    try {
      await ref.read(promotionsRepositoryProvider).stop(promotion.id);
      ref.invalidate(myPromotionsProvider);
      onChanged?.call();
    } on Object catch (e) {
      if (context.mounted) showAppSnackBar(context, errorText(t, e));
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final stop = AppButton(
      label: t.t('promote.stop'),
      variant: AppButtonVariant.secondary,
      onPressed: () => _stop(context, ref),
    );
    if (!showAll) return stop;
    return Row(
      children: [
        Expanded(child: stop),
        const SizedBox(width: AppSpacing.sm),
        Expanded(
          child: AppButton(
            label: t.t('promote.all'),
            variant: AppButtonVariant.secondary,
            onPressed: () => context.push(AppRoutes.myPromotions),
          ),
        ),
      ],
    );
  }
}

/// Progress of the bought impressions + impressions / reach / clicks.
class PromotionStatsBlock extends ConsumerWidget {
  const PromotionStatsBlock({required this.promotion, super.key});

  final CasePromotion promotion;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final f = ref.watch(l10nFormatsProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final p = promotion;
    final progress = p.progress;
    Widget stat(String value, String label) => Expanded(
          child: Column(
            children: [
              FitText(
                value,
                style: type.titleMedium.copyWith(
                  color: colors.text,
                  fontWeight: FontWeight.w700,
                ),
              ),
              Text(
                label,
                maxLines: 2,
                textAlign: TextAlign.center,
                overflow: TextOverflow.ellipsis,
                style: type.caption.copyWith(color: colors.textSecondary),
              ),
            ],
          ),
        );
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (progress != null) ...[
          ClipRRect(
            borderRadius: BorderRadius.circular(AppRadii.pill),
            child: LinearProgressIndicator(
              value: progress,
              minHeight: AppSizes.progressSegment,
              color: colors.gold,
              backgroundColor: colors.surface,
            ),
          ),
          const SizedBox(height: AppSpacing.xs),
          Text(
            t.t('promote.progress', {
              'shown': f.number(p.impressions),
              'total': f.number(p.targetImpressions ?? 0),
            }),
            style: type.caption.copyWith(color: colors.textSecondary),
          ),
          const SizedBox(height: AppSpacing.sm),
        ],
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            stat(f.number(p.impressions), t.t('promote.stat.impressions')),
            stat(f.number(p.reach), t.t('promote.stat.reach')),
            stat(f.number(p.clicks), t.t('promote.stat.clicks')),
          ],
        ),
      ],
    );
  }
}

/// Instagram-style "Boost": audience, daily budget, duration, the "about
/// N people" estimate, credits / promo code, pay.
class PromoteSheet extends ConsumerStatefulWidget {
  const PromoteSheet({
    required this.target,
    required this.id,
    required this.state,
    super.key,
  });

  final PromotionTarget target;
  final String id;
  final CasePromotionState state;

  static Future<void> show(
    BuildContext context, {
    required PromotionTarget target,
    required String id,
    required CasePromotionState state,
  }) =>
      showAppBottomSheet<void>(
        context: context,
        isScrollControlled: true,
        builder: (_) => PromoteSheet(target: target, id: id, state: state),
      );

  @override
  ConsumerState<PromoteSheet> createState() => _PromoteSheetState();
}

class _PromoteSheetState extends ConsumerState<PromoteSheet> {
  late PromotionQuote _quote = widget.state.quote;
  late int _days = _quote.days.clamp(1, _quote.maxDays);
  late int _budget = _initialBudget(_quote);
  bool _custom = false;
  PromotionAudience _audience = const PromotionAudience();
  String? _promo;
  bool _busy = false;
  Timer? _debounce;
  int _seq = 0;

  bool get _isPost => widget.target == PromotionTarget.post;

  static int _initialBudget(PromotionQuote q) {
    final b = q.dailyBudgetCents > 0 ? q.dailyBudgetCents : q.priceCentsPerDay;
    return b.clamp(q.minDailyBudgetCents, q.maxDailyBudgetCents);
  }

  @override
  void initState() {
    super.initState();
    // The server's first quote may be for another budget / target.
    _requote();
  }

  @override
  void dispose() {
    _debounce?.cancel();
    super.dispose();
  }

  void _requote() {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 250), () async {
      final seq = ++_seq;
      try {
        final q = await ref.read(promotionsRepositoryProvider).quote(
              _days,
              dailyBudgetCents: _budget,
              target: widget.target,
            );
        if (mounted && seq == _seq) setState(() => _quote = q);
      } on Object {
        // Keep the last quote; the server prices the purchase anyway.
      }
    });
  }

  void _setDays(int d) {
    setState(() => _days = d.clamp(1, widget.state.quote.maxDays));
    _requote();
  }

  void _setBudget(int cents) {
    final q = widget.state.quote;
    setState(
      () => _budget = cents.clamp(q.minDailyBudgetCents, q.maxDailyBudgetCents),
    );
    _requote();
  }

  Future<void> _pickStates() async {
    final t = ref.read(translatorProvider);
    final picked = await OptionPickerSheet.show(
      context,
      title: t.t('promote.audience.states'),
      multi: true,
      initial: _audience.states.toSet(),
      options: [
        for (final s in kRegions) PickerOption(value: s.code, label: s.name),
      ],
    );
    if (picked != null && mounted) {
      setState(() => _audience = _audience.copyWith(states: picked.toList()));
    }
  }

  Future<void> _pickTopics() async {
    final t = ref.read(translatorProvider);
    final picked = await OptionPickerSheet.show(
      context,
      title: t.t('promote.audience.topics'),
      multi: true,
      initial: _audience.topics.toSet(),
      // The server matches by category (a viewer's practice areas).
      options: practiceOptions(ref).where((o) => !o.nested).toList(),
    );
    if (picked != null && mounted) {
      setState(() => _audience = _audience.copyWith(topics: picked.toList()));
    }
  }

  Future<void> _buy() async {
    final t = ref.read(translatorProvider);
    setState(() => _busy = true);
    try {
      final r = await ref.read(promotionsRepositoryProvider).buy(
            widget.id,
            target: widget.target,
            days: _days,
            dailyBudgetCents: _budget,
            audience: _custom ? _audience : null,
            promoCode: _promo,
          );
      if (!mounted) return;
      ref
        ..invalidate(promotionStateProvider(widget.target, widget.id))
        ..invalidate(myPromotionsProvider);
      final url = r.checkoutUrl;
      Navigator.of(context).pop();
      if (url != null) {
        final uri = Uri.tryParse(url);
        if (uri != null && uri.scheme == 'https') {
          await launchUrl(uri, mode: LaunchMode.externalApplication);
        }
      }
    } on Object catch (e) {
      if (!mounted) return;
      setState(() => _busy = false);
      showAppSnackBar(context, errorText(t, e));
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = ref.watch(translatorProvider);
    final f = ref.watch(l10nFormatsProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final base = widget.state.quote;
    final q = _quote;
    final label = q.totalCents == 0
        ? t.t('promote.free')
        : t.t('promote.pay', {'price': f.currencyFromCents(q.totalCents)});

    Widget section(String title) => Padding(
          padding: const EdgeInsets.only(
            top: AppSpacing.lg,
            bottom: AppSpacing.sm,
          ),
          child: Text(
            title,
            style: type.body.copyWith(
              color: colors.text,
              fontWeight: FontWeight.w700,
            ),
          ),
        );

    Widget chips<T>(
      List<T> values,
      T selected,
      String Function(T) text,
      void Function(T) onTap,
    ) =>
        Wrap(
          spacing: AppSpacing.sm,
          runSpacing: AppSpacing.sm,
          children: [
            for (final v in values)
              AppChip(
                label: text(v),
                selected: v == selected,
                onTap: () => onTap(v),
              ),
          ],
        );

    final budgetPresets = base.budgetPresetsCents
        .where(
          (c) => c >= base.minDailyBudgetCents && c <= base.maxDailyBudgetCents,
        )
        .toList();
    final dayPresets =
        base.durationPresets.where((d) => d >= 1 && d <= base.maxDays).toList();
    // $1 steps; a very wide range keeps the slider usable with fewer stops.
    final budgetRange = base.maxDailyBudgetCents - base.minDailyBudgetCents;
    final budgetSteps = (budgetRange / 100).round().clamp(0, 500);
    const roles = ['all', 'attorneys', 'clients'];

    return SafeArea(
      top: false,
      child: Padding(
        padding: EdgeInsets.fromLTRB(
          AppSpacing.screenSide,
          AppSpacing.md,
          AppSpacing.screenSide,
          AppSpacing.lg + MediaQuery.viewInsetsOf(context).bottom,
        ),
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const AppSheetHandle(),
              const SizedBox(height: AppSpacing.md),
              Text(
                t.t(_isPost ? 'promote.post.title' : 'promote.title'),
                style: type.titleMedium.copyWith(color: colors.text),
              ),
              if (_isPost) ...[
                section(t.t('promote.audience')),
                chips<bool>(
                  [false, true],
                  _custom,
                  (c) => t.t(
                    c ? 'promote.audience.custom' : 'promote.audience.auto',
                  ),
                  (c) => setState(() => _custom = c),
                ),
                Padding(
                  padding: const EdgeInsets.only(top: AppSpacing.xs),
                  child: Text(
                    t.t(
                      _custom
                          ? 'promote.audience.customSub'
                          : 'promote.audience.autoSub',
                    ),
                    style: type.caption.copyWith(color: colors.textSecondary),
                  ),
                ),
                if (_custom) ...[
                  const SizedBox(height: AppSpacing.md),
                  chips<String>(
                    roles,
                    _audience.role,
                    (r) => t.t('promote.audience.role.$r'),
                    (r) => setState(
                      () => _audience = _audience.copyWith(role: r),
                    ),
                  ),
                  const SizedBox(height: AppSpacing.md),
                  PickerField(
                    label: t.t('promote.audience.states'),
                    placeholder: t.t('promote.audience.any'),
                    value: _audience.states.isEmpty
                        ? null
                        : _audience.states.join(', '),
                    onTap: _pickStates,
                  ),
                  const SizedBox(height: AppSpacing.md),
                  PickerField(
                    label: t.t('promote.audience.topics'),
                    placeholder: t.t('promote.audience.any'),
                    value: _audience.topics.isEmpty
                        ? null
                        : t.t('promote.audience.topicsCount', {
                            'count': '${_audience.topics.length}',
                          }),
                    onTap: _pickTopics,
                  ),
                ],
              ],
              section(t.t('promote.budget')),
              if (budgetPresets.isNotEmpty)
                chips<int>(
                  budgetPresets,
                  _budget,
                  f.currencyFromCents,
                  _setBudget,
                ),
              if (budgetSteps > 0)
                Slider(
                  value: _budget.toDouble(),
                  min: base.minDailyBudgetCents.toDouble(),
                  max: base.maxDailyBudgetCents.toDouble(),
                  divisions: budgetSteps,
                  activeColor: colors.gold,
                  label: f.currencyFromCents(_budget),
                  onChanged: (v) => _setBudget((v / 100).round() * 100),
                ),
              Text(
                t.t('promote.perDay', {
                  'price': f.currencyFromCents(_budget),
                }),
                style: type.bodySmall.copyWith(color: colors.textSecondary),
              ),
              section(t.t('promote.duration')),
              if (dayPresets.isNotEmpty)
                chips<int>(
                  dayPresets,
                  _days,
                  (d) => t.t('promote.days', {'days': '$d'}),
                  _setDays,
                ),
              if (base.maxDays > 1)
                Slider(
                  value: _days.toDouble(),
                  min: 1,
                  max: base.maxDays.toDouble(),
                  divisions: base.maxDays - 1,
                  activeColor: colors.gold,
                  label: t.t('promote.days', {'days': '$_days'}),
                  onChanged: (v) => _setDays(v.round()),
                ),
              const SizedBox(height: AppSpacing.md),
              Container(
                padding: const EdgeInsets.all(AppSpacing.lg),
                decoration: BoxDecoration(
                  color: colors.goldTint,
                  borderRadius: BorderRadius.circular(AppRadii.card),
                ),
                child: Column(
                  children: [
                    Text(
                      t.t('promote.estimate.title'),
                      textAlign: TextAlign.center,
                      style:
                          type.bodySmall.copyWith(color: colors.textSecondary),
                    ),
                    const SizedBox(height: AppSpacing.xs),
                    FitText(
                      t.t('promote.estimate.people', {
                        'min': f.number(q.estReachMin),
                        'max': f.number(q.estReachMax),
                      }),
                      style: type.titleLarge.copyWith(
                        color: colors.text,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    const SizedBox(height: AppSpacing.xs),
                    Text(
                      t.t('promote.estimate.total', {
                        'price': f.currencyFromCents(q.grossCents),
                        'days': '$_days',
                      }),
                      textAlign: TextAlign.center,
                      style:
                          type.bodySmall.copyWith(color: colors.textSecondary),
                    ),
                  ],
                ),
              ),
              if (q.creditDaysUsed > 0)
                Padding(
                  padding: const EdgeInsets.only(top: AppSpacing.sm),
                  child: Text(
                    t.t('promote.credits', {
                      'days': formatRewardNumber(q.creditDaysUsed),
                    }),
                    textAlign: TextAlign.center,
                    style: type.caption.copyWith(color: colors.success),
                  ),
                ),
              const SizedBox(height: AppSpacing.md),
              PromoCodeField(
                t: t,
                formats: f,
                plan: SubscriptionPlan.monthly,
                validate: _validate,
                onChanged: (c) => _promo = c,
              ),
              const SizedBox(height: AppSpacing.md),
              AppButton(
                label: label,
                icon: AppIcons.lockOutlineRounded,
                isLoading: _busy,
                onPressed: _buy,
              ),
              const SizedBox(height: AppSpacing.sm),
              Text(
                t.t('promote.footnote'),
                textAlign: TextAlign.center,
                style: type.caption.copyWith(color: colors.textSecondary),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Future<PromoCheck> _validate(String code, SubscriptionPlan _) =>
      ref.read(promotionsRepositoryProvider).validatePromo(code);
}

String promotionStatusLabel(Translator t, PromotionStatus s) =>
    t.t('promote.status.${s.wire}');

/// Owner 2026-10-07: a small «Продвигать» / «Boost» button at the bottom
/// right under the author's own post, in place of the big promote card.
/// A running promotion opens its stats and actions in a sheet.
class BoostButton extends ConsumerWidget {
  const BoostButton({
    required this.postId,
    this.target = PromotionTarget.post,
    super.key,
  });

  /// The post's id, or the case's with [target] = case.
  final String postId;
  final PromotionTarget target;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final state = ref.watch(promotionStateProvider(target, postId)).value;
    if (state == null || !state.quote.enabled) return const SizedBox.shrink();
    final p = state.promotion;
    final pending = p?.status == PromotionStatus.pendingPayment;
    final live = p != null && p.isRunning;
    if (!live && !pending && !state.canPromote) return const SizedBox.shrink();
    void refresh() => ref
      ..invalidate(promotionStateProvider(target, postId))
      ..invalidate(myPromotionsProvider);
    Future<void> onTap() async {
      if (live) {
        await showAppBottomSheet<void>(
          context: context,
          isScrollControlled: true,
          builder: (_) => SafeArea(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(
                AppSpacing.screenSide,
                AppSpacing.md,
                AppSpacing.screenSide,
                AppSpacing.lg,
              ),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  const AppSheetHandle(),
                  PromotionStatsBlock(promotion: p),
                  const SizedBox(height: AppSpacing.md),
                  PromotionActions(promotion: p, onChanged: refresh),
                ],
              ),
            ),
          ),
        );
      } else {
        await PromoteSheet.show(
          context,
          target: target,
          id: postId,
          state: state,
        );
      }
      refresh();
    }

    return Semantics(
      button: true,
      child: AppPressable(
        onTap: onTap,
        child: Container(
          constraints: const BoxConstraints(minHeight: 32),
          padding: const EdgeInsets.symmetric(
            horizontal: AppSpacing.md,
            vertical: AppSpacing.xs,
          ),
          decoration: BoxDecoration(
            color: live ? colors.goldTint : null,
            borderRadius: BorderRadius.circular(AppRadii.pill),
            border: Border.all(color: colors.goldStroke),
          ),
          // Small: as wide as its text, centred in its 32 px height.
          child: Align(
            widthFactor: 1,
            heightFactor: 1,
            child: Text(
              t.t(pending ? 'promote.completePayment' : 'promote.cta'),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: type.bodySmall.copyWith(
                color: colors.goldDark,
                fontWeight: FontWeight.w700,
              ),
            ),
          ),
        ),
      ),
    );
  }
}
