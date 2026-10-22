import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/api_error_text.dart';
import 'package:lawbid/core/l10n/l10n_formats.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/features/cases/presentation/widgets/detail_widgets.dart'
    show showConfirmSheet;
import 'package:lawbid/features/cases/presentation/widgets/practice_art.dart';
import 'package:lawbid/features/onboarding/domain/us_states.dart';
import 'package:lawbid/features/onboarding/presentation/widgets/option_picker_sheet.dart';
import 'package:lawbid/features/practice/practice_options.dart';
import 'package:lawbid/features/promotions/application/promotions_providers.dart';
import 'package:lawbid/features/promotions/domain/promotion_models.dart';
import 'package:lawbid/features/promotions/presentation/boost_colors.dart';
import 'package:lawbid/features/promotions/presentation/pending_payment_sheet.dart';
import 'package:lawbid/features/referrals/domain/referral_models.dart';
import 'package:lawbid/features/stars/application/stars_providers.dart';
import 'package:lawbid/features/subscription/application/subscription_providers.dart'
    show checkoutLauncherProvider, withAppPayPageLook;
import 'package:lawbid/features/subscription/domain/subscription_models.dart';
import 'package:lawbid/features/subscription/presentation/promo_code_field.dart';

/// Owner 2026-10-15 (mockup v4): the Boost setup in five steps — goal,
/// audience, budget and days (with the reach estimate), the button under
/// the ad, review and pay. The only way in is the «Boost» button on your
/// own post, reel or case.
const kBoostSteps = 5;

/// The CTA types, in the order of the mockup.
/// Owner 2026-10-19: no «Скачать» (a file link can carry a virus).
const kBoostCtaTypes = ['more', 'message', 'profile', 'call'];

final _phoneRe = RegExp(r'^\+[1-9]\d{6,14}$');

/// An https link to a real site (the server checks the shorteners and chat
/// apps too).
bool isValidBoostLink(String v) {
  final u = Uri.tryParse(v.trim());
  return u != null &&
      u.scheme == 'https' &&
      u.host.contains('.') &&
      u.userInfo.isEmpty;
}

bool isValidBoostPhone(String v) =>
    _phoneRe.hasMatch(v.replaceAll(RegExp(r'[\s\-()]'), ''));

class PromoteSheet extends ConsumerStatefulWidget {
  const PromoteSheet({
    required this.target,
    required this.id,
    required this.state,
    this.extend = false,
    this.resume,
    super.key,
  });

  final PromotionTarget target;
  final String id;
  final CasePromotionState state;

  /// Owner 2026-10-19: «Завершить оплату» on an unpaid promotion — its
  /// settings are kept, the sheet opens on the payment step and goes to the
  /// payment at once (no new start from step 1).
  final CasePromotion? resume;

  /// Owner 2026-10-15: add days to a running boost; they start when it ends.
  final bool extend;

  /// Owner 2026-10-22: an unpaid promotion ([resume]) first asks what to
  /// do — pay it, start over or cancel it (the payment is voided at Stripe
  /// by `POST /promotions/:id/stop`, the post stays as it was).
  static Future<void> show(
    BuildContext context, {
    required PromotionTarget target,
    required String id,
    required CasePromotionState state,
    bool extend = false,
    CasePromotion? resume,
  }) async {
    var keep = resume;
    if (resume != null) {
      final choice = await showPendingPaymentSheet(context, resume);
      if (choice == null || !context.mounted) return;
      if (choice != PendingPaymentChoice.pay) {
        final container = ProviderScope.containerOf(context, listen: false);
        final t = container.read(translatorProvider);
        if (choice == PendingPaymentChoice.cancel) {
          final ok = await showConfirmSheet(
            context,
            t: t,
            title: t.t('promote.pending.cancelTitle'),
            message: t.t('promote.pending.cancelMessage'),
            confirmLabel: t.t('promote.pending.cancelConfirm'),
            destructive: true,
          );
          if (!ok || !context.mounted) return;
        }
        try {
          final after = await container
              .read(promotionsRepositoryProvider)
              .stop(resume.id);
          container
            ..invalidate(promotionStateProvider(target, id))
            ..invalidate(myPromotionsProvider);
          if (!context.mounted) return;
          // Paid meanwhile: the server applied it instead of cancelling.
          if (after?.isRunning ?? false) {
            showAppSnackBar(context, t.t('promote.pending.alreadyPaid'));
            return;
          }
          if (choice == PendingPaymentChoice.cancel) {
            showAppSnackBar(context, t.t('promote.pending.canceled'));
            return;
          }
        } on Object catch (e) {
          if (context.mounted) showAppSnackBar(context, errorText(t, e));
          return;
        }
        // Start over: the wizard from step 1, nothing pre-filled.
        keep = null;
      }
    }
    if (!context.mounted) return;
    await showAppBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      builder: (_) => PromoteSheet(
        target: target,
        id: id,
        state: state,
        extend: extend,
        resume: keep,
      ),
    );
  }

  @override
  ConsumerState<PromoteSheet> createState() => _PromoteSheetState();
}

