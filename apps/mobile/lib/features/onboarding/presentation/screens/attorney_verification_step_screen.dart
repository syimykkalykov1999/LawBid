import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/l10n_formats.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/navigation/app_routes.dart';
import 'package:lawbid/features/cases/presentation/screens/attorney_cases_tab.dart'
    show myPracticesProvider;
import 'package:lawbid/features/onboarding/application/current_user_controller.dart';
import 'package:lawbid/features/onboarding/application/onboarding_actions.dart';
import 'package:lawbid/features/onboarding/domain/attorney_setup.dart';
import 'package:lawbid/features/onboarding/domain/onboarding_step_id.dart';
import 'package:lawbid/features/onboarding/onboarding_routes.dart';
import 'package:lawbid/features/onboarding/presentation/widgets/onboarding_scaffold.dart';
import 'package:lawbid/features/profile/presentation/screens/practices_screen.dart';
import 'package:lawbid/features/subscription/application/subscription_providers.dart';
import 'package:lawbid/features/subscription/domain/subscription_models.dart';
import 'package:lawbid/features/subscription/presentation/subscription_offer.dart';
import 'package:lawbid/features/verification/application/verification_overview_controller.dart';

enum ChecklistStatus { done, next, locked }

/// `/onboarding/verification` — the attorney's setup (owner 2026-10-04,
/// docs/onboarding-lawyer.md): ONE coordinator that shows exactly one stage
/// at a time, decided by the server state ([attorneySetupStage]):
/// licence → practice areas → subscription offer → (done) → tour.
///
/// Every stage is shown in place (no pushed screen to come back from), and
/// the state is re-read from the server after each save, so a stage never
/// repeats and "Back" never lands on the same step again.
class AttorneyVerificationStepScreen extends ConsumerStatefulWidget {
  const AttorneyVerificationStepScreen({super.key});

  @override
  ConsumerState<AttorneyVerificationStepScreen> createState() =>
      _AttorneyVerificationStepScreenState();
}

