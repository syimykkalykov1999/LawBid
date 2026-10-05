import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/api_error_text.dart';
import 'package:lawbid/core/l10n/l10n_formats.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/features/case_payments/application/case_payments_providers.dart';
import 'package:lawbid/features/case_payments/domain/case_payment_models.dart';
import 'package:lawbid/features/case_payments/presentation/case_payment_widgets.dart';
import 'package:lawbid/features/cases/presentation/widgets/async_views.dart';
import 'package:lawbid/features/cases/presentation/widgets/case_status.dart';

/// Owner 2026-10-05 — Settings → «Приём оплат»: the attorney's Stripe
/// Express account (connect / continue / dashboard) and the legal text.
class PayoutAccountScreen extends ConsumerStatefulWidget {
  const PayoutAccountScreen({super.key});

  @override
  ConsumerState<PayoutAccountScreen> createState() =>
      _PayoutAccountScreenState();
}

class _PayoutAccountScreenState extends ConsumerState<PayoutAccountScreen>
    with WidgetsBindingObserver {
  bool _busy = false;

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

  // Back from Stripe's onboarding: re-read the account.
  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      ref.invalidate(payoutAccountProvider);
    }
  }

  Future<void> _refresh() async {
    ref.invalidate(payoutAccountProvider);
    await ref.read(payoutAccountProvider.future);
  }

  Future<void> _setFeePayer(String v) async {
    final t = ref.read(translatorProvider);
    try {
      await ref.read(casePaymentsRepositoryProvider).setFeePayer(v);
      ref.invalidate(payoutAccountProvider);
      if (mounted) {
        showAppSnackBar(context, t.t('cpay.payout.feePayer.saved'));
      }
    } on Object catch (e) {
      if (mounted) showAppSnackBar(context, errorText(t, e));
    }
  }

  Future<void> _open(Future<String> Function() link) async {
    final t = ref.read(translatorProvider);
    setState(() => _busy = true);
    try {
      final url = await link();
      if (!mounted) return;
      await openExternal(url);
    } on Object catch (e) {
      if (mounted) showAppSnackBar(context, errorText(t, e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = ref.watch(translatorProvider);
    final f = ref.watch(l10nFormatsProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final value = ref.watch(payoutAccountProvider);
    final settings = ref.watch(paymentSettingsProvider).value;
    final repo = ref.read(casePaymentsRepositoryProvider);

    return Scaffold(
      backgroundColor: colors.bg,
      appBar: AppTopBar(
        leading: AppBackButton(
          semanticLabel: t.t('common.back'),
          onPressed: () => Navigator.of(context).maybePop(),
        ),
        title: Text(t.t('cpay.payout.title')),
      ),
      body: AsyncDetailBody<PayoutAccount>(
        value: value,
        t: t,
        onRetry: _refresh,
        builder: (a) {
          final tone = switch (a.status) {
            PayoutAccountStatus.active => StatusTone.success,
            PayoutAccountStatus.onboarding ||
            PayoutAccountStatus.pending =>
              StatusTone.info,
            PayoutAccountStatus.restricted => StatusTone.warning,
            PayoutAccountStatus.disabled => StatusTone.danger,
            PayoutAccountStatus.none => StatusTone.neutral,
          };
          final String? cta;
          final Future<String> Function()? ctaLink;
          switch (a.status) {
            case PayoutAccountStatus.none:
              cta = t.t('cpay.payout.connect');
              ctaLink = repo.startOnboarding;
            case PayoutAccountStatus.pending:
            case PayoutAccountStatus.onboarding:
              cta = t.t('cpay.payout.continue');
              ctaLink = repo.startOnboarding;
            case PayoutAccountStatus.restricted:
              cta = t.t('cpay.payout.fix');
              ctaLink = repo.startOnboarding;
            case PayoutAccountStatus.active:
            case PayoutAccountStatus.disabled:
              cta = null;
              ctaLink = null;
          }
          return RefreshIndicator(
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
              children: [
                AppCard(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          AppIconMedallion(
                            icon: AppIcons.accountBalanceOutlined,
                            tone: switch (tone) {
                              StatusTone.success => AppMedallionTone.success,
                              StatusTone.danger => AppMedallionTone.danger,
                              StatusTone.neutral => AppMedallionTone.neutral,
                              _ => AppMedallionTone.gold,
                            },
                          ),
                          const SizedBox(width: AppSpacing.md),
                          Expanded(
                            child: Text(
                              t.t('cpay.payout.status.${a.status.name}'),
                              style:
                                  type.titleMedium.copyWith(color: colors.text),
                            ),
                          ),
                          const SizedBox(width: AppSpacing.sm),
                          StatusPill(
                            label: a.canReceive
                                ? t.t('cpay.status.succeeded')
                                : t.t('cpay.payout.status.none'),
                            tone: tone,
                          ),
                        ],
                      ),
                      const SizedBox(height: AppSpacing.md),
                      Text(
                        a.status == PayoutAccountStatus.active
                            ? t.t('cpay.payout.readyNote')
                            : t.t('cpay.payout.sub'),
                        style: type.bodySmall
                            .copyWith(color: colors.textSecondary),
                      ),
                      if (a.requirementsDue.isNotEmpty) ...[
                        const SizedBox(height: AppSpacing.sm),
                        Text(
                          t.t('cpay.payout.requirements', {
                            'items': a.requirementsDue.join(', '),
                          }),
                          style: type.caption.copyWith(color: colors.warning),
                        ),
                      ],
                      if (a.disabledReason != null) ...[
                        const SizedBox(height: AppSpacing.sm),
                        Text(
                          a.disabledReason!,
                          style:
                              type.caption.copyWith(color: colors.dangerText),
                        ),
                      ],
                      if (!a.available) ...[
                        const SizedBox(height: AppSpacing.sm),
                        Text(
                          t.t('cpay.payout.unavailable'),
                          style: type.caption
                              .copyWith(color: colors.textSecondary),
                        ),
                      ],
                      if (a.available && cta != null && ctaLink != null) ...[
                        const SizedBox(height: AppSpacing.lg),
                        AppButton(
                          label: cta,
                          icon: AppIcons.openInNewRounded,
                          isLoading: _busy,
                          onPressed: () => _open(ctaLink!),
                        ),
                      ],
                      if (a.status != PayoutAccountStatus.none &&
                          a.detailsSubmitted) ...[
                        const SizedBox(height: AppSpacing.sm),
                        AppButton(
                          label: t.t('cpay.payout.dashboard'),
                          icon: AppIcons.openInNewRounded,
                          variant: AppButtonVariant.secondary,
                          isLoading: _busy,
                          onPressed: () => _open(repo.dashboardLink),
                        ),
                      ],
                    ],
                  ),
                ),
                if (a.status != PayoutAccountStatus.none) ...[
                  const SizedBox(height: AppSpacing.lg),
                  AppCard(
                    padding: const EdgeInsets.all(AppSpacing.md),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          t.t('cpay.payout.feePayer.title'),
                          style: type.titleMedium.copyWith(color: colors.text),
                        ),
                        const SizedBox(height: AppSpacing.xs),
                        Text(
                          t.t('cpay.payout.feePayer.sub'),
                          style: type.caption
                              .copyWith(color: colors.textSecondary),
                        ),
                        const SizedBox(height: AppSpacing.sm),
                        FeePayerChips(
                          value: a.processingFeePayer,
                          t: t,
                          onChanged: _setFeePayer,
                        ),
                        if (a.processingFeePayerIsDefault) ...[
                          const SizedBox(height: AppSpacing.xs),
                          Text(
                            t.t('cpay.payout.feePayer.isDefault'),
                            style: type.caption
                                .copyWith(color: colors.textSecondary),
                          ),
                        ],
                      ],
                    ),
                  ),
                ],
                if (settings != null) ...[
                  const SizedBox(height: AppSpacing.lg),
                  Text(
                    t.t('cpay.payout.legal'),
                    style: type.caption.copyWith(color: colors.textSecondary),
                  ),
                  const SizedBox(height: AppSpacing.sm),
                  PaymentDisclaimer(text: settings.disclaimer(f.locale), t: t),
                ],
              ],
            ),
          );
        },
      ),
    );
  }
}