class _PromoteSheetState extends ConsumerState<PromoteSheet> {
  late PromotionQuote _quote = widget.state.quote;
  late int _days = _quote.days.clamp(1, _quote.maxDays);
  late int _budget = _initialBudget(_quote);
  int _step = 0;
  String _goal = 'views';
  bool _custom = false;
  PromotionAudience _audience = const PromotionAudience();
  // null = no button.
  String? _cta;
  final _link = TextEditingController();
  final _phone = TextEditingController();
  bool _ctaTouched = false;
  String? _promo;
  bool _withStars = false;
  bool _busy = false;
  Timer? _debounce;
  int _seq = 0;

  /// The price in stars when paying with the balance is possible: stars on,
  /// something to pay and no promo code (the server prices that itself).
  int? get _starsPrice {
    if (_promo != null || _quote.totalCents <= 0) return null;
    if (!ref.read(starsEnabledProvider)) return null;
    if (!(ref.read(starsOverviewProvider).value?.enabled ?? false)) {
      return null;
    }
    return _quote.starsTotal;
  }

  bool get _starsPay => _withStars && _starsPrice != null;

  bool get _starsShort =>
      _starsPay &&
      (ref.read(starsOverviewProvider).value?.balance ?? 0) < _starsPrice!;

  bool get _isPost => widget.target == PromotionTarget.post;

  static int _initialBudget(PromotionQuote q) {
    final b = q.dailyBudgetCents > 0 ? q.dailyBudgetCents : q.priceCentsPerDay;
    return b.clamp(q.minDailyBudgetCents, q.maxDailyBudgetCents);
  }

  @override
  void initState() {
    super.initState();
    final r = widget.resume;
    if (r != null) {
      _days = r.days.clamp(1, _quote.maxDays);
      if (r.priceCentsPerDay > 0) {
        _budget = r.priceCentsPerDay
            .clamp(_quote.minDailyBudgetCents, _quote.maxDailyBudgetCents);
      }
      _goal = r.goal ?? _goal;
      // A retired button («Download») is left out.
      if (_isPost && r.ctaType != null && kBoostCtaTypes.contains(r.ctaType)) {
        _cta = r.ctaType;
        if (_cta == 'call') {
          _phone.text = r.ctaValue ?? '';
        } else {
          _link.text = r.ctaValue ?? '';
        }
      }
      _step = kBoostSteps - 1;
    }
    _requote();
    if (r != null) {
      // Straight to the payment once the price is fresh.
      Future<void>.delayed(const Duration(milliseconds: 400), () {
        if (mounted && !_busy) _buy();
      });
    }
  }

