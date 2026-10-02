import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/api_error_text.dart';
import 'package:lawbid/core/l10n/l10n_formats.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/features/promotions/application/promotions_providers.dart';
import 'package:lawbid/features/promotions/domain/promotion_models.dart';
import 'package:lawbid/features/subscription/domain/subscription_models.dart';
import 'package:lawbid/features/subscription/presentation/promo_code_field.dart';
import 'package:url_launcher/url_launcher.dart';

/// Owner 2026-10-02 — "Promote this case" on the client's open case: the
/// running promotion (days left, views) or a button to buy days.
class PromoteCaseCard extends ConsumerStatefulWidget {
  const PromoteCaseCard({required this.caseId, super.key});

  final String caseId;

  @override
  ConsumerState<PromoteCaseCard> createState() => _PromoteCaseCardState();
}

class _PromoteCaseCardState extends ConsumerState<PromoteCaseCard>
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
      ref.invalidate(casePromotionProvider(widget.caseId));
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = ref.watch(translatorProvider);
    final f = ref.watch(l10nFormatsProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final state = ref.watch(casePromotionProvider(widget.caseId)).value;
    // Nothing until the server says promotions exist for this case.
    if (state == null || !state.quote.enabled) return const SizedBox.shrink();
    final p = state.promotion;
    final running = p != null &&
        (p.status == PromotionStatus.active ||
            p.status == PromotionStatus.pendingPayment);
    if (!running && !state.canPromote) return const SizedBox.shrink();

    String line() {
      if (p == null) return t.t('promote.sub');
      if (p.status == PromotionStatus.pendingPayment) {
        return t.t('promote.pending');
      }
      final end = p.endsAt;
      return t.t('promote.active', {
        'date': end == null ? '' : f.date(end),
        'views': '${p.impressions}',
      });
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
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              AppIcon(AppIcons.campaignRounded, color: colors.goldDark),
              const SizedBox(width: AppSpacing.sm),
              Text(
                t.t('promote.title'),
                style: type.titleMedium.copyWith(
                  color: colors.text,
                  fontFamily: type.body.fontFamily,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ],
          ),
          const SizedBox(height: AppSpacing.xs),
          Text(
            line(),
            style: type.bodySmall.copyWith(color: colors.textSecondary),
          ),
          if (state.canPromote) ...[
            const SizedBox(height: AppSpacing.md),
            AppButton(
              label: running ? t.t('promote.extend') : t.t('promote.cta'),
              icon: AppIcons.campaignOutlined,
              onPressed: () =>
                  _PromoteSheet.show(context, widget.caseId, state),
            ),
          ],
        ],
      ),
    );
  }
}

class _PromoteSheet extends ConsumerStatefulWidget {
  const _PromoteSheet({required this.caseId, required this.state});

  final String caseId;
  final CasePromotionState state;

  static Future<void> show(
    BuildContext context,
    String caseId,
    CasePromotionState state,
  ) =>
      showAppBottomSheet<void>(
        context: context,
        isScrollControlled: true,
        builder: (_) => _PromoteSheet(caseId: caseId, state: state),
      );

  @override
  ConsumerState<_PromoteSheet> createState() => _PromoteSheetState();
}

class _PromoteSheetState extends ConsumerState<_PromoteSheet> {
  late int _days = widget.state.quote.days.clamp(1, widget.state.quote.maxDays);
  late PromotionQuote _quote = widget.state.quote;
  String? _promo;
  bool _busy = false;

  Future<void> _setDays(int d) async {
    final next = d.clamp(1, widget.state.quote.maxDays);
    setState(() => _days = next);
    try {
      final q = await ref.read(promotionsRepositoryProvider).quote(next);
      if (mounted && _days == next) setState(() => _quote = q);
    } on Object {
      // Keep the last quote; the server prices the purchase anyway.
    }
  }

  Future<void> _buy() async {
    final t = ref.read(translatorProvider);
    setState(() => _busy = true);
    try {
      final r = await ref.read(promotionsRepositoryProvider).buy(
            widget.caseId,
            days: _days,
            promoCode: _promo,
          );
      if (!mounted) return;
      ref.invalidate(casePromotionProvider(widget.caseId));
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
    final q = _quote;
    final credit = q.creditDaysUsed;
    final label = q.totalCents == 0
        ? t.t('promote.free')
        : t.t('promote.pay', {'price': f.currencyFromCents(q.totalCents)});
    return Padding(
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
              t.t('promote.title'),
              style: type.titleMedium.copyWith(color: colors.text),
            ),
            const SizedBox(height: AppSpacing.xs),
            Text(
              t.t('promote.perDay', {
                'price': f.currencyFromCents(q.priceCentsPerDay),
              }),
              style: type.bodySmall.copyWith(color: colors.textSecondary),
            ),
            const SizedBox(height: AppSpacing.lg),
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                AppIconButton(
                  icon: const AppIcon(AppIcons.removeRounded),
                  semanticLabel: t.t('promote.fewer'),
                  onPressed: _days > 1 ? () => _setDays(_days - 1) : null,
                ),
                SizedBox(
                  width: 120,
                  child: Text(
                    t.t('promote.days', {'days': '$_days'}),
                    textAlign: TextAlign.center,
                    style: type.titleLarge.copyWith(color: colors.text),
                  ),
                ),
                AppIconButton(
                  icon: const AppIcon(AppIcons.addRounded),
                  semanticLabel: t.t('promote.more'),
                  onPressed: _days < widget.state.quote.maxDays
                      ? () => _setDays(_days + 1)
                      : null,
                ),
              ],
            ),
            if (credit > 0)
              Padding(
                padding: const EdgeInsets.only(top: AppSpacing.sm),
                child: Text(
                  t.t('promote.credits', {'days': '$credit'}),
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
          ],
        ),
      ),
    );
  }

  Future<PromoCheck> _validate(String code, SubscriptionPlan _) =>
      ref.read(promotionsRepositoryProvider).validatePromo(code);
}

String promotionStatusLabel(Translator t, PromotionStatus s) =>
    t.t('promote.status.${s.wire}');