class _AttorneyVerificationStepScreenState
    extends ConsumerState<AttorneyVerificationStepScreen> {
  void _back() {
    final role = ref.read(currentUserRoleProvider);
    final previous = OnboardingStepId.verification.previousFor(role);
    if (previous != null) context.go(OnboardingRoutes.forStep(previous));
  }

  void _advance() => ref
      .read(onboardingActionsProvider.notifier)
      .advance(OnboardingStepId.verification);

  /// The licence form (state + bar number + sworn checkbox). Back here,
  /// the verification state and the signed-in user (its verification
  /// flag unlocks practices, cases and bids) are re-read from the server.
  Future<void> _openLicense(VerificationView view) async {
    await context.push(
      view == VerificationView.needsMoreInfo ||
              view == VerificationView.rejected
          ? AppRoutes.verification
          : AppRoutes.verificationWizard,
    );
    if (!mounted) return;
    ref.invalidate(verificationOverviewProvider);
    await ref.read(currentUserControllerProvider.notifier).load();
  }

  void _practicesSaved() {
    ref
      ..invalidate(myPracticesProvider)
      ..invalidate(practicesEditorDataProvider);
  }

  @override
  Widget build(BuildContext context) {
    final t = ref.watch(translatorProvider);
    final action = ref.watch(onboardingActionsProvider);
    final verification = ref.watch(verificationOverviewProvider);

    // Each source is read only once the previous stage is complete.
    final view = switch (verification) {
      AsyncData(:final value) => viewOf(value),
      _ => null,
    };
    final practices = view == VerificationView.verified
        ? ref.watch(myPracticesProvider)
        : null;
    final hasPractices = practices?.value?.isNotEmpty;
    final subscription =
        hasPractices ?? false ? ref.watch(subscriptionOverviewProvider) : null;
    final pendingError =
        verification.error ?? practices?.error ?? subscription?.error;
    final loading = view == null ||
        (view == VerificationView.verified && hasPractices == null) ||
        (hasPractices ?? false) && subscription?.value == null;

    if (pendingError != null && loading) {
      return OnboardingScaffold(
        step: OnboardingStepId.verification,
        title: t.t('onboarding.attorney.license.title'),
        onBack: _back,
        error: pendingError,
        primaryLabel: t.t('error.retry'),
        onPrimary: () => ref
          ..invalidate(verificationOverviewProvider)
          ..invalidate(myPracticesProvider)
          ..invalidate(subscriptionOverviewProvider),
        children: const [],
      );
    }
    if (loading) {
      return OnboardingScaffold(
        key: const ValueKey('attorney-setup-loading'),
        step: OnboardingStepId.verification,
        title: t.t('onboarding.attorney.license.title'),
        onBack: _back,
        children: const [AppSkeletonCard()],
      );
    }

    final stage = attorneySetupStage(
      verification: view,
      hasPractices: hasPractices,
      subscriptionActive: subscription?.value?.isActive,
      offerSkipped: ref.watch(subscriptionOfferSkippedProvider),
    );
    final progress = _progress(stage);

    switch (stage) {
      case AttorneySetupStage.license:
        return OnboardingScaffold(
          key: const ValueKey('attorney-setup-license'),
          step: OnboardingStepId.verification,
          progress: progress,
          title: t.t('onboarding.attorney.license.title'),
          subtitle: t.t('onboarding.attorney.license.subtitle'),
          onBack: _back,
          error: action.error,
          primaryLabel: switch (view) {
            VerificationView.draft => t.t('onboarding.attorney.license.resume'),
            VerificationView.needsMoreInfo ||
            VerificationView.rejected =>
              t.t('onboarding.attorney.license.fix'),
            _ => t.t('onboarding.attorney.license.cta'),
          },
          onPrimary: () => _openLicense(view),
          children: const [
            Center(
              child: AppIconMedallion(
                icon: AppIcons.verifiedUserOutlined,
                size: AppSizes.rowMedallion * 2,
                iconSize: AppSizes.iconLg,
              ),
            ),
          ],
        );
      case AttorneySetupStage.licensePending:
        return OnboardingScaffold(
          key: const ValueKey('attorney-setup-pending'),
          step: OnboardingStepId.verification,
          progress: progress,
          title: t.t('onboarding.attorney.license.pending.title'),
          subtitle: t.t('onboarding.attorney.license.pending.body'),
          onBack: _back,
          error: action.error,
          primaryLabel: t.t('onboarding.verification.continue'),
          primaryLoading: action.busy,
          onPrimary: _advance,
          children: const [],
        );
      case AttorneySetupStage.practices:
        final data = ref.watch(practicesEditorDataProvider);
        return OnboardingScaffold(
          key: const ValueKey('attorney-setup-practices'),
          step: OnboardingStepId.verification,
          progress: progress,
          title: t.t('onboarding.attorney.practices.title'),
          onBack: _back,
          error: data.error,
          body: switch (data) {
            AsyncData(:final value) => PracticesEditor(
                tree: value.tree,
                initial: value.selected,
                saveLabel: t.t('onboarding.attorney.practices.save'),
                onSaved: _practicesSaved,
              ),
            _ => const Padding(
                padding: EdgeInsets.all(AppSpacing.screenSide),
                child: AppSkeletonCard(),
              ),
          },
          children: const [],
        );
      case AttorneySetupStage.subscription:
        return _SubscriptionStage(
          overview: subscription!.requireValue,
          progress: progress,
          onBack: _back,
          onDone: _advance,
        );
      case AttorneySetupStage.done:
        return OnboardingScaffold(
          key: const ValueKey('attorney-setup-done'),
          step: OnboardingStepId.verification,
          progress: progress,
          title: t.t('onboarding.verification.title'),
          onBack: _back,
          error: action.error,
          primaryLabel: t.t('onboarding.verification.continue'),
          primaryLoading: action.busy,
          onPrimary: _advance,
          children: [
            VerificationChecklist(
              items: [
                (
                  t.t('onboarding.verification.item.license'),
                  null,
                  ChecklistStatus.done,
                ),
                (
                  t.t('onboarding.attorney.practices.title'),
                  null,
                  ChecklistStatus.done,
                ),
                (
                  t.t('onboarding.verification.item.subscription'),
                  null,
                  ChecklistStatus.done,
                ),
              ],
              statusLabels: {
                ChecklistStatus.done:
                    t.t('onboarding.verification.status.done'),
                ChecklistStatus.next:
                    t.t('onboarding.verification.status.next'),
                ChecklistStatus.locked:
                    t.t('onboarding.verification.status.locked'),
              },
            ),
          ],
        );
    }
  }

  /// The overall onboarding bar with this step split into its three
  /// stages (licence, practices, subscription).
  (int, int) _progress(AttorneySetupStage stage) {
    final order = OnboardingStepId.orderFor(ref.read(currentUserRoleProvider));
    final index = order.indexOf(OnboardingStepId.verification);
    const extra = AttorneySetupStage.segments - 1;
    return (index + 1 + stage.segment, order.length + extra);
  }
}

/// "Later" on the onboarding offer, kept for the session.
final subscriptionOfferSkippedProvider =
    NotifierProvider<SubscriptionOfferSkipped, bool>(
  SubscriptionOfferSkipped.new,
);

class SubscriptionOfferSkipped extends Notifier<bool> {
  @override
  bool build() => false;

  void skip() => state = true;
}

/// "7 days free, a card at the start" — the same offer the bid button
/// opens later (subscription_offer.dart). "Start 7 days free" pays on
/// Stripe's page and moves on once active; "Later" moves on without it.
class _SubscriptionStage extends ConsumerWidget {
  const _SubscriptionStage({
    required this.overview,
    required this.progress,
    required this.onBack,
    required this.onDone,
  });