  @override
  void dispose() {
    _debounce?.cancel();
    _link.dispose();
    _phone.dispose();
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
        for (final s in kRegions)
          PickerOption(value: s.code, label: s.name, keywords: s.aliases),
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
      remoteSearch: practiceRemoteSearch(ref),
    );
    if (picked != null && mounted) {
      setState(() => _audience = _audience.copyWith(topics: picked.toList()));
    }
  }

  bool get _needsLink => _cta == 'more' || _cta == 'download';
  bool get _needsPhone => _cta == 'call';

  bool get _ctaValid {
    if (!_isPost || _cta == null) return true;
    if (_needsLink) return isValidBoostLink(_link.text);
    if (_needsPhone) return isValidBoostPhone(_phone.text);
    return true;
  }

  String? get _ctaValue {
    if (!_isPost) return null;
    if (_needsLink) return _link.text.trim();
    if (_needsPhone) return _phone.text.replaceAll(RegExp(r'[\s\-()]'), '');
    return null;
  }

  void _next() {
    if (_step == 3 && !_ctaValid) {
      setState(() => _ctaTouched = true);
      return;
    }
    FocusScope.of(context).unfocus();
    setState(() => _step = (_step + 1).clamp(0, kBoostSteps - 1));
  }

  void _back() {
    FocusScope.of(context).unfocus();
    if (_step == 0) {
      Navigator.of(context).maybePop();
    } else {
      setState(() => _step -= 1);
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
            goal: _goal,
            ctaType: _isPost ? _cta : null,
            ctaValue: _ctaValue,
            extend: widget.extend,
            withStars: _starsPay,
          );
      if (!mounted) return;
      ref
        ..invalidate(starsOverviewProvider)
        ..invalidate(promotionStateProvider(widget.target, widget.id))
        ..invalidate(myPromotionsProvider);
      final url = r.checkoutUrl;
      if (url != null) {
        // Owner 2026-10-19: the payment page opens, or the sheet says why
        // not — never nothing. Owner 2026-10-22: it is our card page (card,
        // Apple Pay, Google Pay) with the app's theme and language, opened
        // the store-safe way (Safari on iPhone, this tab on the web).
        final uri = Uri.tryParse(url);
        final opened = uri != null &&
            await ref.read(checkoutLauncherProvider)(
              withAppPayPageLook(ref.read, uri),
            );
        if (!mounted) return;
        if (!opened) {
          setState(() => _busy = false);
          showAppSnackBar(
            context,
            t.t('error.api.PAYMENTS_NOT_CONFIGURED'),
          );
          return;
        }
      }
      Navigator.of(context).pop();
    } on Object catch (e) {
      if (!mounted) return;
      setState(() => _busy = false);
      showAppSnackBar(context, errorText(t, e));
    }
  }

  Future<PromoCheck> _validate(String code, SubscriptionPlan _) =>
      ref.read(promotionsRepositoryProvider).validatePromo(code);

  @override
  Widget build(BuildContext context) {
    final t = ref.watch(translatorProvider);
    final f = ref.watch(l10nFormatsProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final q = _quote;
    final last = _step == kBoostSteps - 1;
    if (ref.watch(starsEnabledProvider)) ref.watch(starsOverviewProvider);
    final payLabel = q.totalCents == 0
        ? t.t('promote.free')
        : _starsPay
            ? t.t('promote.pay.starsBtn', {'n': '${_starsPrice!}'})
            : t.t('promote.pay', {'price': f.currencyFromCents(q.totalCents)});
    final height = MediaQuery.sizeOf(context).height * 0.92;

    Widget title(String key) => Padding(
          padding: const EdgeInsets.only(bottom: AppSpacing.md),
          child: Text(
            t.t(key),
            style: type.titleMedium.copyWith(
              color: colors.text,
              fontWeight: FontWeight.w700,
            ),
          ),
        );

    final body = switch (_step) {
      0 => _goalStep(t, colors, type, title),
      1 => _audienceStep(t, colors, type, title),
      2 => _budgetStep(t, f, colors, type, title),
      3 => _ctaStep(t, colors, type, title),
      _ => _reviewStep(t, f, colors, type, title),
    };

    return SafeArea(
      top: false,
      child: SizedBox(
        height: height,
        child: Padding(
          padding: EdgeInsets.fromLTRB(
            AppSpacing.screenSide,
            AppSpacing.md,
            AppSpacing.screenSide,
            AppSpacing.md + MediaQuery.viewInsetsOf(context).bottom,
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const AppSheetHandle(),
              const SizedBox(height: AppSpacing.sm),
              Row(
                children: [
                  Expanded(
                    child: Text(
                      t.t(_isPost ? 'promote.post.title' : 'promote.title'),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: type.caption.copyWith(color: colors.textSecondary),
                    ),
                  ),
                  Text(
                    t.t('boost.step', {
                      'n': '${_step + 1}',
                      'total': '$kBoostSteps',
                    }),
                    style: type.caption.copyWith(color: colors.textSecondary),
                  ),
                ],
              ),
              const SizedBox(height: AppSpacing.xs),
              Row(
                children: [
                  for (var i = 0; i < kBoostSteps; i++) ...[
                    if (i > 0) const SizedBox(width: 4),
                    Expanded(
                      child: Container(
                        height: 4,
                        decoration: BoxDecoration(
                          color: i <= _step
                              ? colors.boostMark(colors.sheet)
                              : colors.border,
                          borderRadius: BorderRadius.circular(AppRadii.pill),
                        ),
                      ),
                    ),
                  ],
                ],
              ),
              const SizedBox(height: AppSpacing.lg),
              Expanded(
                child: SingleChildScrollView(
                  keyboardDismissBehavior:
                      ScrollViewKeyboardDismissBehavior.onDrag,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [body],
                  ),
                ),
              ),
              const SizedBox(height: AppSpacing.md),
              Row(
                children: [
                  Expanded(
                    flex: 2,
                    child: AppButton(
                      label: t.t('boost.back'),
                      variant: AppButtonVariant.secondary,
                      onPressed: _busy ? null : _back,
                    ),
                  ),
                  const SizedBox(width: AppSpacing.sm),
                  Expanded(
                    flex: 3,
                    child: AppButton(
                      label: last ? payLabel : t.t('boost.next'),
                      icon: last ? AppIcons.lockOutlineRounded : null,
                      isLoading: _busy,
                      onPressed: last ? (_starsShort ? null : _buy) : _next,
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  /// Card (the web checkout) or the star balance.
  List<Widget> _payChoice(
    Translator t,
    AppColorTokens colors,
    AppTypographyTokens type,
  ) {
    final balance = ref.read(starsOverviewProvider).value?.balance ?? 0;
    return [
      _choice(
        colors: colors,
        type: type,
        icon: AppIcons.creditCardRounded,
        label: t.t('promote.pay.card'),
        selected: !_withStars,
        onTap: () => setState(() => _withStars = false),
      ),
      _choice(
        colors: colors,
        type: type,
        icon: AppIcons.starRounded,
        label: t.t('promote.pay.stars'),
        sub: t.t('stars.send.balance', {'n': '$balance'}),
        selected: _withStars,
        onTap: () => setState(() => _withStars = true),
      ),
      if (_starsShort)
        Padding(
          padding: const EdgeInsets.only(bottom: AppSpacing.sm),
          child: Text(
            '${t.t('promote.pay.short')} · ${t.t('stars.topup.web')}',
            textAlign: TextAlign.center,
            style: type.caption.copyWith(color: colors.dangerText),
          ),
        ),
    ];
  }

  // --- 1 goal ----------------------------------------------------------

  Widget _choice({
    required AppColorTokens colors,
    required AppTypographyTokens type,
    required IconData icon,
    required String label,
    required bool selected,
    required VoidCallback onTap,
    String? sub,
    Widget? below,
  }) =>
      Padding(
        padding: const EdgeInsets.only(bottom: AppSpacing.sm),
        child: AppPressable(
          onTap: onTap,
          child: Container(
            padding: const EdgeInsets.all(AppSpacing.md),
            decoration: BoxDecoration(
              color: selected ? colors.goldTint : colors.surface,
              borderRadius: BorderRadius.circular(AppRadii.card),
              border: Border.all(
                color:
                    selected ? colors.boostMark(colors.surface) : colors.border,
                width: selected ? 1.5 : 1,
              ),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Row(
                  children: [
                    AppIcon(
                      icon,
                      color:
                          selected ? colors.boostInk() : colors.textSecondary,
                    ),
                    const SizedBox(width: AppSpacing.md),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            label,
                            style: type.body.copyWith(
                              color: selected
                                  ? readableOn(colors.text, colors.boostTint)
                                  : colors.text,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                          if (sub != null)
                            Text(
                              sub,
                              style: type.caption.copyWith(
                                color: selected
                                    ? readableOn(
                                        colors.textSecondary,
                                        colors.boostTint,
                                      )
                                    : colors.textSecondary,
                              ),
                            ),
                        ],
                      ),
                    ),
                    AppIcon(
                      selected
                          ? AppIcons.radioButtonCheckedRounded
                          : AppIcons.radioButtonUncheckedRounded,
                      color: selected ? colors.boostInk() : colors.border,
                    ),
                  ],
                ),
                if (below != null) ...[
                  const SizedBox(height: AppSpacing.sm),
                  below,
                ],
              ],
            ),
          ),
        ),
      );

  Widget _goalStep(
    Translator t,
    AppColorTokens colors,
    AppTypographyTokens type,
    Widget Function(String) title,
  ) {
    final goals = _isPost
        ? const [
            ('views', AppIcons.visibilityOutlined, 'boost.goal.views'),
            ('clicks', AppIcons.linkRounded, 'boost.goal.clicks'),
            (
              'messages',
              AppIcons.chatBubbleOutlineRounded,
              'boost.goal.messages',
            ),
            (
              'followers',
              AppIcons.personAddAlt1Rounded,
              'boost.goal.followers',
            ),
          ]
        : const [
            ('views', AppIcons.visibilityOutlined, 'boost.goal.case.views'),
            ('messages', AppIcons.groups2Outlined, 'boost.goal.case.bids'),
          ];
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        title('boost.goal.title'),
        for (final (id, icon, key) in goals)
          _choice(
            colors: colors,
            type: type,
            icon: icon,
            label: t.t(key),
            sub: t.t('$key.sub'),
            selected: _goal == id,
            onTap: () => setState(() => _goal = id),
          ),
      ],
    );
  }

  // --- 2 audience --------------------------------------------------------

  Widget _chips<T>(
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

  Widget _audienceStep(
    Translator t,
    AppColorTokens colors,
    AppTypographyTokens type,
    Widget Function(String) title,
  ) {
    if (!_isPost) {
      return Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          title('boost.audience.title'),
          Container(
            padding: const EdgeInsets.all(AppSpacing.lg),
            decoration: BoxDecoration(
              color: colors.goldTint,
              borderRadius: BorderRadius.circular(AppRadii.card),
            ),
            child: Row(
              children: [
                AppIcon(AppIcons.groups2Outlined, color: colors.boostInk()),
                const SizedBox(width: AppSpacing.md),
                Expanded(
                  child: Text(
                    t.t('boost.audience.case'),
                    style: type.body.copyWith(color: colors.text),
                  ),
                ),
              ],
            ),
          ),
        ],
      );
    }
    const roles = ['all', 'attorneys', 'clients'];
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        title('boost.audience.title'),
        _chips<bool>(
          [false, true],
          _custom,
          (c) => t.t(c ? 'promote.audience.custom' : 'promote.audience.auto'),
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
          _chips<String>(
            roles,
            _audience.role,
            (r) => t.t('promote.audience.role.$r'),
            (r) => setState(() => _audience = _audience.copyWith(role: r)),
          ),
          const SizedBox(height: AppSpacing.md),
          PickerField(
            label: t.t('promote.audience.states'),
            placeholder: t.t('promote.audience.any'),
            value:
                _audience.states.isEmpty ? null : _audience.states.join(', '),
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
    );
  }

  // --- 3 budget and days ----------------------------------------------

  Widget _estimate(
    Translator t,
    L10nFormats f,
    AppColorTokens colors,
    AppTypographyTokens type,
  ) {
    final q = _quote;
    return Container(
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
            style: type.bodySmall.copyWith(
              color: readableOn(colors.textSecondary, colors.boostTint),
            ),
          ),
          const SizedBox(height: AppSpacing.xs),
          FitText(
            t.t('promote.estimate.people', {
              'min': f.number(q.estReachMin),
              'max': f.number(q.estReachMax),
            }),
            style: type.titleLarge.copyWith(
              color: readableOn(colors.text, colors.boostTint),
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
            style: type.bodySmall.copyWith(
              color: readableOn(colors.textSecondary, colors.boostTint),
            ),
          ),
        ],
      ),
    );
  }

  Widget _budgetStep(
    Translator t,
    L10nFormats f,
    AppColorTokens colors,
    AppTypographyTokens type,
    Widget Function(String) title,
  ) {
    final base = widget.state.quote;
    final budgetPresets = base.budgetPresetsCents
        .where(
          (c) => c >= base.minDailyBudgetCents && c <= base.maxDailyBudgetCents,
        )
        .toList();
    final dayPresets =
        base.durationPresets.where((d) => d >= 1 && d <= base.maxDays).toList();
    final budgetRange = base.maxDailyBudgetCents - base.minDailyBudgetCents;
    final budgetSteps = (budgetRange / 100).round().clamp(0, 500);
    Widget section(String key) => Padding(
          padding: const EdgeInsets.only(
            top: AppSpacing.md,
            bottom: AppSpacing.sm,
          ),
          child: Text(
            t.t(key),
            style: type.body.copyWith(
              color: colors.text,
              fontWeight: FontWeight.w700,
            ),
          ),
        );
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        title('boost.budget.title'),
        section('promote.budget'),
        if (budgetPresets.isNotEmpty)
          _chips<int>(
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
          t.t('promote.perDay', {'price': f.currencyFromCents(_budget)}),
          style: type.bodySmall.copyWith(color: colors.textSecondary),
        ),
        section('promote.duration'),
        if (dayPresets.isNotEmpty)
          _chips<int>(
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
        _estimate(t, f, colors, type),
      ],
    );
  }

  // --- 4 button -----------------------------------------------------------

  static IconData _ctaIcon(String type) => switch (type) {
        'more' => AppIcons.linkRounded,
        'message' => AppIcons.chatBubbleOutlineRounded,
        'profile' => AppIcons.personOutlineRounded,
        'download' => AppIcons.downloadRounded,
        _ => AppIcons.callRounded,
      };

  Widget _ctaStep(
    Translator t,
    AppColorTokens colors,
    AppTypographyTokens type,
    Widget Function(String) title,
  ) {
    if (!_isPost) {
      return Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          title('boost.cta.title'),
          Text(
            t.t('boost.cta.caseFixed'),
            style: type.body.copyWith(color: colors.textSecondary),
          ),
          const SizedBox(height: AppSpacing.md),
          IgnorePointer(
            child: AppButton(
              label: t.t('boost.cta.respond'),
              onPressed: () {},
            ),
          ),
        ],
      );
    }
    final allowed = [
      for (final c in kBoostCtaTypes)
        if (_quote.ctaTypes.contains(c)) c,
    ];
    Widget field(
      TextEditingController c,
      String labelKey,
      String badKey,
      TextInputType kb, {
      required bool ok,
    }) =>
        AppTextField(
          controller: c,
          label: t.t(labelKey),
          keyboardType: kb,
          errorText: _ctaTouched && !ok ? t.t(badKey) : null,
          onChanged: (_) => setState(() {}),
        );
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        title('boost.cta.title'),
        _choice(
          colors: colors,
          type: type,
          icon: AppIcons.visibilityOutlined,
          label: t.t('boost.cta.none'),
          selected: _cta == null,
          onTap: () => setState(() => _cta = null),
        ),
        for (final c in allowed)
          _choice(
            colors: colors,
            type: type,
            icon: _ctaIcon(c),
            label: t.t('boost.cta.$c'),
            selected: _cta == c,
            onTap: () => setState(() {
              _cta = c;
              _ctaTouched = false;
            }),
            below: _cta == c && (c == 'more' || c == 'download')
                ? field(
                    _link,
                    'boost.cta.link',
                    'boost.cta.link.bad',
                    TextInputType.url,
                    ok: isValidBoostLink(_link.text),
                  )
                : _cta == c && c == 'call'
                    ? field(
                        _phone,
                        'boost.cta.phone',
                        'boost.cta.phone.bad',
                        TextInputType.phone,
                        ok: isValidBoostPhone(_phone.text),
                      )
                    : null,
          ),
      ],
    );
  }

  // --- 5 review ------------------------------------------------------------

  Widget _reviewStep(
    Translator t,
    L10nFormats f,
    AppColorTokens colors,
    AppTypographyTokens type,
    Widget Function(String) title,
  ) {
    final q = _quote;
    Widget row(String labelKey, String value) => Padding(
          padding: const EdgeInsets.symmetric(vertical: AppSpacing.xs),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                flex: 2,
                child: Text(
                  t.t(labelKey),
                  style: type.bodySmall.copyWith(color: colors.textSecondary),
                ),
              ),
              Expanded(
                flex: 3,
                child: Text(
                  value,
                  textAlign: TextAlign.end,
                  style: type.body.copyWith(
                    color: colors.text,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
            ],
          ),
        );
    final goalKey = _isPost
        ? 'boost.goal.$_goal'
        : (_goal == 'messages'
            ? 'boost.goal.case.bids'
            : 'boost.goal.case.views');
    final audience = !_isPost
        ? t.t('boost.audience.case')
        : t.t(_custom ? 'promote.audience.custom' : 'promote.audience.auto');
    final button = !_isPost
        ? t.t('boost.cta.respond')
        : t.t(_cta == null ? 'boost.cta.none' : 'boost.cta.$_cta');
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        title('boost.review.title'),
        Container(
          padding: const EdgeInsets.symmetric(
            horizontal: AppSpacing.lg,
            vertical: AppSpacing.sm,
          ),
          decoration: BoxDecoration(
            color: colors.surface,
            borderRadius: BorderRadius.circular(AppRadii.card),
            border: Border.all(color: colors.border),
          ),
          child: Column(
            children: [
              row('boost.review.goal', t.t(goalKey)),
              row('boost.review.audience', audience),
              row(
                'boost.review.budget',
                '${f.currencyFromCents(_budget)} · '
                    '${t.t('promote.days', {'days': '$_days'})}',
              ),
              row('boost.review.button', button),
            ],
          ),
        ),
        const SizedBox(height: AppSpacing.md),
        _estimate(t, f, colors, type),
        if (q.creditDaysUsed > 0)
          Padding(
            padding: const EdgeInsets.only(top: AppSpacing.sm),
            child: Text(
              t.t('promote.credits', {
                'days': formatRewardNumber(q.creditDaysUsed),
              }),
              textAlign: TextAlign.center,
              style: type.caption.copyWith(
                color: readableOn(colors.success, colors.sheet),
              ),
            ),
          ),
        const SizedBox(height: AppSpacing.md),
        if (_starsPrice != null) ..._payChoice(t, colors, type),
        PromoCodeField(
          t: t,
          formats: f,
          plan: SubscriptionPlan.monthly,
          validate: _validate,
          onChanged: (c) => setState(() => _promo = c),
        ),
        const SizedBox(height: AppSpacing.sm),
        Text(
          t.t('boost.review.note'),
          textAlign: TextAlign.center,
          style: type.caption.copyWith(color: colors.textSecondary),
        ),
      ],
    );
  }
}