  final SubscriptionOverview overview;
  final (int, int) progress;
  final VoidCallback onBack;
  final VoidCallback onDone;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final formats = ref.watch(l10nFormatsProvider);
    final action = ref.watch(onboardingActionsProvider);
    final subscribe = ref.watch(subscribeControllerProvider);
    final texts = offerTexts(t, overview, formats.currencyFromCents);
    final kind = offerKindOf(overview);
    final waiting = subscribe.phase == SubscribePhase.awaitingPayment;
    final canPay = kind == OfferKind.trial || kind == OfferKind.paid;
    return OnboardingScaffold(
      key: const ValueKey('attorney-setup-subscription'),
      step: OnboardingStepId.verification,
      progress: progress,
      title: texts.title,
      subtitle: texts.body,
      onBack: onBack,
      error: action.error,
      primaryLabel: canPay ? texts.cta : null,
      primaryLoading: subscribe.busy,
      onPrimary: () async {
        if (await startSubscriptionFromOffer(context, ref)) onDone();
      },
      footnote: waiting ? t.t('plans.waiting') : null,
      secondary: AppButton(
        key: const ValueKey('offer-later'),
        label: waiting
            ? t.t('plans.waiting.stop')
            : t.t('subscription.offer.later'),
        variant: AppButtonVariant.secondary,
        isLoading: action.busy,
        onPressed: waiting
            ? () => ref.read(subscribeControllerProvider.notifier).stopWaiting()
            : () {
                ref.read(subscriptionOfferSkippedProvider.notifier).skip();
                onDone();
              },
      ),
      children: const [SubscriptionOfferBenefits()],
    );
  }
}

/// Vertical checklist with a connecting rail — also reused by the Mine
/// tab's verification banner.
class VerificationChecklist extends StatelessWidget {
  const VerificationChecklist({
    required this.items,
    required this.statusLabels,
    super.key,
  });

  final List<(String title, String? description, ChecklistStatus status)> items;
  final Map<ChecklistStatus, String> statusLabels;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;

    return AppCard(
      child: Column(
        children: [
          for (var i = 0; i < items.length; i++)
            MergeSemantics(
              child: IntrinsicHeight(
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Column(
                      children: [
                        _StatusDot(status: items[i].$3, index: i + 1),
                        if (i < items.length - 1)
                          Expanded(
                            child: Container(
                              width: 2,
                              margin: const EdgeInsets.symmetric(
                                vertical: AppSpacing.xs,
                              ),
                              color: items[i].$3 == ChecklistStatus.done
                                  ? colors.gold
                                  : colors.border,
                            ),
                          ),
                      ],
                    ),
                    const SizedBox(width: AppSpacing.md),
                    Expanded(
                      child: Padding(
                        padding: EdgeInsets.only(
                          bottom: i < items.length - 1 ? AppSpacing.xl : 0,
                        ),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              items[i].$1,
                              style: typography.roleTitle.copyWith(
                                color: items[i].$3 == ChecklistStatus.locked
                                    ? colors.textSecondary
                                    : colors.text,
                              ),
                            ),
                            const SizedBox(height: AppSpacing.xs),
                            Text(
                              statusLabels[items[i].$3]!,
                              style: typography.caption.copyWith(
                                color: switch (items[i].$3) {
                                  ChecklistStatus.done => colors.success,
                                  ChecklistStatus.next => colors.goldDark,
                                  ChecklistStatus.locked =>
                                    colors.textSecondary,
                                },
                              ),
                            ),
                            if (items[i].$2 != null) ...[
                              const SizedBox(height: AppSpacing.xs),
                              Text(
                                items[i].$2!,
                                style: typography.bodySmall
                                    .copyWith(color: colors.textSecondary),
                              ),
                            ],
                          ],
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
        ],
      ),
    );
  }
}

class _StatusDot extends StatelessWidget {
  const _StatusDot({required this.status, required this.index});

  final ChecklistStatus status;
  final int index;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    final (fill, border, child) = switch (status) {
      ChecklistStatus.done => (
          colors.gold,
          colors.gold,
          AppIcon(
            AppIcons.checkRounded,
            size: AppSizes.iconSm,
            color: colors.navy,
          ) as Widget,
        ),
      ChecklistStatus.next => (
          colors.goldTint,
          colors.gold,
          Text(
            index.toString(),
            style: typography.caption.copyWith(color: colors.goldDark),
          ) as Widget,
        ),
      ChecklistStatus.locked => (
          colors.surface,
          colors.border,
          AppIcon(
            AppIcons.lockOutlineRounded,
            size: AppSpacing.lg,
            color: colors.textSecondary,
          ) as Widget,
        ),
    };
    return ExcludeSemantics(
      child: Container(
        width: AppSizes.rowMedallion - AppSpacing.sm,
        height: AppSizes.rowMedallion - AppSpacing.sm,
        alignment: Alignment.center,
        decoration: BoxDecoration(
          color: fill,
          shape: BoxShape.circle,
          border: Border.all(color: border, width: 1.5),
        ),
        child: child,
      ),
    );
  }
}
